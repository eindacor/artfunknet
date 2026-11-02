import { createHash } from "node:crypto";
import type { Db, Filter } from "mongodb";

import { OAUTH_PROVIDERS, type OAuthProvider } from "./oauth-providers.ts";
import {
  createPlayerAccountRecord,
  isDuplicateKeyError,
  normalizePlayerEmail,
  normalizeScreenName,
} from "./player-account.ts";

type OAuthAccount = {
  id: string;
  email: string | null;
  email_verified: boolean;
  email_verified_at?: Date;
  linked_at: Date;
  verified_at: Date;
};

export type OAuthPlayer = {
  _id: string;
  email: string;
  username?: string;
  password_hash?: string;
  screen_name: string;
  active: boolean;
  google_sub?: string;
  email_verified?: boolean;
  email_verified_at?: Date;
  account_emails?: string[];
  verified_emails?: string[];
  oauth_screen_name_pending?: boolean;
  profile: Record<string, unknown>;
  oauth_accounts?: Partial<Record<OAuthProvider, OAuthAccount>>;
};

export type OAuthIdentity = {
  provider: OAuthProvider;
  accountId: string;
  email?: string;
  emailVerified: boolean;
  displayName?: string;
};

export class OAuthIdentityError extends Error {
  readonly result: "conflict" | "existing-account" | "inactive";

  constructor(result: OAuthIdentityError["result"]) {
    super(result);
    this.result = result;
  }
}

export async function ensureOAuthIdentityIndexes(database: Db) {
  const players = database.collection("players");
  await Promise.all([
    ...OAUTH_PROVIDERS.map(({ id }) => players.createIndex(
      { [`oauth_accounts.${id}.id`]: 1 }, { unique: true, sparse: true },
    )),
    players.createIndex({ google_sub: 1 }, { unique: true, sparse: true }),
    database.collection("oauth_nonces").createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

export function findPlayerByAuthEmail(
  database: Db,
  email: string,
  options: { activeOnly?: boolean; excludePlayerId?: string } = {},
) {
  const normalized = normalizePlayerEmail(email);
  if (!normalized) return Promise.resolve(null);
  const match = { $regex: `^${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" };
  return database.collection<OAuthPlayer>("players").findOne({
    ...(options.activeOnly ? { active: true } : {}),
    ...(options.excludePlayerId ? { _id: { $ne: options.excludePlayerId } } : {}),
    $or: [
      { email: match }, { account_emails: normalized }, { verified_emails: normalized },
      ...OAUTH_PROVIDERS.map(({ id }) => ({ [`oauth_accounts.${id}.email`]: match })),
    ],
  });
}

export async function resolveOAuthIdentity(
  database: Db,
  identity: OAuthIdentity,
  syncPlayerId?: string,
): Promise<{ player: OAuthPlayer; accountCreated: boolean }> {
  const { provider, accountId, emailVerified } = identity;
  if (typeof accountId !== "string" || !accountId.trim() || accountId.length > 255) {
    throw new Error("Invalid provider account identifier.");
  }
  const players = database.collection<OAuthPlayer>("players");
  const identityPath = `oauth_accounts.${provider}.id`;
  const linked = await players.findOne({
    $or: [
      { [identityPath]: accountId },
      ...(provider === "google" ? [{ google_sub: accountId }] : []),
    ],
  });
  const email = normalizePlayerEmail(identity.email);
  const now = new Date();
  let player = syncPlayerId ? await players.findOne({ _id: syncPlayerId, active: true }) : linked;
  if (syncPlayerId && !player) throw new OAuthIdentityError("inactive");
  if (player && player.active !== true) throw new OAuthIdentityError("inactive");
  if (player && (
    (player.oauth_accounts?.[provider]?.id && player.oauth_accounts[provider]!.id !== accountId) ||
    (provider === "google" && player.google_sub && player.google_sub !== accountId)
  )) throw new OAuthIdentityError("conflict");

  if (syncPlayerId && player) {
    if ((linked && linked._id !== player._id) ||
        (email && await findPlayerByAuthEmail(database, email, { activeOnly: true, excludePlayerId: player._id }))) {
      throw new OAuthIdentityError("conflict");
    }
  }

  const account = (current?: OAuthAccount): OAuthAccount => ({
    id: accountId, email, email_verified: Boolean(email && emailVerified),
    ...(email && emailVerified ? { email_verified_at: now } : {}),
    linked_at: current?.linked_at ?? now, verified_at: now,
  });

  if (!player) {
    if (email && await findPlayerByAuthEmail(database, email)) {
      throw new OAuthIdentityError("existing-account");
    }
    const hash = createHash("sha256").update(`${provider}:${accountId}`).digest("hex");
    const storedEmail = email ?? `${provider}-${hash.slice(0, 20)}@oauth.artfunkel.invalid`;
    const fallback = provider.charAt(0).toUpperCase() + provider.slice(1);
    const candidate = (identity.displayName || email?.split("@")[0] || `${fallback}-Player`)
      .replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, "-").slice(0, 24);
    const baseName = normalizeScreenName(candidate) ?? `${fallback}-Player`;
    for (let suffix = 1; suffix <= 100; suffix++) {
      const screenName = suffix === 1 ? baseName : `${baseName.slice(0, 20)}-${suffix}`;
      const record: OAuthPlayer = {
        ...createPlayerAccountRecord({
          email: storedEmail, screenName, passwordSalt: "", passwordHash: "",
          playerId: hash.slice(0, 24), now,
        }),
        ...(email ? { account_emails: [email] } : {}),
        email_verified: Boolean(email && emailVerified),
        verified_emails: email && emailVerified ? [email] : [],
        ...(email && emailVerified ? { email_verified_at: now } : {}),
        ...(provider === "google" ? { google_sub: accountId } : {}),
        oauth_screen_name_pending: true,
        oauth_accounts: { [provider]: account() },
      };
      try {
        await players.insertOne(record);
        return { player: record, accountCreated: true };
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        const existing = await players.findOne({ [identityPath]: accountId });
        if (existing) return resolveOAuthIdentity(database, identity);
        if (email && await findPlayerByAuthEmail(database, email)) {
          throw new OAuthIdentityError("existing-account");
        }
      }
    }
    throw new Error("A unique player name could not be created.");
  }

  const updates: Record<string, unknown> = {
    [`oauth_accounts.${provider}`]: account(player.oauth_accounts?.[provider]),
    ...(provider === "google" ? { google_sub: accountId } : {}),
    ...(!syncPlayerId ? { "profile.last_login": now.toISOString() } : {}),
    updated_at: now,
  };
  if (email && syncPlayerId && player.email.endsWith("@oauth.artfunkel.invalid")) {
    updates.email = email;
    updates.username = email;
    updates.email_verified = emailVerified;
  }
  if (email && emailVerified && (email === normalizePlayerEmail(player.email) || updates.email === email)) {
    updates.email_verified = true;
    updates.email_verified_at = now;
  }
  const filter: Filter<OAuthPlayer> = { _id: player._id, active: true };
  if (syncPlayerId) {
    filter.$and = [
      { $or: [{ [identityPath]: { $exists: false } }, { [identityPath]: accountId }] },
      ...(provider === "google"
        ? [{ $or: [{ google_sub: { $exists: false } }, { google_sub: accountId }] }]
        : []),
    ];
  }
  try {
    const saved = await players.updateOne(filter, {
      $set: updates,
      ...(email && (emailVerified || syncPlayerId) ? {
        $addToSet: {
          ...(syncPlayerId ? { account_emails: email } : {}),
          ...(emailVerified ? { verified_emails: email } : {}),
        },
      } : {}),
    });
    if (!saved.matchedCount) throw new OAuthIdentityError(syncPlayerId ? "conflict" : "inactive");
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new OAuthIdentityError("conflict");
    throw error;
  }
  player = (await players.findOne({ _id: player._id }))!;
  return { player, accountCreated: false };
}
