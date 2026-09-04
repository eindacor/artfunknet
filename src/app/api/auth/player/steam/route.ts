import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { oauthCookieOptions } from "@/server/oauth-player";
import {
  getPublicBaseUrl,
  getPublicCallbackUrl,
} from "@/server/public-url";

export const STEAM_STATE_COOKIE = "artfunkel_steam_openid_state";
export const STEAM_OPENID_ENDPOINT =
  "https://steamcommunity.com/openid/login";

export function getSteamCallbackUrl(request: Request, state: string): string {
  const callback = new URL(
    getPublicCallbackUrl(
      request,
      "/api/auth/player/steam/callback",
      process.env.STEAM_OPENID_RETURN_URL,
    ),
  );
  callback.searchParams.set("state", state);
  return callback.toString();
}

export function getSteamRealm(request: Request): string {
  return process.env.STEAM_OPENID_REALM?.trim() || getPublicBaseUrl(request);
}

export async function GET(request: Request) {
  const state = randomBytes(32).toString("base64url");
  const authorization = new URL(STEAM_OPENID_ENDPOINT);
  authorization.searchParams.set(
    "openid.ns",
    "http://specs.openid.net/auth/2.0",
  );
  authorization.searchParams.set("openid.mode", "checkid_setup");
  authorization.searchParams.set(
    "openid.return_to",
    getSteamCallbackUrl(request, state),
  );
  authorization.searchParams.set("openid.realm", getSteamRealm(request));
  authorization.searchParams.set(
    "openid.identity",
    "http://specs.openid.net/auth/2.0/identifier_select",
  );
  authorization.searchParams.set(
    "openid.claimed_id",
    "http://specs.openid.net/auth/2.0/identifier_select",
  );

  const response = NextResponse.redirect(authorization);
  response.cookies.set(STEAM_STATE_COOKIE, state, oauthCookieOptions);
  return response;
}
