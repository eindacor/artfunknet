import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import type { Db } from "mongodb";

import {
  logOperationalError,
  logOperationalInfo,
} from "./operational-logging.ts";
import { isDuplicateKeyError } from "./player-account.ts";
import {
  parsePatreonIdentity,
  PatreonIntegrationError,
  type PatreonIdentityResponse,
  type PatreonMembershipSnapshot,
  type PatreonTier,
} from "./patreon-core.ts";

export {
  parsePatreonIdentity,
  PatreonIntegrationError,
  type PatreonIdentityResponse,
  type PatreonMembershipSnapshot,
} from "./patreon-core.ts";

const PATREON_TOKEN_URL = "https://www.patreon.com/api/oauth2/token";
const PATREON_IDENTITY_URL =
  "https://www.patreon.com/api/oauth2/v2/identity";
const PATREON_REQUEST_TIMEOUT_MS = 10_000;
const PATREON_TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export type PatreonAccount = {
  patreon_id: string;
  member_id: string | null;
  email: string | null;
  email_matches_player: boolean | null;
  full_name: string | null;
  is_supporter: boolean;
  patron_status: string | null;
  currently_entitled_amount_cents: number;
  tier_id: string | null;
  tier_name: string | null;
  tier_amount_cents: number | null;
  tiers: PatreonTier[];
  checked_at: Date;
  linked_at: Date;
  requires_reauthorization: boolean;
  oauth: {
    encrypted_tokens: string;
    access_token_expires_at: Date;
    scopes: string[];
  };
};

type PatreonPlayer = {
  _id: string;
  email: string;
  active: boolean;
  patreon?: Partial<PatreonAccount>;
};

export type PatreonTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

type StoredPatreonTokens = {
  accessToken: string;
  refreshToken: string;
};

let patreonIndexPromise: Promise<void> | undefined;

export function isPatreonIntegrationConfigured(): boolean {
  const encryptionKey = process.env.PATREON_TOKEN_ENCRYPTION_KEY?.trim();
  return Boolean(
    process.env.PATREON_CLIENT_ID?.trim() &&
      process.env.PATREON_CLIENT_SECRET?.trim() &&
      process.env.PATREON_CAMPAIGN_ID?.trim() &&
      encryptionKey &&
      encryptionKey.length >= 32,
  );
}

export function getPatreonClientId(): string {
  return getRequiredEnvironmentValue("PATREON_CLIENT_ID");
}

export async function exchangePatreonAuthorizationCode(
  code: string,
  redirectUri: string,
): Promise<PatreonTokenResponse> {
  return requestPatreonTokens({
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
}

export async function linkPatreonAccount(
  database: Db,
  playerId: string,
  tokens: PatreonTokenResponse,
): Promise<PatreonAccount> {
  await ensurePatreonIndex(database);
  const players = database.collection<PatreonPlayer>("players");
  const player = await players.findOne({ _id: playerId, active: true });
  if (!player) {
    throw new PatreonIntegrationError(
      "The active player account could not be found.",
      "invalid-response",
    );
  }

  const identity = await fetchPatreonIdentity(tokens.access_token);
  const snapshot = parsePatreonIdentity(
    identity,
    getRequiredEnvironmentValue("PATREON_CAMPAIGN_ID"),
    player.email,
  );
  const existingOwner = await players.findOne(
    {
      "patreon.patreon_id": snapshot.patreonId,
      _id: { $ne: player._id },
    },
    { projection: { _id: 1 } },
  );
  if (existingOwner) {
    throw new PatreonIntegrationError(
      "That Patreon account is already linked to another player.",
      "account-conflict",
    );
  }

  const now = new Date();
  const account = buildPatreonAccount(
    snapshot,
    tokens,
    player.patreon?.linked_at instanceof Date
      ? player.patreon.linked_at
      : now,
    now,
  );
  try {
    await players.updateOne(
      { _id: player._id },
      {
        $set: {
          patreon: account,
          updated_at: now,
        },
      },
    );
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    throw new PatreonIntegrationError(
      "That Patreon account is already linked to another player.",
      "account-conflict",
    );
  }
  logOperationalInfo("patreon.account_linked", {
    isSupporter: account.is_supporter,
    playerId: player._id,
    tierId: account.tier_id,
  });
  return account;
}

export async function syncPatreonMembershipAfterSignIn(
  database: Db,
  playerId: string,
): Promise<void> {
  try {
    const players = database.collection<PatreonPlayer>("players");
    const player = await players.findOne(
      { _id: playerId, active: true },
      {
        projection: {
          email: 1,
          patreon: 1,
        },
      },
    );
    if (!player?.patreon?.oauth?.encrypted_tokens) return;

    await syncLinkedPatreonAccount(database, player);
  } catch (error) {
    if (
      error instanceof PatreonIntegrationError &&
      error.code === "reauthorization-required"
    ) {
      try {
        await database.collection<PatreonPlayer>("players").updateOne(
          { _id: playerId },
          {
            $set: {
              "patreon.currently_entitled_amount_cents": 0,
              "patreon.is_supporter": false,
              "patreon.requires_reauthorization": true,
              "patreon.tier_amount_cents": null,
              "patreon.tier_id": null,
              "patreon.tier_name": null,
              "patreon.tiers": [],
              "patreon.last_sync_error":
                "Patreon authorization must be renewed.",
              "patreon.last_sync_attempt_at": new Date(),
            },
          },
        );
      } catch (persistenceError) {
        logOperationalError(
          "patreon.reauthorization_status_update_failed",
          persistenceError,
          { playerId },
        );
      }
    }
    logOperationalError("patreon.sign_in_sync_failed", error, { playerId });
  }
}

async function syncLinkedPatreonAccount(
  database: Db,
  player: PatreonPlayer,
): Promise<void> {
  const oauth = player.patreon?.oauth;
  if (!oauth?.encrypted_tokens) return;

  let storedTokens = decryptPatreonTokens(oauth.encrypted_tokens);
  let tokens: PatreonTokenResponse | null = null;
  const expiresAt = toDate(oauth.access_token_expires_at);
  if (
    !expiresAt ||
    expiresAt.getTime() <= Date.now() + PATREON_TOKEN_EXPIRY_BUFFER_MS
  ) {
    tokens = await refreshPatreonTokens(storedTokens.refreshToken);
    storedTokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    };
  }

  let identity: PatreonIdentityResponse;
  try {
    identity = await fetchPatreonIdentity(storedTokens.accessToken);
  } catch (error) {
    if (
      !(error instanceof PatreonIntegrationError) ||
      error.status !== 401 ||
      tokens
    ) {
      throw error;
    }
    tokens = await refreshPatreonTokens(storedTokens.refreshToken);
    storedTokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    };
    identity = await fetchPatreonIdentity(storedTokens.accessToken);
  }

  const snapshot = parsePatreonIdentity(
    identity,
    getRequiredEnvironmentValue("PATREON_CAMPAIGN_ID"),
    player.email,
  );
  if (
    player.patreon?.patreon_id &&
    player.patreon.patreon_id !== snapshot.patreonId
  ) {
    throw new PatreonIntegrationError(
      "Patreon returned a different linked account.",
      "invalid-response",
    );
  }

  const now = new Date();
  const tokenState =
    tokens ??
    tokenResponseFromStoredTokens(storedTokens, expiresAt, oauth.scopes);
  const account = buildPatreonAccount(
    snapshot,
    tokenState,
    toDate(player.patreon?.linked_at) ?? now,
    now,
  );
  await database.collection<PatreonPlayer>("players").updateOne(
    { _id: player._id },
    {
      $set: {
        patreon: account,
        updated_at: now,
      },
    },
  );
  logOperationalInfo("patreon.sign_in_sync_completed", {
    isSupporter: account.is_supporter,
    playerId: player._id,
    tierId: account.tier_id,
  });
}

async function fetchPatreonIdentity(
  accessToken: string,
): Promise<PatreonIdentityResponse> {
  const identityUrl = new URL(PATREON_IDENTITY_URL);
  identityUrl.searchParams.set(
    "include",
    "memberships.campaign,memberships.currently_entitled_tiers",
  );
  identityUrl.searchParams.set("fields[user]", "email,full_name");
  identityUrl.searchParams.set(
    "fields[member]",
    "patron_status,currently_entitled_amount_cents",
  );
  identityUrl.searchParams.set("fields[tier]", "title,amount_cents");
  const response = await fetch(identityUrl, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(PATREON_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new PatreonIntegrationError(
      `Patreon identity request returned HTTP ${response.status}.`,
      response.status === 401 ? "reauthorization-required" : "provider",
      response.status,
    );
  }
  return (await response.json()) as PatreonIdentityResponse;
}

async function refreshPatreonTokens(
  refreshToken: string,
): Promise<PatreonTokenResponse> {
  try {
    return await requestPatreonTokens({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  } catch (error) {
    if (
      error instanceof PatreonIntegrationError &&
      (error.status === 400 || error.status === 401)
    ) {
      throw new PatreonIntegrationError(
        "Patreon authorization must be renewed.",
        "reauthorization-required",
        error.status,
      );
    }
    throw error;
  }
}

async function requestPatreonTokens(
  parameters: Record<string, string>,
): Promise<PatreonTokenResponse> {
  const response = await fetch(PATREON_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...parameters,
      client_id: getRequiredEnvironmentValue("PATREON_CLIENT_ID"),
      client_secret: getRequiredEnvironmentValue("PATREON_CLIENT_SECRET"),
    }),
    signal: AbortSignal.timeout(PATREON_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new PatreonIntegrationError(
      `Patreon token request returned HTTP ${response.status}.`,
      "provider",
      response.status,
    );
  }
  const result = (await response.json()) as Partial<PatreonTokenResponse>;
  if (
    typeof result.access_token !== "string" ||
    !result.access_token ||
    typeof result.refresh_token !== "string" ||
    !result.refresh_token ||
    typeof result.expires_in !== "number" ||
    !Number.isFinite(result.expires_in)
  ) {
    throw new PatreonIntegrationError(
      "Patreon returned incomplete OAuth credentials.",
      "invalid-response",
    );
  }
  return {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    expires_in: Math.max(0, result.expires_in),
    scope: typeof result.scope === "string" ? result.scope : "",
    token_type:
      typeof result.token_type === "string" ? result.token_type : "Bearer",
  };
}

function buildPatreonAccount(
  snapshot: PatreonMembershipSnapshot,
  tokens: PatreonTokenResponse,
  linkedAt: Date,
  checkedAt: Date,
): PatreonAccount {
  return {
    patreon_id: snapshot.patreonId,
    member_id: snapshot.memberId,
    email: snapshot.email,
    email_matches_player: snapshot.emailMatchesPlayer,
    full_name: snapshot.fullName,
    is_supporter: snapshot.isSupporter,
    patron_status: snapshot.patronStatus,
    currently_entitled_amount_cents:
      snapshot.currentlyEntitledAmountCents,
    tier_id: snapshot.tierId,
    tier_name: snapshot.tierName,
    tier_amount_cents: snapshot.tierAmountCents,
    tiers: snapshot.tiers,
    checked_at: checkedAt,
    linked_at: linkedAt,
    requires_reauthorization: false,
    oauth: {
      encrypted_tokens: encryptPatreonTokens({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      }),
      access_token_expires_at: new Date(
        checkedAt.getTime() + tokens.expires_in * 1000,
      ),
      scopes: tokens.scope.split(/[\s,]+/).filter(Boolean),
    },
  };
}

function tokenResponseFromStoredTokens(
  tokens: StoredPatreonTokens,
  expiresAt: Date | null,
  scopes: string[] | undefined,
): PatreonTokenResponse {
  return {
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_in: expiresAt
      ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
      : 0,
    scope: (scopes ?? []).join(" "),
    token_type: "Bearer",
  };
}

function encryptPatreonTokens(tokens: StoredPatreonTokens): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(tokens), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

function decryptPatreonTokens(value: string): StoredPatreonTokens {
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split(".");
  if (
    version !== "v1" ||
    !encodedIv ||
    !encodedTag ||
    !encodedCiphertext
  ) {
    throw new PatreonIntegrationError(
      "The stored Patreon authorization is invalid.",
      "reauthorization-required",
    );
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(),
      Buffer.from(encodedIv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const tokens = JSON.parse(plaintext) as Partial<StoredPatreonTokens>;
    if (
      typeof tokens.accessToken !== "string" ||
      !tokens.accessToken ||
      typeof tokens.refreshToken !== "string" ||
      !tokens.refreshToken
    ) {
      throw new Error("Missing token values.");
    }
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  } catch (error) {
    throw new PatreonIntegrationError(
      `The stored Patreon authorization could not be decrypted: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "reauthorization-required",
    );
  }
}

function getEncryptionKey(): Buffer {
  const secret = getRequiredEnvironmentValue(
    "PATREON_TOKEN_ENCRYPTION_KEY",
  );
  if (secret.length < 32) {
    throw new PatreonIntegrationError(
      "PATREON_TOKEN_ENCRYPTION_KEY must contain at least 32 characters.",
      "configuration",
    );
  }
  return createHash("sha256")
    .update("artfunkel:patreon-oauth:v1")
    .update(secret)
    .digest();
}

function getRequiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new PatreonIntegrationError(
      `${name} is required for Patreon synchronization.`,
      "configuration",
    );
  }
  return value;
}

function ensurePatreonIndex(database: Db): Promise<void> {
  patreonIndexPromise ??= database
    .collection("players")
    .createIndex(
      { "patreon.patreon_id": 1 },
      { unique: true, sparse: true },
    )
    .then(() => undefined)
    .catch((error) => {
      patreonIndexPromise = undefined;
      throw error;
    });
  return patreonIndexPromise;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
