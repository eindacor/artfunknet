import { NextResponse } from "next/server";

import {
  PLAYER_SESSION_COOKIE,
  playerSessionCookieOptions,
} from "@/server/session";

export async function POST() {
  const response = NextResponse.json({ status: "ok" });
  response.cookies.set(PLAYER_SESSION_COOKIE, "", {
    ...playerSessionCookieOptions,
    maxAge: 0,
  });

  return response;
}
