import type { Db } from "mongodb";

import { selectLeastRepresentedEffect } from "./artwork-effects-core.ts";
import { withArtworkAssignmentLock } from "./artwork-effects.ts";
import type { Artwork, ItemAttribute } from "./gameplay.ts";

export async function withLeastRepresentedRareSpecialAttribute<T>(
  database: Db,
  operation: (attribute: ItemAttribute) => Promise<T>,
  random: () => number = Math.random,
): Promise<T> {
  return withArtworkAssignmentLock(database, async () => {
    const [attributes, counts] = await Promise.all([
      database
        .collection<ItemAttribute>("attributes")
        .find({ active: true })
        .sort({ _id: 1 })
        .toArray(),
      database
        .collection<Artwork>("artworks")
        .aggregate<{ _id: string; count: number }>([
          {
            $match: {
              rarity: "rare",
              "special_attributes.0": { $exists: true },
            },
          },
          { $unwind: "$special_attributes" },
          { $group: { _id: "$special_attributes", count: { $sum: 1 } } },
        ])
        .toArray(),
    ]);
    const selected = selectLeastRepresentedEffect(
      attributes,
      new Map(counts.map((entry) => [entry._id, entry.count])),
      random,
    );
    if (!selected) {
      throw new Error("No active artwork attribute is available.");
    }
    return operation(selected);
  });
}
