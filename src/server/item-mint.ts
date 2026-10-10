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

export type MintSensitiveAction =
  | "art-style"
  | "display"
  | "level"
  | "reroll";

export type MintState = Pick<
  GameItem,
  "condition" | "mint" | "mint_value_multiplier"
>;

export function getMintStateAfterAction(
  item: Pick<GameItem, "condition" | "mint" | "mint_value_multiplier">,
  effectCode: string | undefined,
  action: MintSensitiveAction,
): MintState {
  const preserveMint =
    item.mint &&
    effectCode === MASTERPIECE_EFFECT_CODES.preservationMint &&
    action !== "art-style";

  return {
    condition: item.mint ? 1 : item.condition,
    mint: preserveMint,
    mint_value_multiplier: preserveMint ? item.mint_value_multiplier : 1,
  };
}

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
  const effect = await getArtworkEffect(database, artwork);
  const mintState = getMintStateAfterAction(
    item,
    effect?.code,
    changes.status === "displayed" ? "display" : "art-style",
  );
  if (mintState.mint) return null;

  const demintedItem = {
    ...item,
    ...changes,
    ...mintState,
  };

  return {
    ...mintState,
    values: calculateItemValues(
      demintedItem,
      { ...artwork, ...item.artwork_overrides },
      metadata.loot_data,
    ),
  };
}
