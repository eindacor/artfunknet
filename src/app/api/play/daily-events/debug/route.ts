import { NextResponse } from "next/server";

import {
  DailyEventDebugError,
  requireDailyEventDebugAccess,
} from "@/server/daily-event-debug";
import {
  drawForgeryContestForDebug,
  ForgeryContestError,
} from "@/server/forgery-contest";
import { getGameplaySettings } from "@/server/game-settings";
import { getDatabase } from "@/server/mongodb";
import { drawRaffleNow } from "@/server/raffle-gameplay";
import { rotateSeasonalArtworkNow } from "@/server/seasonal-daily-events";
import { requirePlayerApi } from "@/server/player-api";

type DebugAction = "draw-lottery" | "rotate-seasonals" | "settle-forgery";

export async function POST(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
  } | null;
  const action = body?.action;
  if (
    action !== "draw-lottery" &&
    action !== "rotate-seasonals" &&
    action !== "settle-forgery"
  ) {
    return NextResponse.json(
      { error: "Choose a valid Daily Events debug action." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  try {
    await requireDailyEventDebugAccess(database, auth.session.playerId);
    return await runDebugAction(database, action);
  } catch (error) {
    if (
      error instanceof DailyEventDebugError ||
      error instanceof ForgeryContestError
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Daily Events debug action failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The Daily Events debug action failed.",
      },
      { status: 409 },
    );
  }
}

async function runDebugAction(
  database: Awaited<ReturnType<typeof getDatabase>>,
  action: DebugAction,
) {
  if (action === "draw-lottery") {
    const settings = await getGameplaySettings(database);
    const state = await drawRaffleNow(database, settings.active);
    return NextResponse.json({
      status: "ok",
      message: "Lottery drawing completed.",
      nextDrawAt: state.next_draw_at,
    });
  }
  if (action === "rotate-seasonals") {
    await rotateSeasonalArtworkNow(database);
    return NextResponse.json({
      status: "ok",
      message: "Seasonal artworks changed.",
    });
  }
  await drawForgeryContestForDebug(database);
  return NextResponse.json({
    status: "ok",
    message: "Forgery Contest winners were drawn from the current vote totals.",
  });
}
