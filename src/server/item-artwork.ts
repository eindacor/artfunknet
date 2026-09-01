import type { Db } from "mongodb";

import type { Artwork, GameItem } from "./gameplay.ts";

export type HydratedGameItem = GameItem & {
  artwork: Artwork;
};

export async function hydrateGameItems(
  database: Db,
  items: GameItem[],
): Promise<HydratedGameItem[]> {
  if (items.length === 0) return [];

  const artworkIds = [...new Set(items.map((item) => item.artwork_id))];
  const artworks = await database
    .collection<Artwork>("artworks")
    .find({ _id: { $in: artworkIds } })
    .project<Artwork>({ market_data: 0 })
    .toArray();
  const artworkById = new Map(
    artworks.map((artwork) => [artwork._id, artwork]),
  );

  return items.map((item) => {
    const artwork = artworkById.get(item.artwork_id);
    if (!artwork) {
      throw new Error(
        `Item ${item._id} references missing artwork ${item.artwork_id}.`,
      );
    }
    return {
      ...item,
      artwork: { ...artwork, ...item.artwork_overrides },
    };
  });
}
