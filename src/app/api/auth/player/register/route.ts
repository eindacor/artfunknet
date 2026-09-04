import { NextResponse } from "next/server";

import { getDatabase } from "@/server/mongodb";
import { hashPassword, validatePassword } from "@/server/password";
import {
  createPlayerAccountRecord,
  ensurePlayerAccountIndexes,
  isDuplicateKeyError,
  normalizePlayerEmail,
  normalizeScreenName,
  type PlayerAccountRecord,
} from "@/server/player-account";
import {
  PLAYER_SESSION_COOKIE,
  createPlayerSessionToken,
  playerSessionCookieOptions,
} from "@/server/session";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "The registration request is invalid." },
      { status: 400 },
    );
  }

  const email = normalizePlayerEmail(body.email);
  const screenName = normalizeScreenName(body.screenName);
  const passwordError = validatePassword(body.password);

  if (!email) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }
  if (!screenName) {
    return NextResponse.json(
      {
        error:
          "Player name must be 3-24 letters, numbers, spaces, underscores, or hyphens.",
      },
      { status: 400 },
    );
  }
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  const password = body.password as string;
  const database = await getDatabase();
  await ensurePlayerAccountIndexes(database);
  const passwordCredentials = await hashPassword(password);
  const player = createPlayerAccountRecord({
    email,
    screenName,
    passwordSalt: passwordCredentials.salt,
    passwordHash: passwordCredentials.hash,
  });

  try {
    await database
      .collection<PlayerAccountRecord>("players")
      .insertOne(player);
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    return NextResponse.json(
      { error: "That email or player name is already in use." },
      { status: 409 },
    );
  }

  const response = NextResponse.json({ status: "ok" }, { status: 201 });
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
