import "server-only";

import { NextResponse } from "next/server";

import { getDatabase } from "@/server/mongodb";
import { createOperationId, logOperationalError, logOperationalInfo } from "@/server/operational-logging";
import { ensurePlayerAccountIndexes } from "@/server/player-account";
import { PLAYER_SESSION_COOKIE, createPlayerSessionToken, playerSessionCookieOptions } from "@/server/session";
import { getPublicBaseUrl } from "@/server/public-url";
import { syncPatreonMembershipAfterSignIn } from "./patreon.ts";
import { clearOAuthFlow, readOAuthFlow } from "./oauth-flow";
import { ensureOAuthIdentityIndexes, OAuthIdentityError, resolveOAuthIdentity, type OAuthIdentity } from "./oauth-identity.ts";
import type { OAuthProvider } from "./oauth-providers.ts";

export { oauthCookieOptions, readRequestCookie } from "./oauth-flow";
export type { OAuthProvider } from "./oauth-providers.ts";

let oauthIndexPromise: Promise<void> | undefined;

export function oauthFailure(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function isOAuthProviderConfigured(provider: OAuthProvider) {
  if (provider === "steam") return true;
  const prefix = provider.toUpperCase();
  return Boolean(process.env[`${prefix}_OAUTH_CLIENT_ID`]?.trim() &&
    process.env[`${prefix}_OAUTH_CLIENT_SECRET`]?.trim());
}

export function ensureOAuthIndexes(): Promise<void> {
  oauthIndexPromise ??= (async () => {
    const database = await getDatabase();
    await ensureOAuthIdentityIndexes(database);
  })().catch((error) => { oauthIndexPromise = undefined; throw error; });
  return oauthIndexPromise;
}

export async function completeOAuthPlayerSignIn({
  request, ...identity
}: OAuthIdentity & { request: Request }): Promise<NextResponse> {
  const { provider } = identity;
  const operationId = createOperationId(`oauth-${provider}`);
  const flow = await readOAuthFlow(request, provider);
  if (!flow) return clearOAuthFlow(oauthFailure("The authorization expired or the signed-in account changed. Please try again."), provider);
  const resultRedirect = (result: string) => {
    const url = new URL(flow.mode === "sync" ? "/play/account" : "/play/login", getPublicBaseUrl(request));
    url.searchParams.set("oauth", result);
    url.searchParams.set("provider", provider);
    return clearOAuthFlow(NextResponse.redirect(url, { status: 303 }), provider);
  };
  try {
    await ensureOAuthIndexes();
    const database = await getDatabase();
    await ensurePlayerAccountIndexes(database);
    const { player, accountCreated } = await resolveOAuthIdentity(
      database, identity, flow.mode === "sync" ? flow.playerId : undefined,
    );
    if (flow.mode === "signin") await syncPatreonMembershipAfterSignIn(database, player._id);
    const response = flow.mode === "sync"
      ? resultRedirect("updated")
      : clearOAuthFlow(NextResponse.redirect(new URL(
        accountCreated || player.oauth_screen_name_pending ? "/play/onboarding" : "/play",
        getPublicBaseUrl(request),
      )), provider);
    response.cookies.set(PLAYER_SESSION_COOKIE, await createPlayerSessionToken({
      playerId: player._id, email: player.email, screenName: player.screen_name,
    }), playerSessionCookieOptions);
    logOperationalInfo("oauth_player_sign_in.completed", {
      accountCreated, operationId, playerId: player._id, provider, mode: flow.mode,
    });
    return response;
  } catch (error) {
    if (error instanceof OAuthIdentityError) return resultRedirect(error.result);
    logOperationalError("oauth_player_sign_in.failed", error, {
      operationId, provider, mode: flow.mode,
    });
    return resultRedirect("failed");
  }
}
