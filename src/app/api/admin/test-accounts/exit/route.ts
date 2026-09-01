import { NextResponse } from "next/server";

import {
  PLAYER_SESSION_COOKIE,
  getAdminSession,
  playerSessionCookieOptions,
} from "@/server/session";

export async function POST() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json(
      { error: "Administrator authentication is required." },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ status: "ok" });
  response.cookies.set(PLAYER_SESSION_COOKIE, "", {
    ...playerSessionCookieOptions,
    maxAge: 0,
  });
  return response;
}
