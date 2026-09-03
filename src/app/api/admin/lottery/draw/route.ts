import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import { getGameplaySettings } from "@/server/game-settings";
import { getDatabase } from "@/server/mongodb";
import { drawRaffleNow } from "@/server/raffle-gameplay";

export async function POST() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const database = await getDatabase();
  const settings = await getGameplaySettings(database);
  try {
    const state = await drawRaffleNow(database, settings.active);
    return NextResponse.json({
      status: "ok",
      nextDrawAt: state.next_draw_at,
    });
  } catch (error) {
    console.error("Unable to draw lottery from admin", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The lottery could not be drawn.",
      },
      { status: 409 },
    );
  }
}
