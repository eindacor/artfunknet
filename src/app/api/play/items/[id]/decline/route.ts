import { NextResponse } from "next/server";

import { deleteCommunityReactions } from "@/server/community-reaction-cleanup";
import type { GameItem } from "@/server/gameplay";
import { transferIfHallOfFameItem } from "@/server/hall-of-fame";
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
  const item = await database.collection<GameItem>("items").findOne({
    _id: id,
    owner: auth.session.playerId,
    status: { $in: ["unclaimed", "for_sale", "won"] },
  });
  if (!item) {
    return NextResponse.json(
      { error: "This item can no longer be declined." },
      { status: 409 },
    );
  }
  const preserved = await transferIfHallOfFameItem(database, item);
  if (!preserved) {
    const result = await database.collection<GameItem>("items").deleteOne({
      _id: item._id,
      owner: item.owner,
      status: item.status,
    });
    if (result.deletedCount !== 1) {
      return NextResponse.json(
        { error: "This item can no longer be declined." },
        { status: 409 },
      );
    }
    await deleteCommunityReactions(database, "item", [id]);
  }

  return NextResponse.json({ status: "ok" });
}
