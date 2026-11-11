import { NextResponse } from "next/server";

import { getDailyEventAttention } from "@/server/daily-event-attention";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

export async function GET() {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  try {
    const database = await getDatabase();
    return NextResponse.json(
      await getDailyEventAttention(database, auth.session.playerId),
    );
  } catch (error) {
    console.error("Unable to load daily event reminders", error);
    return NextResponse.json(
      { error: "Daily event reminders are temporarily unavailable." },
      { status: 500 },
    );
  }
}
