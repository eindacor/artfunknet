import { NextResponse } from "next/server";
import { getBulkRevealPermission } from "@/server/bulk-sale";

import type { GameItem } from "@/server/gameplay";
import { refreshGalleryMetadata } from "@/server/gallery-metadata";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type Player = {
  _id: string;
  profile: {
    last_activity: string;
  };
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const database = await getDatabase();
  const body = await request.json().catch(() => null);
  if (body?.bulkAction === true) {
    const item = await database.collection<GameItem>("items").findOne({
      _id: id, owner: auth.session.playerId, status: "displayed",
    });
    if (!item) {
      return NextResponse.json({ error: "This item is not currently being featured." }, { status: 409 });
    }
    const bulkPermission = await getBulkRevealPermission(database, item, true);
    if (!bulkPermission.allowed) {
      return NextResponse.json({ error: bulkPermission.reason }, { status: 409 });
    }
  }
  const result = await database.collection<GameItem>("items").updateOne(
    { _id: id, owner: auth.session.playerId, status: "displayed" },
    {
      $set: { status: "claimed" },
      $unset: { time_displayed: "" },
    },
  );
  if (result.modifiedCount !== 1) {
    return NextResponse.json(
      { error: "This item is not currently being featured." },
      { status: 409 },
    );
  }
  await database.collection<Player>("players").updateOne(
    { _id: auth.session.playerId },
    { $set: { "profile.last_activity": new Date().toISOString() } },
  );
  await refreshGalleryMetadata(database, auth.session.playerId);

  return NextResponse.json({ status: "ok" });
}
