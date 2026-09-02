import { NextResponse } from "next/server";

import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type Player = {
  _id: string;
  profile: {
    inventory_cap: number;
    expansion_slots: number;
    vintage_count: number;
  };
};

type ItemRecord = {
  _id: string;
  owner: string;
  status: string;
  original?: boolean;
  vintage?: boolean;
  date_received?: string;
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
    .findOne({ _id: auth.session.playerId });
  if (!player) {
    return NextResponse.json({ error: "Player was not found." }, { status: 404 });
  }

  const item = await database.collection<ItemRecord>("items").findOne({
    _id: id,
    owner: player._id,
    status: { $in: ["unclaimed", "won"] },
  });
  if (!item) {
    return NextResponse.json(
      { error: "This item can no longer be claimed." },
      { status: 409 },
    );
  }

  const consignedAuctions = await database
    .collection<{ item_id: string }>("auctions")
    .find({ seller_id: player._id })
    .project<{ item_id: string }>({ item_id: 1 })
    .toArray();
  const consignedItemIds = consignedAuctions.map((auction) => auction.item_id);
  const inventoryCount = await database
    .collection<ItemRecord>("items")
    .countDocuments({
      owner: player._id,
      $or: [
        { status: { $in: ["claimed", "displayed"] } },
        { _id: { $in: consignedItemIds }, status: "auctioned" },
      ],
      original: { $ne: true },
      vintage: { $ne: true },
    });
  const capacity =
    player.profile.inventory_cap +
    (player.profile.expansion_slots ?? 0) +
    (player.profile.vintage_count ?? 0) * 2;
  if (inventoryCount >= capacity && !item.original && !item.vintage) {
    return NextResponse.json(
      { error: "Your inventory is currently full." },
      { status: 409 },
    );
  }

  const result = await database.collection<ItemRecord>("items").updateOne(
    { _id: id, owner: player._id, status: { $in: ["unclaimed", "won"] } },
    {
      $set: {
        status: "claimed",
        date_received: new Date().toISOString(),
      },
    },
  );
  if (result.modifiedCount !== 1) {
    return NextResponse.json(
      { error: "This item can no longer be claimed." },
      { status: 409 },
    );
  }

  return NextResponse.json({ status: "ok" });
}
