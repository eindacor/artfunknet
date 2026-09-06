import { NextResponse } from "next/server";

import { refreshGalleryMetadata } from "@/server/gallery-metadata";
import { getDatabase } from "@/server/mongodb";
import {
  ensurePlayerAccountIndexes,
  isDuplicateKeyError,
  normalizeScreenName,
} from "@/server/player-account";
import {
  PLAYER_SESSION_COOKIE,
  createPlayerSessionToken,
  getPlayerSession,
  playerSessionCookieOptions,
} from "@/server/session";

type OAuthPlayer = {
  _id: string;
  active: boolean;
  email: string;
  screen_name: string;
  oauth_screen_name_pending?: boolean;
};

export async function POST(request: Request) {
  const session = await getPlayerSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "The player-name request is invalid." },
      { status: 400 },
    );
  }

  const screenName = normalizeScreenName(body.screenName);
  if (!screenName) {
    return NextResponse.json(
      {
        error:
          "Player name must be 3-24 letters, numbers, underscores, or hyphens.",
      },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  await ensurePlayerAccountIndexes(database);
  const players = database.collection<OAuthPlayer>("players");

  try {
    const player = await players.findOneAndUpdate(
      {
        _id: session.playerId,
        active: true,
        oauth_screen_name_pending: true,
      },
      {
        $set: {
          screen_name: screenName,
          "profile.screen_name": screenName,
          updated_at: new Date(),
        },
        $unset: { oauth_screen_name_pending: "" },
      },
      { returnDocument: "after" },
    );
    if (!player) {
      return NextResponse.json(
        { error: "Player-name setup has already been completed." },
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
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    return NextResponse.json(
      { error: "That player name is already in use." },
      { status: 409 },
    );
  }
}
