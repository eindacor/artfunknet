import { createHash, randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { oauthCookieOptions } from "@/server/oauth-player";
import { getPublicCallbackUrl } from "@/server/public-url";

export const MICROSOFT_STATE_COOKIE = "artfunkel_microsoft_oauth_state";
export const MICROSOFT_VERIFIER_COOKIE = "artfunkel_microsoft_oauth_verifier";
export const MICROSOFT_NONCE_COOKIE = "artfunkel_microsoft_oauth_nonce";

export function getMicrosoftRedirectUri(request: Request): string {
  return getPublicCallbackUrl(
    request,
    "/api/auth/player/microsoft/callback",
    process.env.MICROSOFT_OAUTH_REDIRECT_URI,
  );
}

export async function GET(request: Request) {
  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json(
      { error: "Microsoft sign-in is not configured." },
      { status: 503 },
    );
  }

  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authorization = new URL(
    "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
  );
  authorization.searchParams.set("client_id", clientId);
  authorization.searchParams.set(
    "redirect_uri",
    getMicrosoftRedirectUri(request),
  );
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("response_mode", "query");
  authorization.searchParams.set("scope", "openid profile email");
  authorization.searchParams.set("state", state);
  authorization.searchParams.set("nonce", nonce);
  authorization.searchParams.set("code_challenge", challenge);
  authorization.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authorization);
  response.cookies.set(MICROSOFT_STATE_COOKIE, state, oauthCookieOptions);
  response.cookies.set(MICROSOFT_VERIFIER_COOKIE, verifier, oauthCookieOptions);
  response.cookies.set(MICROSOFT_NONCE_COOKIE, nonce, oauthCookieOptions);
  return response;
}
