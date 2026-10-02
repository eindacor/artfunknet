import { NextResponse } from "next/server";

import {
  DailyEventDebugError,
  getDailyEventRequestContext,
  parseDailyEventDebugMode,
} from "@/server/daily-event-debug";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import {
  getSeasonalEventView,
  THURSDAY_DAY_INDEX,
} from "@/server/seasonal-daily-events";

export async function GET(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;
  try {
    const database = await getDatabase();
    const context = await getDailyEventRequestContext({
      database,
      day: THURSDAY_DAY_INDEX,
      mode: parseDailyEventDebugMode(
        new URL(request.url).searchParams.get("debugDayMode"),
      ),
      playerId: auth.session.playerId,
    });
    return NextResponse.json({
      ...(await getSeasonalEventView(database, context.now)),
      activeToday: context.activeToday,
    });
  } catch (error) {
    if (error instanceof DailyEventDebugError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Unable to load seasonal daily event", error);
    return NextResponse.json(
      { error: "The seasonal event is temporarily unavailable." },
      { status: 500 },
    );
  }
}
