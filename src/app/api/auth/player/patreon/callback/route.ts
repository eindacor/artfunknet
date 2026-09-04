import { NextResponse } from "next/server";

import { getDatabase } from "@/server/mongodb";
import { logOperationalError } from "@/server/operational-logging";
import { getPlayerSession } from "@/server/session";

import {
  cookieOptions,
  getPatreonRedirectUri,
  PATREON_STATE_COOKIE,
} from "../route";

type PatreonIncluded = {
  id: string;
  type: string;
  attributes?: {
    full_name?: string;
    email?: string;
    patron_status?: string | null;
    title?: string;
    amount_cents?: number;
  };
  relationships?: {
    currently_entitled_tiers?: { data?: { id: string; type: string }[] };
    campaign?: { data?: { id: string; type: string } };
  };
};

type Player = {
  _id: string;
};

type PatreonIdentityResponse = {
  data?: {
    id: string;
    type: string;
    relationships?: {
      memberships?: { data?: { id: string; type: string }[] };
    };
  };
  included?: PatreonIncluded[];
};

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const session = await getPlayerSession();
  if (!session) return NextResponse.redirect(new URL("/play/login", request.url));
  const clientId = process.env.PATREON_CLIENT_ID?.trim();
  const clientSecret = process.env.PATREON_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return errorResponse("Patreon linking is not configured.", 503);

  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const stateCookie = (request.headers.get("cookie") ?? "").match(
    new RegExp(`${PATREON_STATE_COOKIE}=([^;]+)`),
  )?.[1];
  if (!code || !state || !stateCookie || state !== stateCookie) {
    return errorResponse("Patreon linking could not be verified.");
  }

  const redirectUri = getPatreonRedirectUri(request);
  const tokenResponse = await fetch("https://www.patreon.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenResponse.ok) {
    logOperationalError(
      "oauth_provider.token_exchange_failed",
      new Error(`Patreon returned HTTP ${tokenResponse.status}.`),
      { provider: "patreon", status: tokenResponse.status },
    );
    return errorResponse("Patreon linking could not be completed.", 502);
  }
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) return errorResponse("Patreon did not return an access token.", 502);

  const identityUrl = new URL("https://www.patreon.com/api/oauth2/v2/identity");
  identityUrl.searchParams.set("include", "memberships.currently_entitled_tiers");
  identityUrl.searchParams.set("fields[member]", "patron_status");
  identityUrl.searchParams.set("fields[tier]", "title,amount_cents");
  const identityResponse = await fetch(identityUrl, {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!identityResponse.ok) {
    logOperationalError(
      "oauth_provider.identity_request_failed",
      new Error(`Patreon returned HTTP ${identityResponse.status}.`),
      { provider: "patreon", status: identityResponse.status },
    );
    return errorResponse("Patreon membership details could not be loaded.", 502);
  }
  const identity = (await identityResponse.json()) as PatreonIdentityResponse;
  const included = identity.included ?? [];
  const campaignId = process.env.PATREON_CAMPAIGN_ID?.trim();
  const memberships = included.filter(
    (entry) =>
      entry.type === "member" &&
      (!campaignId || entry.relationships?.campaign?.data?.id === campaignId),
  );
  const tiers = memberships.flatMap((member) => {
    const ids = member.relationships?.currently_entitled_tiers?.data ?? [];
    return ids
      .map((tierRef) => included.find((entry) => entry.type === "tier" && entry.id === tierRef.id))
      .filter((tier): tier is PatreonIncluded => Boolean(tier));
  });
  const tier = tiers.sort(
    (left, right) => (right.attributes?.amount_cents ?? 0) - (left.attributes?.amount_cents ?? 0),
  )[0];
  const database = await getDatabase();
  await database.collection<Player>("players").updateOne(
    { _id: session.playerId },
    {
      $set: {
        patreon: {
          patreon_id: identity.data?.id,
          is_supporter: Boolean(tier),
          tier_id: tier?.id ?? null,
          tier_name: tier?.attributes?.title ?? null,
          tier_amount_cents: tier?.attributes?.amount_cents ?? null,
          checked_at: new Date(),
        },
      },
    },
  );
  const response = NextResponse.redirect(new URL("/play", request.url));
  response.cookies.set(PATREON_STATE_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  return response;
}
