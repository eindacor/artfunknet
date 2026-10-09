import { NextResponse } from "next/server";

import { getDatabase } from "@/server/mongodb";
import {
  createOperationId,
  logOperationalError,
} from "@/server/operational-logging";
import {
  exchangePatreonAuthorizationCode,
  linkPatreonAccount,
  PatreonIntegrationError,
} from "@/server/patreon";
import { readRequestCookie } from "@/server/oauth-player";
import { getPlayerSession } from "@/server/session";
import { getPublicBaseUrl } from "@/server/public-url";

import {
  cookieOptions,
  getPatreonRedirectUri,
  PATREON_STATE_COOKIE,
} from "../route";

function accountRedirect(request: Request, result: string) {
  const response = NextResponse.redirect(
    new URL(`/play/account?patreon=${result}`, getPublicBaseUrl(request)),
  );
  response.cookies.set(PATREON_STATE_COOKIE, "", {
    ...cookieOptions(),
    maxAge: 0,
  });
  return response;
}

export async function GET(request: Request) {
  const session = await getPlayerSession();
  if (!session) return NextResponse.redirect(new URL("/play/login", getPublicBaseUrl(request)));

  const url = new URL(request.url);
  if (url.searchParams.get("error")) {
    return accountRedirect(request, "cancelled");
  }
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const stateCookie = readRequestCookie(request, PATREON_STATE_COOKIE);
  if (
    !code ||
    !state ||
    !stateCookie ||
    stateCookie !== `${state}.${session.playerId}`
  ) {
    return accountRedirect(request, "invalid");
  }

  const operationId = createOperationId("patreon-link");
  try {
    const tokens = await exchangePatreonAuthorizationCode(
      code,
      getPatreonRedirectUri(request),
    );
    await linkPatreonAccount(
      await getDatabase(),
      session.playerId,
      tokens,
    );
    return accountRedirect(request, "updated");
  } catch (error) {
    logOperationalError("patreon.account_link_failed", error, {
      operationId,
      playerId: session.playerId,
    });
    if (
      error instanceof PatreonIntegrationError &&
      error.code === "account-conflict"
    ) {
      return accountRedirect(request, "conflict");
    }
    if (
      error instanceof PatreonIntegrationError &&
      error.code === "configuration"
    ) {
      return accountRedirect(request, "not-configured");
    }
    return accountRedirect(request, "failed");
  }
}
