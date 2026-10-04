import { NextResponse } from "next/server";

import { getDatabase } from "@/server/mongodb";
import {
  normalizePlayerEmail,
  type PlayerAccountRecord,
} from "@/server/player-account";
import { authenticatePlayerPassword } from "@/server/player-password-auth";
import {
  createPlayerSessionToken,
  PLAYER_SESSION_TTL_SECONDS,
} from "@/server/session";

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = (await request.json()) as {
      email?: unknown;
      password?: unknown;
    };
  } catch {
    return NextResponse.json(
      { error: "The sign-in request is invalid." },
      { status: 400 },
    );
  }
  const email = normalizePlayerEmail(body.email);
  if (!email || typeof body.password !== "string" || !body.password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const authentication = await authenticatePlayerPassword(
    database,
    email,
    body.password,
  );
  if (authentication.status === "invalid") {
    return NextResponse.json(
      { error: "Invalid player credentials." },
      { status: 401 },
    );
  }

  const { player } = authentication;
  const now = new Date();
  const accessToken = await createPlayerSessionToken({
    playerId: player._id,
    email: player.email,
    screenName: player.screen_name,
  });
  await database.collection<PlayerAccountRecord>("players").updateOne(
    { _id: player._id },
    {
      $set: {
        "profile.last_login": now.toISOString(),
        updated_at: now,
      },
    },
  );

  return NextResponse.json(
    {
      accessToken,
      tokenType: "Bearer",
      expiresIn: PLAYER_SESSION_TTL_SECONDS,
      player: {
        id: player._id,
        screenName: player.screen_name,
      },
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
