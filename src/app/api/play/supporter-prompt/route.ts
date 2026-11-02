import { NextResponse } from "next/server";

import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import { acknowledgeSupporterPrompt } from "@/server/supporter-prompt";

export async function PATCH() {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const acknowledgedAt = await acknowledgeSupporterPrompt(
    await getDatabase(),
    auth.session.playerId,
  );
  if (!acknowledgedAt) {
    return NextResponse.json(
      { error: "The player account is unavailable." },
      { status: 404 },
    );
  }
  return NextResponse.json({
    status: "ok",
    acknowledgedAt: acknowledgedAt.toISOString(),
  });
}
