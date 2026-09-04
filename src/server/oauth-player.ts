import "server-only";

import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { getDatabase } from "@/server/mongodb";
import { normalizeScreenName } from "@/server/player-account";
import {
  PLAYER_SESSION_COOKIE,
  createPlayerSessionToken,
  playerSessionCookieOptions,
} from "@/server/session";

export type OAuthProvider = "discord" | "microsoft" | "steam";

type OAuthPlayer = {
  [key: string]: unknown;
  _id: string;
  email: string;
  screen_name: string;
  active: boolean;
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
  })();
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
  await ensureOAuthIndexes();
  const database = await getDatabase();
  const players = database.collection<OAuthPlayer>("players");
  const identityPath = `oauth_accounts.${provider}.id`;
  let player = await players.findOne({ [identityPath]: accountId });
  const normalizedEmail = email?.trim().toLowerCase();

  if (player && player.active !== true) {
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
      !(await players.findOne({ email: normalizedEmail }, { projection: { _id: 1 } }))
        ? normalizedEmail
        : syntheticEmail;
    const baseName = safeScreenName(
      displayName,
      normalizedEmail,
      capitalize(provider),
    );
    const profile = {
      user_type: "player",
      screen_name: baseName,
      active: true,
      bank_balance: 100_000,
      card_style_consumables: {},
      last_drop: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      last_login: now.toISOString(),
      level: 0,
      xp: 0,
      karma: 0,
      lottery_tickets: 1,
      entry_fee: "medium",
      inventory_cap: 15,
      display_cap: 5,
      auction_cap: 8,
      ticket_cap: 3,
      pc_cap: 12,
      visitor_cap: 20,
      repairing_cap: 4,
      npcs_met: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
      completed_quests: 0,
      market_expert: { expiration: new Date(0).toISOString() },
    };
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
        oauth_accounts: {
          [provider]: {
            id: accountId,
            email: normalizedEmail ?? null,
            linked_at: now,
          },
        },
        profile: { ...profile, screen_name: screenName },
        created_at: now,
        updated_at: now,
      };
      try {
        await players.insertOne(newPlayer);
        player = newPlayer;
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
  return response;
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
