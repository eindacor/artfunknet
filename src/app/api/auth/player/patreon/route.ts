import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { getPublicCallbackUrl } from "@/server/public-url";
import { getPlayerSession } from "@/server/session";
import { getPublicBaseUrl } from "@/server/public-url";

export const PATREON_STATE_COOKIE = "artfunkel_patreon_oauth_state";

export function getPatreonRedirectUri(request: Request): string {
  return getPublicCallbackUrl(
    request,
    "/api/auth/player/patreon/callback",
    process.env.PATREON_REDIRECT_URI,
  );
}

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
    return NextResponse.redirect(new URL("/play/login", getPublicBaseUrl(request)));
  }
  const clientId = process.env.PATREON_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json({ error: "Patreon linking is not configured." }, { status: 503 });
  }
  const state = randomBytes(32).toString("base64url");
  const redirectUri = getPatreonRedirectUri(request);
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
