import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import {
  PLAYER_SESSION_COOKIE,
  createPlayerSessionToken,
  playerSessionCookieOptions,
} from "@/server/session";
import { getDatabase } from "@/server/mongodb";

import {
  getRedirectUri,
  oauthCookieOptions,
  STATE_COOKIE,
  VERIFIER_COOKIE,
} from "../route";

type GoogleUser = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

type GooglePlayer = {
  [key: string]: unknown;
  _id: string;
  email: string;
  screen_name: string;
  active: boolean;
  google_sub?: string;
  password_salt: string;
  password_hash: string;
  profile: Record<string, unknown>;
};

function failure(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function safeScreenName(name: string | undefined, email: string): string {
  const candidate = (name || email.split("@")[0])
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .trim()
    .slice(0, 24);
  return candidate || "Google Player";
}

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return failure("Google sign-in is not configured.", 503);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = request.headers.get("cookie") ?? "";
  const stateCookie = cookies.match(
    new RegExp(`${STATE_COOKIE}=([^;]+)`),
  )?.[1];
  const verifierCookie = cookies.match(
    new RegExp(`${VERIFIER_COOKIE}=([^;]+)`),
  )?.[1];
  if (!code || !state || !stateCookie || state !== stateCookie || !verifierCookie) {
    return failure("Google sign-in could not be verified.");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getRedirectUri(request),
      grant_type: "authorization_code",
      code_verifier: verifierCookie,
    }),
  });
  if (!tokenResponse.ok) {
    console.error("Google OAuth token exchange failed", await tokenResponse.text());
    return failure("Google sign-in could not be completed.", 502);
  }
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) return failure("Google did not return an access token.", 502);

  const userResponse = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    { headers: { authorization: `Bearer ${token.access_token}` } },
  );
  if (!userResponse.ok) {
    console.error("Google userinfo request failed", await userResponse.text());
    return failure("Google account details could not be loaded.", 502);
  }
  const googleUser = (await userResponse.json()) as GoogleUser;
  const email = googleUser.email?.trim().toLowerCase();
  if (!googleUser.sub || !email || googleUser.email_verified !== true) {
    return failure("Google returned an account without a verified email.");
  }

  const database = await getDatabase();
  const players = database.collection<GooglePlayer>("players");
  let player = await players.findOne({ google_sub: googleUser.sub });

  if (!player) {
    player = await players.findOne({
      email,
    });
    if (player?.google_sub && player.google_sub !== googleUser.sub) {
      return failure("That email is already linked to another Google account.", 409);
    }
  }

  if (player && player.active !== true) {
    return failure("This player account is inactive.", 403);
  }

  if (!player) {
    const baseName = safeScreenName(googleUser.name, email);
    let screenName = baseName;
    for (let suffix = 2; await players.findOne({ screen_name: screenName }); suffix += 1) {
      screenName = `${baseName.slice(0, 21)}-${suffix}`;
    }
    const playerId = createHash("sha256").update(`google:${googleUser.sub}`).digest("hex").slice(0, 24);
    const now = new Date();
    const profile = {
      user_type: "player",
      screen_name: screenName,
      active: true,
      bank_balance: 100_000,
      card_style_consumables: {},
      last_drop: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      last_login: now.toISOString(),
      level: 0,
      xp: 0,
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
    const newPlayer: GooglePlayer = {
      _id: playerId,
      email,
      username: email,
      screen_name: screenName,
      role: "player",
      test_account: false,
      active: true,
      google_sub: googleUser.sub,
      password_salt: "",
      password_hash: "",
      profile,
      created_at: now,
      updated_at: now,
    };
    await players.insertOne(newPlayer);
    player = newPlayer;
  } else {
    await players.updateOne(
      { _id: player._id },
      {
        $set: {
          google_sub: googleUser.sub,
          "profile.last_login": new Date().toISOString(),
          updated_at: new Date(),
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
  response.cookies.set(STATE_COOKIE, "", { ...oauthCookieOptions(), maxAge: 0 });
  response.cookies.set(VERIFIER_COOKIE, "", { ...oauthCookieOptions(), maxAge: 0 });
  return response;
}
