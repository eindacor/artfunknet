import { NextResponse } from "next/server";

import {
  DailyEventDebugError,
  getDailyEventRequestContext,
  parseDailyEventDebugMode,
} from "@/server/daily-event-debug";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import {
  claimFridayCrate,
  FRIDAY_DAY_INDEX,
  getFridayCrateView,
} from "@/server/seasonal-daily-events";

type Player = {
  _id: string;
  active: boolean;
  profile: { level: number };
};

export async function GET(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;
  try {
    const database = await getDatabase();
    const context = await getDailyEventRequestContext({
      database,
      day: FRIDAY_DAY_INDEX,
      mode: parseDailyEventDebugMode(
        new URL(request.url).searchParams.get("debugDayMode"),
      ),
      playerId: auth.session.playerId,
    });
    return NextResponse.json(
      await getFridayCrateView(
        database,
        auth.session.playerId,
        context.now,
        context.activeToday,
      ),
    );
  } catch (error) {
    return fridayErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;
  const database = await getDatabase();
  const body = (await request.json().catch(() => null)) as {
    debugDayMode?: unknown;
  } | null;
  const player = await database.collection<Player>("players").findOne({
    _id: auth.session.playerId,
    active: true,
  });
  if (!player) {
    return NextResponse.json(
      { error: "The active player could not be found." },
      { status: 404 },
    );
  }
  try {
    const context = await getDailyEventRequestContext({
      database,
      day: FRIDAY_DAY_INDEX,
      mode: parseDailyEventDebugMode(body?.debugDayMode),
      playerId: auth.session.playerId,
    });
    const items = await claimFridayCrate(
      database,
      player._id,
      player.profile.level,
      context.now,
      context.activeToday,
    );
    return NextResponse.json({
      status: "ok",
      itemCount: items.length,
      itemIds: items.map((item) => item._id),
      message: `${items.length} artworks were added to your offers.`,
    });
  } catch (error) {
    if (error instanceof DailyEventDebugError) {
      return fridayErrorResponse(error);
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The Friday crate could not be opened.",
      },
      { status: 409 },
    );
  }
}

function fridayErrorResponse(error: unknown) {
  if (error instanceof DailyEventDebugError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  console.error("Friday crate request failed", error);
  return NextResponse.json(
    { error: "The Friday event is temporarily unavailable." },
    { status: 500 },
  );
}
