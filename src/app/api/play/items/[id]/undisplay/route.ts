import { NextResponse } from "next/server";

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
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const database = await getDatabase();
  const result = await database.collection<GameItem>("items").updateOne(
    { _id: id, owner: auth.session.playerId, status: "displayed" },
    {
      $set: { status: "claimed" },
      $unset: { time_displayed: "" },
    },
  );
  if (result.modifiedCount !== 1) {
    return NextResponse.json(
      { error: "This item is not currently displayed." },
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
