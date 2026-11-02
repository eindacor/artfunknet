import {
  completeOAuthPlayerSignIn, oauthCookieOptions, oauthFailure, readRequestCookie,
} from "@/server/oauth-player";
import { logOperationalError } from "@/server/operational-logging";
import { getInstagramRedirectUri, INSTAGRAM_STATE_COOKIE } from "../route";

type InstagramToken = { access_token?: string; data?: { access_token?: string }[] };
type InstagramUser = {
  id?: string;
  username?: string;
  name?: string;
  account_type?: string;
  data?: Omit<InstagramUser, "data">[];
};

export async function GET(request: Request) {
  const clientId = process.env.INSTAGRAM_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.INSTAGRAM_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return oauthFailure("Instagram sign-in is not configured.", 503);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || state !== readRequestCookie(request, INSTAGRAM_STATE_COOKIE)) {
    return oauthFailure("Instagram authorization was cancelled or could not be verified.");
  }
  try {
    const form = new FormData();
    form.set("client_id", clientId);
    form.set("client_secret", clientSecret);
    form.set("grant_type", "authorization_code");
    form.set("redirect_uri", getInstagramRedirectUri(request));
    form.set("code", code);
    const tokenResponse = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST", body: form,
    });
    if (!tokenResponse.ok) throw new Error(`Instagram token exchange returned HTTP ${tokenResponse.status}.`);
    const tokenBody = await tokenResponse.json() as InstagramToken;
    const accessToken = tokenBody.data?.[0]?.access_token ?? tokenBody.access_token;
    if (!accessToken) throw new Error("Instagram did not return an access token.");
    const userResponse = await fetch(
      "https://graph.instagram.com/v26.0/me?fields=id,user_id,username,name,account_type",
      { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" },
    );
    if (!userResponse.ok) throw new Error(`Instagram identity request returned HTTP ${userResponse.status}.`);
    const userBody = await userResponse.json() as InstagramUser;
    const user = userBody.data?.[0] ?? userBody;
    if (!user.id || typeof user.id !== "string" ||
        !["BUSINESS", "MEDIA_CREATOR"].includes(user.account_type?.toUpperCase() ?? "")) {
      return oauthFailure("Instagram requires a business or creator account.", 400);
    }
    const response = await completeOAuthPlayerSignIn({
      request, provider: "instagram", accountId: user.id,
      emailVerified: false, displayName: user.name || user.username,
    });
    response.cookies.set(INSTAGRAM_STATE_COOKIE, "", { ...oauthCookieOptions, maxAge: 0 });
    return response;
  } catch (error) {
    logOperationalError("oauth_provider.identity_verification_failed", error, { provider: "instagram" });
    return oauthFailure("Instagram authorization could not be completed. Please try again.", 502);
  }
}
