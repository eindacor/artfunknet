import { NextResponse } from "next/server";

import type { GameItem } from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type Player = {
  _id: string;
  active: boolean;
  profile: { display_cap: number; last_gallery_payout?: string };
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const database = await getDatabase();
  const player = await database
    .collection<Player>("players")
    .findOne({ _id: auth.session.playerId, active: true });
  const item = await database.collection<GameItem>("items").findOne({
    _id: id,
    owner: auth.session.playerId,
    status: "claimed",
    repairing: { $ne: true },
  });
  if (!player || !item) {
    return NextResponse.json(
      { error: "This item cannot currently be displayed." },
      { status: 409 },
    );
  }

  const [displayCount, duplicate] = await Promise.all([
    database
      .collection<GameItem>("items")
      .countDocuments({ owner: player._id, status: "displayed" }),
    database.collection<GameItem>("items").findOne({
      owner: player._id,
      artwork_id: item.artwork_id,
      $or: [{ status: "displayed" }, { permanent: true }],
    }),
  ]);
  if (duplicate) {
    return NextResponse.json(
      { error: "An item of this artwork is already on display." },
      { status: 409 },
    );
  }
  if (displayCount >= player.profile.display_cap) {
    return NextResponse.json(
      { error: "You have reached your display limit." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const result = await database.collection<GameItem>("items").updateOne(
    { _id: item._id, owner: player._id, status: "claimed" },
    { $set: { status: "displayed", time_displayed: now } },
  );
  if (result.modifiedCount !== 1) {
    return NextResponse.json(
      { error: "This item changed before it could be displayed." },
      { status: 409 },
    );
  }
  await database.collection<Player>("players").updateOne(
    { _id: player._id },
    {
      $set: {
        "profile.last_activity": now,
      },
    },
  );
  await database.collection<Player>("players").updateOne(
    {
      _id: player._id,
      "profile.last_gallery_payout": { $exists: false },
    },
    { $set: { "profile.last_gallery_payout": now } },
  );

  return NextResponse.json({ status: "ok" });
}
