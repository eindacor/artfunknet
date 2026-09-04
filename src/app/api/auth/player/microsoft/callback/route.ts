import { createRemoteJWKSet, jwtVerify } from "jose";

import {
  completeOAuthPlayerSignIn,
  oauthCookieOptions,
  oauthFailure,
  readRequestCookie,
} from "@/server/oauth-player";
import { logOperationalError } from "@/server/operational-logging";

import {
  getMicrosoftRedirectUri,
  MICROSOFT_NONCE_COOKIE,
  MICROSOFT_STATE_COOKIE,
  MICROSOFT_VERIFIER_COOKIE,
} from "../route";

type MicrosoftUser = {
  sub?: string;
  name?: string;
  email?: string;
  preferred_username?: string;
  nonce?: string;
};

const microsoftKeys = createRemoteJWKSet(
  new URL(
    "https://login.microsoftonline.com/consumers/discovery/v2.0/keys",
  ),
);
const MICROSOFT_CONSUMER_ISSUER =
  "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0";

export async function GET(request: Request) {
  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return oauthFailure("Microsoft sign-in is not configured.", 503);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const verifier = readRequestCookie(request, MICROSOFT_VERIFIER_COOKIE);
  const nonce = readRequestCookie(request, MICROSOFT_NONCE_COOKIE);
  if (
    !code ||
    !state ||
    !verifier ||
    !nonce ||
    state !== readRequestCookie(request, MICROSOFT_STATE_COOKIE)
  ) {
    return oauthFailure("Microsoft sign-in could not be verified.");
  }

  const tokenResponse = await fetch(
    "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: getMicrosoftRedirectUri(request),
        grant_type: "authorization_code",
        code_verifier: verifier,
        scope: "openid profile email",
      }),
    },
  );
  if (!tokenResponse.ok) {
    logOperationalError(
      "oauth_provider.token_exchange_failed",
      new Error(`Microsoft returned HTTP ${tokenResponse.status}.`),
      { provider: "microsoft", status: tokenResponse.status },
    );
    return oauthFailure("Microsoft sign-in could not be completed.", 502);
  }
  const token = (await tokenResponse.json()) as { id_token?: string };
  if (!token.id_token) {
    return oauthFailure("Microsoft did not return an identity token.", 502);
  }

  let user: MicrosoftUser;
  try {
    const verified = await jwtVerify(token.id_token, microsoftKeys, {
      audience: clientId,
      issuer: MICROSOFT_CONSUMER_ISSUER,
      algorithms: ["RS256"],
    });
    user = verified.payload as MicrosoftUser;
  } catch (error) {
    logOperationalError("oauth_provider.identity_verification_failed", error, {
      provider: "microsoft",
    });
    return oauthFailure("Microsoft account details could not be verified.", 502);
  }
  if (!user.sub || user.nonce !== nonce) {
    return oauthFailure("Microsoft did not return an account identifier.", 502);
  }

  const response = await completeOAuthPlayerSignIn({
    request,
    provider: "microsoft",
    accountId: user.sub,
    email: user.email ?? user.preferred_username,
    emailVerified: false,
    displayName: user.name,
  });
  response.cookies.set(MICROSOFT_STATE_COOKIE, "", {
    ...oauthCookieOptions,
    maxAge: 0,
  });
  response.cookies.set(MICROSOFT_VERIFIER_COOKIE, "", {
    ...oauthCookieOptions,
    maxAge: 0,
  });
  response.cookies.set(MICROSOFT_NONCE_COOKIE, "", {
    ...oauthCookieOptions,
    maxAge: 0,
  });
  return response;
}
