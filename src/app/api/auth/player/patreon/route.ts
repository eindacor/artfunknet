import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { getPlayerSession } from "@/server/session";

export const PATREON_STATE_COOKIE = "artfunkel_patreon_oauth_state";

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    path: "/",
    maxAge: 10 * 60,
  };
}

export async function GET(request: Request) {
  if (!await getPlayerSession()) {
    return NextResponse.redirect(new URL("/play/login", request.url));
  }
  const clientId = process.env.PATREON_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json({ error: "Patreon linking is not configured." }, { status: 503 });
  }
  const state = randomBytes(32).toString("base64url");
  const redirectUri =
    process.env.PATREON_REDIRECT_URI?.trim() ||
    `${new URL(request.url).origin}/api/auth/player/patreon/callback`;
  const authorization = new URL("https://www.patreon.com/oauth2/authorize");
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("client_id", clientId);
  authorization.searchParams.set("redirect_uri", redirectUri);
  authorization.searchParams.set("scope", "identity identity[email]");
  authorization.searchParams.set("state", state);
  const response = NextResponse.redirect(authorization);
  response.cookies.set(PATREON_STATE_COOKIE, state, cookieOptions());
  return response;
}

export { cookieOptions };
