import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { beginOAuthFlow, oauthCookieOptions } from "@/server/oauth-flow";
import { getPublicCallbackUrl } from "@/server/public-url";

export const INSTAGRAM_STATE_COOKIE = "artfunkel_instagram_oauth_state";

export function getInstagramRedirectUri(request: Request) {
  return getPublicCallbackUrl(
    request, "/api/auth/player/instagram/callback", process.env.INSTAGRAM_OAUTH_REDIRECT_URI,
  );
}

export async function GET(request: Request) {
  const clientId = process.env.INSTAGRAM_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.INSTAGRAM_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Instagram sign-in is not configured." }, { status: 503 });
  }
  const state = randomBytes(32).toString("base64url");
  const authorization = new URL("https://www.instagram.com/oauth/authorize");
  authorization.searchParams.set("client_id", clientId);
  authorization.searchParams.set("redirect_uri", getInstagramRedirectUri(request));
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("scope", "instagram_business_basic");
  authorization.searchParams.set("force_reauth", "true");
  authorization.searchParams.set("state", state);
  const response = NextResponse.redirect(authorization, { status: 303 });
  response.cookies.set(INSTAGRAM_STATE_COOKIE, state, oauthCookieOptions);
  return beginOAuthFlow(request, "instagram", state, response);
}

export async function POST(request: Request) {
  return GET(request);
}
