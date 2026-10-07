import { NextResponse } from "next/server";

import { getLiveAuctionBroadcastView } from "@/server/live-auction-broadcast";
import { getDatabase } from "@/server/mongodb";

export const dynamic = "force-dynamic";

export async function GET() {
  const database = await getDatabase();
  const response = NextResponse.json(
    await getLiveAuctionBroadcastView(database),
  );
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate",
  );
  return response;
}
