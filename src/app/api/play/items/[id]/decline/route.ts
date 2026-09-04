import { NextResponse } from "next/server";

import { deleteCommunityReactions } from "@/server/community-reaction-cleanup";
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
  const result = await database.collection<{ _id: string; owner: string; status: string }>("items").deleteOne({
    _id: id,
    owner: auth.session.playerId,
    status: { $in: ["unclaimed", "for_sale", "won"] },
  });
  if (result.deletedCount !== 1) {
    return NextResponse.json(
      { error: "This item can no longer be declined." },
      { status: 409 },
    );
  }
  await deleteCommunityReactions(database, "item", [id]);

  return NextResponse.json({ status: "ok" });
}
