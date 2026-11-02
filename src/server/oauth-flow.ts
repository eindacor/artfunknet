import "server-only";

import { createHash } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { NextResponse } from "next/server";

import { getBearerToken } from "./authorization.ts";
import type { OAuthProvider } from "./oauth-providers.ts";
import { getPublicBaseUrl } from "./public-url";
import { getPlayerSession, PLAYER_SESSION_COOKIE } from "./session";

export const oauthCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.SESSION_COOKIE_SECURE === "true",
  path: "/",
  maxAge: 10 * 60,
};

export function readRequestCookie(request: Request, name: string): string | undefined {
  return (request.headers.get("cookie") ?? "")
    .match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];
}

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  return new TextEncoder().encode(value);
}

function sessionBinding(request: Request) {
  const token = getBearerToken(request.headers.get("authorization")) ??
    readRequestCookie(request, PLAYER_SESSION_COOKIE);
  return token ? createHash("sha256").update(token).digest("hex") : null;
}

function intentCookie(provider: OAuthProvider) {
  return `artfunkel_${provider}_oauth_intent`;
}

export async function beginOAuthFlow(
  request: Request,
  provider: OAuthProvider,
  state: string,
  response: NextResponse,
) {
  const syncing = request.method === "POST";
  const session = syncing ? await getPlayerSession() : null;
  if (syncing) {
    if (request.headers.get("origin") !== new URL(getPublicBaseUrl(request)).origin) {
      return NextResponse.json({ error: "Start account sync from Account settings." }, { status: 403 });
    }
    if (!session || !sessionBinding(request)) {
      return NextResponse.json({ error: "Sign in before syncing an account." }, { status: 401 });
    }
  }
  const intent = await new SignJWT({
    provider, state, mode: syncing ? "sync" : "signin",
    ...(session ? { playerId: session.playerId, sessionBinding: sessionBinding(request) } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("artfunkel-oauth")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret());
  response.cookies.set(intentCookie(provider), intent, oauthCookieOptions);
  return response;
}

export async function readOAuthFlow(request: Request, provider: OAuthProvider) {
  const token = readRequestCookie(request, intentCookie(provider));
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ["HS256"], audience: "artfunkel-oauth",
    });
    if (payload.provider !== provider ||
        payload.state !== new URL(request.url).searchParams.get("state")) return null;
    if (payload.mode === "signin") return { mode: "signin" as const };
    if (payload.mode !== "sync") return null;
    const session = await getPlayerSession();
    if (!session || payload.playerId !== session.playerId ||
        payload.sessionBinding !== sessionBinding(request)) return null;
    return { mode: "sync" as const, playerId: session.playerId };
  } catch {
    return null;
  }
}

export function clearOAuthFlow(response: NextResponse, provider: OAuthProvider) {
  response.cookies.set(intentCookie(provider), "", { ...oauthCookieOptions, maxAge: 0 });
  return response;
}
