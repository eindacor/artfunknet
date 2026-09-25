import { NextResponse } from "next/server";

import { getHallOfFameDisplayRecords } from "@/server/hall-of-fame";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

export async function GET() {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const database = await getDatabase();
  const records = await getHallOfFameDisplayRecords(database);

  return NextResponse.json({ records });
}
