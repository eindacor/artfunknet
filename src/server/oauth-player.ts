import "server-only";

import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { getDatabase } from "@/server/mongodb";
import {
  createOperationId,
  logOperationalError,
  logOperationalInfo,
} from "@/server/operational-logging";
import {
  createDefaultPlayerProfile,
  ensurePlayerAccountIndexes,
  normalizeScreenName,
} from "@/server/player-account";
import {
  PLAYER_SESSION_COOKIE,
  createPlayerSessionToken,
  playerSessionCookieOptions,
} from "@/server/session";

export type OAuthProvider = "discord" | "google" | "microsoft" | "steam";

type OAuthPlayer = {
  [key: string]: unknown;
  _id: string;
  email: string;
  screen_name: string;
  active: boolean;
  google_sub?: string;
  profile: Record<string, unknown>;
  oauth_accounts?: Partial<
    Record<
      OAuthProvider,
      {
        id: string;
        email: string | null;
        linked_at: Date;
      }
    >
  >;
};

let oauthIndexPromise: Promise<void> | undefined;

export const oauthCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.SESSION_COOKIE_SECURE === "true",
  path: "/",
  maxAge: 10 * 60,
};

export function readRequestCookie(
  request: Request,
  name: string,
): string | undefined {
  return (request.headers.get("cookie") ?? "")
    .match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];
}

export function oauthFailure(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function ensureOAuthIndexes(): Promise<void> {
  oauthIndexPromise ??= (async () => {
    const database = await getDatabase();
    const players = database.collection("players");
    await Promise.all([
      players.createIndex(
        { "oauth_accounts.google.id": 1 },
        { unique: true, sparse: true },
      ),
      players.createIndex(
        { google_sub: 1 },
        { unique: true, sparse: true },
      ),
      players.createIndex(
        { "oauth_accounts.discord.id": 1 },
        { unique: true, sparse: true },
      ),
      players.createIndex(
        { "oauth_accounts.microsoft.id": 1 },
        { unique: true, sparse: true },
      ),
      players.createIndex(
        { "oauth_accounts.steam.id": 1 },
        { unique: true, sparse: true },
      ),
      database
        .collection("oauth_nonces")
        .createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
    ]);
  })().catch((error) => {
    oauthIndexPromise = undefined;
    throw error;
  });
  return oauthIndexPromise;
}

export async function completeOAuthPlayerSignIn({
  request,
  provider,
  accountId,
  email,
  emailVerified,
  displayName,
}: {
  request: Request;
  provider: OAuthProvider;
  accountId: string;
  email?: string;
  emailVerified: boolean;
  displayName?: string;
}): Promise<NextResponse> {
  const operationId = createOperationId(`oauth-${provider}`);
  let accountCreated = false;
  try {
    await ensureOAuthIndexes();
    const database = await getDatabase();
    await ensurePlayerAccountIndexes(database);
    const players = database.collection<OAuthPlayer>("players");
    const identityPath = `oauth_accounts.${provider}.id`;
    let player = await players.findOne({ [identityPath]: accountId });
    const normalizedEmail = email?.trim().toLowerCase();
    if (!player && provider === "google") {
      player = await players.findOne({
        $or: [
          { google_sub: accountId },
          ...(normalizedEmail && emailVerified
            ? [{ email: normalizedEmail }]
            : []),
        ],
      });
      if (player?.google_sub && player.google_sub !== accountId) {
        return oauthFailure(
          "That email is already linked to another Google account.",
          409,
        );
      }
    }

    if (player && player.active !== true) {
      logOperationalInfo("oauth_player_sign_in.inactive", {
        operationId,
        provider,
        playerId: player._id,
      });
      return oauthFailure("This player account is inactive.", 403);
    }

    const now = new Date();
    if (!player) {
      const providerHash = createHash("sha256")
        .update(`${provider}:${accountId}`)
        .digest("hex");
      const playerId = providerHash.slice(0, 24);
      const syntheticEmail =
        `${provider}-${providerHash.slice(0, 20)}@oauth.artfunkel.invalid`;
      let storedEmail =
        normalizedEmail &&
        emailVerified &&
        !(await players.findOne(
          { email: normalizedEmail },
          { projection: { _id: 1 } },
        ))
          ? normalizedEmail
          : syntheticEmail;
      const baseName = safeScreenName(
        displayName,
        normalizedEmail,
        capitalize(provider),
      );
      for (let suffix = 1; suffix <= 100 && !player; suffix += 1) {
        const screenName =
          suffix === 1 ? baseName : `${baseName.slice(0, 21)}-${suffix}`;
        const newPlayer: OAuthPlayer = {
          _id: playerId,
          email: storedEmail,
          username: storedEmail,
          screen_name: screenName,
          role: "player",
          test_account: false,
          active: true,
          password_salt: "",
          password_hash: "",
          ...(provider === "google" ? { google_sub: accountId } : {}),
          oauth_accounts: {
            [provider]: {
              id: accountId,
              email: normalizedEmail ?? null,
              linked_at: now,
            },
          },
          profile: createDefaultPlayerProfile(screenName, now),
          created_at: now,
          updated_at: now,
        };
        try {
          await players.insertOne(newPlayer);
          player = newPlayer;
          accountCreated = true;
        } catch (error) {
          if (!isDuplicateKeyError(error)) throw error;
          player = await players.findOne({ [identityPath]: accountId });
          if (
            !player &&
            storedEmail !== syntheticEmail &&
            (await players.findOne(
              { email: storedEmail },
              { projection: { _id: 1 } },
            ))
          ) {
            storedEmail = syntheticEmail;
          }
        }
      }
      if (!player) {
        throw new Error("A unique player account could not be created.");
      }
    } else {
      await players.updateOne(
        { _id: player._id },
        {
          $set: {
            [`oauth_accounts.${provider}`]: {
              id: accountId,
              email: normalizedEmail ?? null,
              linked_at: now,
            },
            ...(provider === "google" ? { google_sub: accountId } : {}),
            "profile.last_login": now.toISOString(),
            updated_at: now,
          },
        },
      );
    }

    const response = NextResponse.redirect(new URL("/play", request.url));
    response.cookies.set(
      PLAYER_SESSION_COOKIE,
      await createPlayerSessionToken({
        playerId: player._id,
        email: player.email,
        screenName: player.screen_name,
      }),
      playerSessionCookieOptions,
    );
    logOperationalInfo("oauth_player_sign_in.completed", {
      accountCreated,
      operationId,
      playerId: player._id,
      provider,
    });
    return response;
  } catch (error) {
    logOperationalError("oauth_player_sign_in.failed", error, {
      accountCreated,
      emailVerified,
      hasEmail: Boolean(email),
      operationId,
      provider,
    });
    return oauthFailure(
      `The player account could not be prepared. Reference: ${operationId}`,
      500,
    );
  }
}

function safeScreenName(
  name: string | undefined,
  email: string | undefined,
  fallback: string,
): string {
  const candidate = (name || email?.split("@")[0] || `${fallback} Player`)
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 24);
  return normalizeScreenName(candidate) ?? `${fallback}-Player`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}
