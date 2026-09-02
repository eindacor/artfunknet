import type {
  ArtworkRarity,
  GameItem,
  LootData,
} from "./gameplay.ts";
import { ITEM_LEVEL_MAX } from "./item-level-constants.ts";

export type RerollAttributeType = "unlocked" | "locked" | "special";

const REROLL_COEFFICIENTS: Record<ArtworkRarity, number> = {
  common: 1.1,
  uncommon: 1.11,
  rare: 1.12,
  legendary: 1.13,
  masterpiece: 1.14,
};

const BASE_REROLL_MINIMUMS: Record<RerollAttributeType, number> = {
  unlocked: 0,
  locked: 0.5,
  special: 0.8,
};

export function getRerollCost(
  item: Pick<GameItem, "roll_count">,
  rarity: ArtworkRarity,
  lootData: Pick<LootData, "rarity_values">,
): number {
  const rollCount = Math.max(item.roll_count, 0);
  const baseCost = lootData.rarity_values[rarity].min * 0.1;
  return Math.floor(
    baseCost * Math.pow(REROLL_COEFFICIENTS[rarity], rollCount),
  );
}

export function getRerollMinimum(
  item: Pick<GameItem, "level" | "patreon">,
  attributeType: RerollAttributeType,
): number {
  let minimum = BASE_REROLL_MINIMUMS[attributeType];
  if (item.patreon) {
    minimum += (1 - minimum) * 0.1;
  }

  const remaining = 1 - minimum;
  const levelScale =
    (Math.min(Math.max(item.level, 1), ITEM_LEVEL_MAX) - 1) /
    (ITEM_LEVEL_MAX - 1);
  return minimum + remaining * levelScale * 0.5;
}

export function findAttributeType(
  item: {
    attributes: Record<
      RerollAttributeType,
      Array<{ _id: string }>
    >;
  },
  attributeId: string,
): RerollAttributeType | null {
  for (const type of ["unlocked", "locked", "special"] as const) {
    if (item.attributes[type].some((attribute) => attribute._id === attributeId)) {
      return type;
    }
  }
  return null;
}
