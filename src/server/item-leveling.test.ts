import assert from "node:assert/strict";
import test from "node:test";

import {
  canAffordItemLevelUp,
  getItemLevelUpCost,
  ITEM_LEVEL_MAX,
  prepareItemForLevelUp,
} from "./item-leveling.ts";
import type { GameItem } from "./gameplay.ts";

test("item leveling preserves the original Knowledge cost and level cap", () => {
  assert.equal(ITEM_LEVEL_MAX, 10);
  assert.deepEqual(getItemLevelUpCost("common", 1, false), {
    historical_data: 12,
    contextual_understanding: 0,
    technical_comprehension: 0,
    artistic_vision: 0,
  });
  assert.deepEqual(getItemLevelUpCost("common", 1, true), {
    historical_data: 9,
    contextual_understanding: 0,
    technical_comprehension: 0,
    artistic_vision: 0,
  });
});

test("item leveling requires every Knowledge tier in the cost", () => {
  const cost = getItemLevelUpCost("legendary", 5, false);
  assert.deepEqual(cost, {
    historical_data: 9,
    contextual_understanding: 6,
    technical_comprehension: 2,
    artistic_vision: 1,
  });
  assert.deepEqual(getItemLevelUpCost("legendary", 5, true), {
    historical_data: 4,
    contextual_understanding: 14,
    technical_comprehension: 13,
    artistic_vision: 0,
  });
  assert.equal(canAffordItemLevelUp(cost, cost), true);
  assert.equal(
    canAffordItemLevelUp(
      { ...cost, artistic_vision: cost.artistic_vision - 1 },
      cost,
    ),
    false,
  );
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
