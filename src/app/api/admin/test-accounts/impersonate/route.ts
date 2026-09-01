import { NextResponse } from "next/server";

import { getDatabase } from "@/server/mongodb";
import {
  PLAYER_SESSION_COOKIE,
  createPlayerSessionToken,
  getAdminSession,
  playerSessionCookieOptions,
} from "@/server/session";

type ImpersonationRequest = {
  playerId?: unknown;
};

type TestPlayer = {
  _id: string;
  email: string;
  screen_name: string;
  active: boolean;
  test_account: boolean;
};

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json(
      { error: "Administrator authentication is required." },
      { status: 401 },
    );
  }

  const body = (await request.json()) as ImpersonationRequest;
  if (typeof body.playerId !== "string" || body.playerId.length === 0) {
    return NextResponse.json(
      { error: "A test player account is required." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const player = await database.collection<TestPlayer>("players").findOne({
    _id: body.playerId,
    active: true,
    test_account: true,
  });
  if (!player) {
    return NextResponse.json(
      { error: "The selected test player is unavailable." },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();
  await database.collection<TestPlayer>("players").updateOne(
    { _id: player._id, test_account: true },
    {
      $set: {
        "profile.last_login": now,
        last_impersonated_at: now,
        last_impersonated_by: admin.email,
      },
    },
  );

  const response = NextResponse.json({ status: "ok" });
  response.cookies.set(
    PLAYER_SESSION_COOKIE,
    await createPlayerSessionToken({
      playerId: player._id,
      email: player.email,
      screenName: player.screen_name,
    }),
    playerSessionCookieOptions,
  );
  return response;
}
