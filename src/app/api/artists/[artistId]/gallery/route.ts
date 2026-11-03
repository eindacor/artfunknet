import { NextResponse } from "next/server";

import { getDatabase } from "@/server/mongodb";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ artistId: string }> },
) {
  const { artistId } = await params;
  const database = await getDatabase();
  const player = await database
    .collection<{ _id: string; artist_id: string; active: boolean; account_deletion?: boolean }>("players")
    .findOne(
      { artist_id: artistId, active: true, account_deletion: { $ne: true } },
      { projection: { _id: 1 } },
    );

  return NextResponse.json(
    { playerId: player?._id ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
