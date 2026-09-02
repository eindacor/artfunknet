import { NextResponse } from "next/server";

import type { ArtHistorianQuest } from "@/server/art-historian-gameplay";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const database = await getDatabase();
  const result = await database
    .collection<ArtHistorianQuest>("quests")
    .deleteOne({ _id: id, owner_id: auth.session.playerId });
  if (result.deletedCount !== 1) {
    return NextResponse.json(
      { error: "This Art Historian objective is unavailable." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    status: "ok",
    message: "Art Historian objective cancelled.",
  });
}
