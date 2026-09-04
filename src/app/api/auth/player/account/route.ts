import { NextResponse } from "next/server";

import { refreshGalleryMetadata } from "@/server/gallery-metadata";
import { getDatabase } from "@/server/mongodb";
import {
  hashPassword,
  validatePassword,
  verifyPassword,
} from "@/server/password";
import {
  isDuplicateKeyError,
  normalizeScreenName,
} from "@/server/player-account";
import {
  PLAYER_SESSION_COOKIE,
  createPlayerSessionToken,
  getPlayerSession,
  playerSessionCookieOptions,
} from "@/server/session";

type PlayerAccount = {
  _id: string;
  email: string;
  screen_name: string;
  active: boolean;
  password_salt: string;
  password_hash: string;
};

export async function PATCH(request: Request) {
  const session = await getPlayerSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "The account request is invalid." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const players = database.collection<PlayerAccount>("players");
  const player = await players.findOne({ _id: session.playerId, active: true });
  if (!player) {
    return NextResponse.json(
      { error: "The player account is unavailable." },
      { status: 404 },
    );
  }

  if (body.action === "profile") {
    const screenName = normalizeScreenName(body.screenName);
    if (!screenName) {
      return NextResponse.json(
        {
          error:
            "Player name must be 3-24 letters, numbers, spaces, underscores, or hyphens.",
        },
        { status: 400 },
      );
    }

    try {
      await players.updateOne(
        { _id: player._id },
        {
          $set: {
            screen_name: screenName,
            "profile.screen_name": screenName,
            updated_at: new Date(),
          },
        },
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      return NextResponse.json(
        { error: "That player name is already in use." },
        { status: 409 },
      );
    }
    await refreshGalleryMetadata(database, player._id);

    const response = NextResponse.json({ status: "ok", screenName });
    response.cookies.set(
      PLAYER_SESSION_COOKIE,
      await createPlayerSessionToken({
        playerId: player._id,
        email: player.email,
        screenName,
      }),
      playerSessionCookieOptions,
    );
    return response;
  }

  if (body.action === "password") {
    const passwordError = validatePassword(body.newPassword);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const hasPassword = Boolean(player.password_salt && player.password_hash);
    if (
      hasPassword &&
      (typeof body.currentPassword !== "string" ||
        !(await verifyPassword(
          body.currentPassword,
          player.password_salt,
          player.password_hash,
        )))
    ) {
      return NextResponse.json(
        { error: "The current password is incorrect." },
        { status: 401 },
      );
    }

    const credentials = await hashPassword(body.newPassword as string);
    await players.updateOne(
      { _id: player._id },
      {
        $set: {
          password_salt: credentials.salt,
          password_hash: credentials.hash,
          password_updated_at: new Date(),
          updated_at: new Date(),
        },
      },
    );
    return NextResponse.json({ status: "ok" });
  }

  return NextResponse.json(
    { error: "The requested account action is not supported." },
    { status: 400 },
  );
}
