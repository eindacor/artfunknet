import { NextResponse } from "next/server";

import { AccountDataBusyError } from "@/server/account-data-access";
import {
  ACCOUNT_DELETION_PHRASE,
  AccountDeletionError,
  deletePlayerAccount,
} from "@/server/account-deletion";
import { settleExpiredAuctions } from "@/server/auction-gameplay";
import { getDatabase } from "@/server/mongodb";
import { getPublicBaseUrl } from "@/server/public-url";
import {
  ADMIN_SESSION_COOKIE,
  PLAYER_SESSION_COOKIE,
  getPlayerSession,
  playerSessionCookieOptions,
} from "@/server/session";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(getPublicBaseUrl(request)).origin) {
    return NextResponse.json({ error: "Delete your account from Account settings." }, { status: 403 });
  }
  const session = await getPlayerSession({ accountErasure: true, allowDeleting: true });
  if (!session) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (body?.confirmation !== ACCOUNT_DELETION_PHRASE) {
    return NextResponse.json({ error: `Enter ${ACCOUNT_DELETION_PHRASE} exactly to confirm.` }, { status: 400 });
  }
  try {
    await deletePlayerAccount(
      await getDatabase({ accountErasure: true }),
      session.playerId,
      settleExpiredAuctions,
    );
  } catch (error) {
    if (error instanceof AccountDeletionError || error instanceof AccountDataBusyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Account deletion did not finish.");
    return NextResponse.json({
      error: "Deletion could not be confirmed. Retry here or contact artfunkelgame@gmail.com.",
    }, { status: 500 });
  }
  const response = NextResponse.json({ status: "deleted" }, {
    headers: { "Cache-Control": "private, no-store" },
  });
  const cookieNames = new Set([
    PLAYER_SESSION_COOKIE,
    ...(request.headers.get("cookie") ?? "").split(";")
      .map((entry) => entry.trim().split("=")[0])
      .filter((name) => name.startsWith("artfunkel_") && name !== ADMIN_SESSION_COOKIE),
  ]);
  for (const name of cookieNames) {
    response.cookies.set(name, "", { ...playerSessionCookieOptions, maxAge: 0 });
  }
  return response;
}
