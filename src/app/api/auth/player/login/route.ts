import { NextResponse } from "next/server";

import { getDatabase } from "@/server/mongodb";
import { verifyPassword } from "@/server/password";
import {
  PLAYER_SESSION_COOKIE,
  createPlayerSessionToken,
  playerSessionCookieOptions,
} from "@/server/session";

type Player = {
  _id: string;
  email: string;
  screen_name: string;
  active: boolean;
  password_salt: string;
  password_hash: string;
  profile: {
    last_login: string;
  };
};

export async function POST(request: Request) {
  const body = (await request.json()) as {
    email?: string;
    password?: string;
  };
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const player = await database
    .collection<Player>("players")
    .findOne({ email });
  const valid =
    player?.active === true &&
    (await verifyPassword(
      password,
      player.password_salt,
      player.password_hash,
    ));

  if (!valid) {
    return NextResponse.json(
      { error: "Invalid player credentials." },
      { status: 401 },
    );
  }

  await database.collection<Player>("players").updateOne(
    { _id: player._id },
    {
      $set: {
        "profile.last_login": new Date().toISOString(),
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
