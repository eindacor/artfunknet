import {
  completeOAuthPlayerSignIn,
  oauthCookieOptions,
  oauthFailure,
  readRequestCookie,
} from "@/server/oauth-player";
import { logOperationalError } from "@/server/operational-logging";

import {
  DISCORD_STATE_COOKIE,
  getDiscordRedirectUri,
} from "../route";

type DiscordUser = {
  id?: string;
  username?: string;
  global_name?: string | null;
  email?: string | null;
  verified?: boolean;
};

export async function GET(request: Request) {
  const clientId = process.env.DISCORD_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.DISCORD_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return oauthFailure("Discord sign-in is not configured.", 503);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (
    !code ||
    !state ||
    state !== readRequestCookie(request, DISCORD_STATE_COOKIE)
  ) {
    return oauthFailure("Discord sign-in could not be verified.");
  }

  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: getDiscordRedirectUri(request),
    }),
  });
  if (!tokenResponse.ok) {
    logOperationalError(
      "oauth_provider.token_exchange_failed",
      new Error(`Discord returned HTTP ${tokenResponse.status}.`),
      { provider: "discord", status: tokenResponse.status },
    );
    return oauthFailure("Discord sign-in could not be completed.", 502);
  }
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) {
    return oauthFailure("Discord did not return an access token.", 502);
  }

  const userResponse = await fetch("https://discord.com/api/users/@me", {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!userResponse.ok) {
    logOperationalError(
      "oauth_provider.identity_request_failed",
      new Error(`Discord returned HTTP ${userResponse.status}.`),
      { provider: "discord", status: userResponse.status },
    );
    return oauthFailure("Discord account details could not be loaded.", 502);
  }
  const user = (await userResponse.json()) as DiscordUser;
  if (!user.id) {
    return oauthFailure("Discord did not return an account identifier.", 502);
  }

  const response = await completeOAuthPlayerSignIn({
    request,
    provider: "discord",
    accountId: user.id,
    email: user.email ?? undefined,
    emailVerified: user.verified === true,
    displayName: user.global_name || user.username,
  });
  response.cookies.set(DISCORD_STATE_COOKIE, "", {
    ...oauthCookieOptions,
    maxAge: 0,
  });
  return response;
}
