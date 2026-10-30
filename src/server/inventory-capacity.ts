import type { Db } from "mongodb";

import type { GameItem } from "./gameplay.ts";

type CapacityPlayer = {
  _id: string;
  profile: {
    inventory_cap: number;
    expansion_slots?: number;
  };
};

export async function hasInventorySpaceForItem(
  database: Db,
  player: CapacityPlayer,
  item: { original?: boolean; vintage?: boolean },
): Promise<boolean> {
  if (item.original || item.vintage) return true;

  const consignedAuctions = await database
    .collection<{ item_id: string }>("auctions")
    .find({ seller_id: player._id })
    .project<{ item_id: string }>({ item_id: 1 })
    .toArray();
  const inventoryCount = await database
    .collection<GameItem>("items")
    .countDocuments({
      owner: player._id,
      $or: [
        { status: { $in: ["claimed", "displayed"] } },
        {
          _id: { $in: consignedAuctions.map((auction) => auction.item_id) },
          status: "auctioned",
        },
      ],
      original: { $ne: true },
      vintage: { $ne: true },
    });
  const capacity =
    player.profile.inventory_cap + (player.profile.expansion_slots ?? 0);
  return inventoryCount < capacity;
}
