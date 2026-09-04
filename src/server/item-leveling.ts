import type { GameItem } from "./gameplay.ts";
export { ITEM_LEVEL_MAX } from "./item-level-constants.ts";

export const PRESERVATIONIST_ATTRIBUTE_ID = "zR2KgxYe4LQZKBAiE";
export const LEVEL_UP_DISCOUNT_MULTIPLIER = 0.8;
export const PROMOTION_BASE_KARMA_COST = 50;

export function getItemLevelUpCost(
  level: number,
  discounted: boolean,
): number {
  const unitCost =
    PROMOTION_BASE_KARMA_COST * Math.pow(2, Math.max(0, level - 1));
  return Math.floor(
    unitCost * (discounted ? LEVEL_UP_DISCOUNT_MULTIPLIER : 1),
  );
}

export function canAffordItemLevelUp(
  available: number,
  cost: number,
): boolean {
  return available >= cost;
}

export function prepareItemForLevelUp(item: GameItem): GameItem {
  return {
    ...item,
    level: item.level + 1,
    condition: item.mint ? 1 : item.condition,
    mint: false,
    mint_value_multiplier: 1,
  };
}
