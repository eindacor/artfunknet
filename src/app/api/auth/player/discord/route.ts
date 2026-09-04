import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { oauthCookieOptions } from "@/server/oauth-player";
import { getPublicCallbackUrl } from "@/server/public-url";

export const DISCORD_STATE_COOKIE = "artfunkel_discord_oauth_state";

export function getDiscordRedirectUri(request: Request): string {
  return getPublicCallbackUrl(
    request,
    "/api/auth/player/discord/callback",
    process.env.DISCORD_OAUTH_REDIRECT_URI,
  );
}

export async function GET(request: Request) {
  const clientId = process.env.DISCORD_OAUTH_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json(
      { error: "Discord sign-in is not configured." },
      { status: 503 },
    );
  }

  const state = randomBytes(32).toString("base64url");
  const authorization = new URL("https://discord.com/oauth2/authorize");
  authorization.searchParams.set("client_id", clientId);
  authorization.searchParams.set("redirect_uri", getDiscordRedirectUri(request));
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("scope", "identify email");
  authorization.searchParams.set("state", state);
  authorization.searchParams.set("prompt", "consent");

  const response = NextResponse.redirect(authorization);
  response.cookies.set(DISCORD_STATE_COOKIE, state, oauthCookieOptions);
  return response;
}
