import assert from "node:assert/strict";
import test from "node:test";

import {
  canAffordItemLevelUp,
  getItemLevelUpCost,
  ITEM_LEVEL_MAX,
  PROMOTION_BASE_KARMA_COST,
  prepareItemForLevelUp,
} from "./item-leveling.ts";
import type { GameItem } from "./gameplay.ts";

test("promotion costs are rarity-independent and scale through level 10", () => {
  assert.equal(ITEM_LEVEL_MAX, 10);
  assert.equal(getItemLevelUpCost(1, false), PROMOTION_BASE_KARMA_COST);
  assert.equal(getItemLevelUpCost(1, true), 40);
  assert.equal(getItemLevelUpCost(5, false), 800);
  assert.equal(getItemLevelUpCost(9, false), 12_800);

  const totalCost = Array.from(
    { length: ITEM_LEVEL_MAX - 1 },
    (_, index) => getItemLevelUpCost(index + 1, false),
  ).reduce((total, cost) => total + cost, 0);
  assert.equal(totalCost, 25_550);
});

test("item leveling requires enough Karma for the full cost", () => {
  const cost = getItemLevelUpCost(5, false);
  assert.equal(cost, 800);
  assert.equal(getItemLevelUpCost(5, true), 640);
  assert.equal(canAffordItemLevelUp(cost, cost), true);
  assert.equal(canAffordItemLevelUp(cost - 1, cost), false);
});

test("item leveling preserves the applied card style", () => {
  const item = {
    level: 3,
    condition: 0.74,
    mint: false,
    mint_value_multiplier: 1,
    card_renderer: "zine",
  } as GameItem;

  const leveled = prepareItemForLevelUp(item);

  assert.equal(leveled.level, 4);
  assert.equal(leveled.card_renderer, "zine");
});
