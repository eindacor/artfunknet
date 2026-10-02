import { NextResponse } from "next/server";

import {
  DailyEventDebugError,
  getDailyEventRequestContext,
  parseDailyEventDebugMode,
} from "@/server/daily-event-debug";
import {
  LIVE_AUCTION_DAY_INDEX,
  getLiveAuctionPublicView,
  LiveAuctionError,
  placeLiveAuctionBid,
} from "@/server/live-auction-event";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

export async function GET(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  try {
    const database = await getDatabase();
    const context = await getDailyEventRequestContext({
      database,
      day: LIVE_AUCTION_DAY_INDEX,
      mode: parseDailyEventDebugMode(
        new URL(request.url).searchParams.get("debugDayMode"),
      ),
      playerId: auth.session.playerId,
    });
    return NextResponse.json({
      ...(await getLiveAuctionPublicView(database)),
      activeToday: context.activeToday,
    });
  } catch (error) {
    return liveAuctionErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as {
    amount?: unknown;
    debugDayMode?: unknown;
  } | null;
  if (typeof body?.amount !== "number") {
    return NextResponse.json(
      { error: "Provide a whole-dollar bid amount." },
      { status: 400 },
    );
  }

  try {
    const database = await getDatabase();
    const result = await placeLiveAuctionBid(
      database,
      auth.session.playerId,
      body.amount,
    );
    return NextResponse.json({
      status: "ok",
      bankBalance: result.bankBalance,
      message: `Bid $${body.amount.toLocaleString()} in the live auction.`,
    });
  } catch (error) {
    return liveAuctionErrorResponse(error);
  }
}

function liveAuctionErrorResponse(error: unknown) {
  if (
    error instanceof LiveAuctionError ||
    error instanceof DailyEventDebugError
  ) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  throw error;
}
