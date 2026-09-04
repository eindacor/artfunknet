import {
  completeOAuthPlayerSignIn,
  ensureOAuthIndexes,
  oauthCookieOptions,
  oauthFailure,
  readRequestCookie,
} from "@/server/oauth-player";
import { getDatabase } from "@/server/mongodb";
import {
  collectUniqueSteamOpenIdParameters,
  hasRequiredSteamSignedFields,
  isRecentSteamNonce,
} from "@/server/steam-openid";
import { logOperationalError } from "@/server/operational-logging";

import {
  getSteamCallbackUrl,
  STEAM_OPENID_ENDPOINT,
  STEAM_STATE_COOKIE,
} from "../route";

const STEAM_ID_PATTERN =
  /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  if (!state || state !== readRequestCookie(request, STEAM_STATE_COOKIE)) {
    return oauthFailure("Steam sign-in could not be verified.");
  }
  const openid = collectUniqueSteamOpenIdParameters(url.searchParams);
  if (!openid) {
    return oauthFailure("Steam returned duplicate identity parameters.");
  }
  if (openid.get("openid.mode") !== "id_res") {
    return oauthFailure("Steam sign-in was cancelled or rejected.");
  }

  const claimedId = openid.get("openid.claimed_id");
  const identity = openid.get("openid.identity");
  const endpoint = openid.get("openid.op_endpoint");
  const returnTo = openid.get("openid.return_to");
  const nonce = openid.get("openid.response_nonce");
  const match = claimedId?.match(STEAM_ID_PATTERN);
  if (
    openid.get("openid.ns") !== "http://specs.openid.net/auth/2.0" ||
    !hasRequiredSteamSignedFields(openid.get("openid.signed")) ||
    !match ||
    identity !== claimedId ||
    endpoint !== STEAM_OPENID_ENDPOINT ||
    returnTo !== getSteamCallbackUrl(request, state) ||
    !nonce ||
    !isRecentSteamNonce(nonce)
  ) {
    return oauthFailure("Steam returned an invalid identity response.");
  }

  const verification = new URLSearchParams(openid);
  verification.set("openid.mode", "check_authentication");
  const verificationResponse = await fetch(STEAM_OPENID_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: verification,
  });
  const verificationBody = await verificationResponse.text();
  if (
    !verificationResponse.ok ||
    !verificationBody.split(/\r?\n/).includes("is_valid:true")
  ) {
    logOperationalError(
      "oauth_provider.identity_verification_failed",
      new Error(
        verificationResponse.ok
          ? "Steam rejected the signed OpenID response."
          : `Steam returned HTTP ${verificationResponse.status}.`,
      ),
      { provider: "steam", status: verificationResponse.status },
    );
    return oauthFailure("Steam sign-in could not be completed.", 502);
  }

  await ensureOAuthIndexes();
  const database = await getDatabase();
  const nonces = database.collection<{ _id: string; expires_at: Date }>(
    "oauth_nonces",
  );
  try {
    await nonces.insertOne({
      _id: `steam:${nonce}`,
      expires_at: new Date(Date.now() + 30 * 60 * 1000),
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return oauthFailure("That Steam sign-in response was already used.");
    }
    throw error;
  }

  const steamId = match[1];
  const response = await completeOAuthPlayerSignIn({
    request,
    provider: "steam",
    accountId: steamId,
    emailVerified: false,
    displayName: `Steam ${steamId.slice(-6)}`,
  });
  response.cookies.set(STEAM_STATE_COOKIE, "", {
    ...oauthCookieOptions,
    maxAge: 0,
  });
  return response;
}
