import type { Db } from "mongodb";

import {
  calculateItemValues,
  type Artwork,
  type GameItem,
  type LootData,
} from "./gameplay.ts";
import { getArtworkEffect } from "./artwork-effects.ts";
import { MASTERPIECE_EFFECT_CODES } from "./masterpiece-effects.ts";

export type DemintUpdate = Pick<
  GameItem,
  "condition" | "mint" | "mint_value_multiplier" | "values"
>;

export async function getDemintUpdate(
  database: Db,
  item: GameItem,
  changes: Partial<GameItem> = {},
): Promise<DemintUpdate | null> {
  if (!item.mint) return null;

  const [artwork, metadata] = await Promise.all([
    database.collection<Artwork>("artworks").findOne({
      _id: item.artwork_id,
    }),
    database
      .collection<{ _id: string; loot_data: LootData }>("metadata")
      .findOne({ _id: "loot-data" }),
  ]);
  if (!artwork || !metadata) {
    throw new Error("This item's value data is unavailable.");
  }
  if (changes.status === "displayed") {
    const effect = await getArtworkEffect(database, artwork);
    if (effect?.code === MASTERPIECE_EFFECT_CODES.preservationMint) {
      return null;
    }
  }

  const demintedItem = {
    ...item,
    ...changes,
    condition: 1,
    mint: false,
    mint_value_multiplier: 1,
  };

  return {
    condition: 1,
    mint: false,
    mint_value_multiplier: 1,
    values: calculateItemValues(
      demintedItem,
      { ...artwork, ...item.artwork_overrides },
      metadata.loot_data,
    ),
  };
}
