import { NextResponse } from "next/server";

import type { HallOfFameRecord } from "@/server/hall-of-fame";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

export async function GET() {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const database = await getDatabase();
  const records = await database
    .collection<HallOfFameRecord>("hall_of_fame")
    .find()
    .sort({ created_at: -1 })
    .toArray();

  return NextResponse.json({ records });
}
