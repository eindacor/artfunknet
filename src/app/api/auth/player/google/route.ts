import { createHash, randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { getPublicCallbackUrl } from "@/server/public-url";

const STATE_COOKIE = "artfunkel_google_oauth_state";
const VERIFIER_COOKIE = "artfunkel_google_oauth_verifier";

function oauthCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    path: "/",
    maxAge: 10 * 60,
  };
}

function getRedirectUri(request: Request): string {
  return getPublicCallbackUrl(
    request,
    "/api/auth/player/google/callback",
    process.env.GOOGLE_OAUTH_REDIRECT_URI,
  );
}

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json(
      { error: "Google sign-in is not configured." },
      { status: 503 },
    );
  }

  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.searchParams.set("client_id", clientId);
  authorization.searchParams.set("redirect_uri", getRedirectUri(request));
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("scope", "openid email profile");
  authorization.searchParams.set("state", state);
  authorization.searchParams.set("code_challenge", challenge);
  authorization.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authorization);
  const options = oauthCookieOptions();
  response.cookies.set(STATE_COOKIE, state, options);
  response.cookies.set(VERIFIER_COOKIE, verifier, options);
  return response;
}

export { STATE_COOKIE, VERIFIER_COOKIE, getRedirectUri, oauthCookieOptions };
