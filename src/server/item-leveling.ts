import {
  convertUnitValueToKnowledge,
  getItemKnowledgeUnitValue,
  type KnowledgeReward,
} from "./art-expert-gameplay.ts";
import type { ArtworkRarity } from "./gameplay.ts";
export { ITEM_LEVEL_MAX } from "./item-level-constants.ts";

export const PRESERVATIONIST_ATTRIBUTE_ID = "zR2KgxYe4LQZKBAiE";
export const LEVEL_UP_DISCOUNT_MULTIPLIER = 0.8;

export function getItemLevelUpCost(
  rarity: ArtworkRarity,
  level: number,
  discounted: boolean,
): KnowledgeReward {
  const unitCost = getItemKnowledgeUnitValue(rarity, level) * 3;
  return convertUnitValueToKnowledge(
    Math.floor(
      unitCost * (discounted ? LEVEL_UP_DISCOUNT_MULTIPLIER : 1),
    ),
  );
}

export function canAffordItemLevelUp(
  available: Readonly<Record<keyof KnowledgeReward, number>>,
  cost: KnowledgeReward,
): boolean {
  return Object.entries(cost).every(
    ([type, amount]) =>
      (available[type as keyof KnowledgeReward] ?? 0) >= amount,
  );
}
