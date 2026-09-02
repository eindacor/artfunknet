import { NextResponse } from "next/server";

import type { GameItem } from "@/server/gameplay";
import { getDemintUpdate } from "@/server/item-mint";
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
    status: "claimed",
  });
  if (!item) {
    return NextResponse.json(
      { error: "This item cannot be offered to Art Collectors." },
      { status: 409 },
    );
  }

  const offered = item.tags.includes("for sale");
  let mintUpdate = {};
  try {
    mintUpdate = (await getDemintUpdate(database, item)) ?? {};
  } catch (error) {
    console.error("Unable to remove Mint before changing Collector offer", error);
    return NextResponse.json(
      { error: "This item's value data is unavailable." },
      { status: 500 },
    );
  }
  const result = await database.collection<GameItem>("items").updateOne(
    {
      _id: item._id,
      owner: auth.session.playerId,
      status: "claimed",
      mint: item.mint,
      tags: offered ? "for sale" : { $ne: "for sale" },
    },
    offered
      ? { $set: mintUpdate, $pull: { tags: "for sale" } }
      : { $set: mintUpdate, $addToSet: { tags: "for sale" } },
  );
  if (result.modifiedCount !== 1) {
    return NextResponse.json(
      { error: "This item's Collector availability changed." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    status: "ok",
    message: offered
      ? "Removed this artwork from your Collector offerings."
      : "Added this artwork to your Collector offerings.",
  });
}
