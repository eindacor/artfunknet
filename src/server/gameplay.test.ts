import assert from "node:assert/strict";
import test from "node:test";

import {
  getRarityMap,
  getSpecialAttributeCount,
  rollWeighted,
} from "./gameplay.ts";

const lootData = {
  basic_crate_cost: 30_000_000,
  crate_expense_per_masterpiece: 3_600_000_000,
  items_per_basic_crate: 12,
};

test("level zero drops remain common-only", () => {
  assert.deepEqual(getRarityMap(0, lootData), {
    masterpiece: 0,
    legendary: 0,
    rare: 0,
    uncommon: 0,
    common: 1,
  });
});

test("masterpiece odds preserve the legacy one-in-1440 maximum-level rate", () => {
  const map = getRarityMap(50, lootData);
  assert.equal(map.masterpiece, 1 / 1440);
  assert.ok(map.legendary > 0);
  assert.ok(map.rare > map.legendary);
  assert.ok(map.common > map.uncommon);
});

test("weighted rolls honor deterministic boundary values", () => {
  const entries = [
    { value: "common", weight: 3 },
    { value: "rare", weight: 1 },
  ];
  assert.equal(rollWeighted(entries, () => 0), "common");
  assert.equal(rollWeighted(entries, () => 0.99), "rare");
});

test("artwork rarity preserves legacy special attribute counts", () => {
  assert.equal(getSpecialAttributeCount("common"), 0);
  assert.equal(getSpecialAttributeCount("uncommon"), 0);
  assert.equal(getSpecialAttributeCount("rare"), 1);
  assert.equal(getSpecialAttributeCount("legendary"), 2);
  assert.equal(getSpecialAttributeCount("masterpiece"), 3);
});
