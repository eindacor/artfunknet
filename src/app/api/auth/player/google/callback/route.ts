import {
  completeOAuthPlayerSignIn,
  oauthFailure,
} from "@/server/oauth-player";
import { logOperationalError } from "@/server/operational-logging";

import {
  getRedirectUri,
  oauthCookieOptions,
  STATE_COOKIE,
  VERIFIER_COOKIE,
} from "../route";

type GoogleUser = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

function failure(message: string, status = 400) {
  return oauthFailure(message, status);
}

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return failure("Google sign-in is not configured.", 503);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = request.headers.get("cookie") ?? "";
  const stateCookie = cookies.match(
    new RegExp(`${STATE_COOKIE}=([^;]+)`),
  )?.[1];
  const verifierCookie = cookies.match(
    new RegExp(`${VERIFIER_COOKIE}=([^;]+)`),
  )?.[1];
  if (!code || !state || !stateCookie || state !== stateCookie || !verifierCookie) {
    return failure("Google sign-in could not be verified.");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getRedirectUri(request),
      grant_type: "authorization_code",
      code_verifier: verifierCookie,
    }),
  });
  if (!tokenResponse.ok) {
    logOperationalError(
      "oauth_provider.token_exchange_failed",
      new Error(`Google returned HTTP ${tokenResponse.status}.`),
      { provider: "google", status: tokenResponse.status },
    );
    return failure("Google sign-in could not be completed.", 502);
  }
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) return failure("Google did not return an access token.", 502);

  const userResponse = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    { headers: { authorization: `Bearer ${token.access_token}` } },
  );
  if (!userResponse.ok) {
    logOperationalError(
      "oauth_provider.identity_request_failed",
      new Error(`Google returned HTTP ${userResponse.status}.`),
      { provider: "google", status: userResponse.status },
    );
    return failure("Google account details could not be loaded.", 502);
  }
  const googleUser = (await userResponse.json()) as GoogleUser;
  const email = googleUser.email?.trim().toLowerCase();
  if (!googleUser.sub || !email || googleUser.email_verified !== true) {
    return failure("Google returned an account without a verified email.");
  }

  const response = await completeOAuthPlayerSignIn({
    request,
    provider: "google",
    accountId: googleUser.sub,
    email,
    emailVerified: true,
    displayName: googleUser.name,
  });
  response.cookies.set(STATE_COOKIE, "", { ...oauthCookieOptions(), maxAge: 0 });
  response.cookies.set(VERIFIER_COOKIE, "", { ...oauthCookieOptions(), maxAge: 0 });
  return response;
}
