import assert from "node:assert/strict";
import test from "node:test";

import {
  canAffordItemLevelUp,
  getItemLevelUpCost,
  ITEM_LEVEL_MAX,
} from "./item-leveling.ts";

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
