import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import {
  acceptLiveAuctionBid,
  getLiveAuctionAdminView,
  LiveAuctionError,
  removeLiveAuctionBufferedItem,
  setLiveAuctionIncrement,
  setLiveAuctionStreamUrl,
  setLiveAuctionVisibility,
  startLiveAuction,
  stopLiveAuction,
} from "@/server/live-auction-event";
import { getDatabase } from "@/server/mongodb";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  return NextResponse.json(
    await getLiveAuctionAdminView(await getDatabase()),
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    increment?: unknown;
    streamUrl?: unknown;
  } | null;
  if (!body || typeof body.action !== "string") {
    return NextResponse.json(
      { error: "Choose a live-auction update." },
      { status: 400 },
    );
  }

  try {
    const database = await getDatabase();
    if (body.action === "stream") {
      if (typeof body.streamUrl !== "string") {
        return NextResponse.json(
          { error: "Provide a stream URL." },
          { status: 400 },
        );
      }
      await setLiveAuctionStreamUrl(
        database,
        body.streamUrl,
        auth.session.email,
      );
    } else if (body.action === "increment") {
      if (typeof body.increment !== "number") {
        return NextResponse.json(
          { error: "Provide a whole-dollar minimum increment." },
          { status: 400 },
        );
      }
      await setLiveAuctionIncrement(
        database,
        body.increment,
        auth.session.email,
      );
    } else if (body.action === "show" || body.action === "hide") {
      await setLiveAuctionVisibility(
        database,
        body.action === "hide",
        auth.session.email,
      );
    } else {
      return NextResponse.json(
        { error: "That live-auction update is unsupported." },
        { status: 400 },
      );
    }
    return NextResponse.json({
      status: "ok",
      view: await getLiveAuctionAdminView(database),
    });
  } catch (error) {
    return liveAuctionErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
  } | null;
  if (!body || typeof body.action !== "string") {
    return NextResponse.json(
      { error: "Choose a live-auction action." },
      { status: 400 },
    );
  }

  try {
    const database = await getDatabase();
    if (body.action === "start") {
      await startLiveAuction(database, auth.session.email);
    } else if (body.action === "accept") {
      await acceptLiveAuctionBid(database, auth.session.email);
    } else if (body.action === "stop") {
      await stopLiveAuction(database, auth.session.email);
    } else {
      return NextResponse.json(
        { error: "That live-auction action is unsupported." },
        { status: 400 },
      );
    }
    return NextResponse.json({
      status: "ok",
      view: await getLiveAuctionAdminView(database),
    });
  } catch (error) {
    return liveAuctionErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as {
    itemId?: unknown;
  } | null;
  if (!body || typeof body.itemId !== "string") {
    return NextResponse.json(
      { error: "Choose a live-auction buffer item to remove." },
      { status: 400 },
    );
  }

  try {
    const database = await getDatabase();
    await removeLiveAuctionBufferedItem(
      database,
      body.itemId,
      auth.session.email,
    );
    return NextResponse.json({
      status: "ok",
      view: await getLiveAuctionAdminView(database),
    });
  } catch (error) {
    return liveAuctionErrorResponse(error);
  }
}

function liveAuctionErrorResponse(error: unknown) {
  if (error instanceof LiveAuctionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  throw error;
}
