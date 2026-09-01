import assert from "node:assert/strict";
import test from "node:test";

import {
  getRarityMap,
  getConfiguredRarityMap,
  getSpecialAttributeCount,
  normalizeRarityMap,
  rollProbability,
  rollUnlocked,
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

test("foil probability uses the configured roll boundary", () => {
  assert.equal(rollProbability(0.005, () => 0.0049), true);
  assert.equal(rollProbability(0.005, () => 0.005), false);
  assert.equal(rollProbability(0, () => 0), false);
  assert.equal(rollProbability(1, () => 0.9999), true);
});

test("unlocked probability applies only to non-common artwork", () => {
  assert.equal(rollUnlocked("common", 1, () => 0), false);
  assert.equal(rollUnlocked("rare", 0.05, () => 0.049), true);
  assert.equal(rollUnlocked("rare", 0.05, () => 0.05), false);
});

test("artwork rarity preserves legacy special attribute counts", () => {
  assert.equal(getSpecialAttributeCount("common"), 0);
  assert.equal(getSpecialAttributeCount("uncommon"), 0);
  assert.equal(getSpecialAttributeCount("rare"), 1);
  assert.equal(getSpecialAttributeCount("legendary"), 2);
  assert.equal(getSpecialAttributeCount("masterpiece"), 3);
});

test("admin rarity weights normalize into probabilities", () => {
  assert.deepEqual(
    normalizeRarityMap({
      common: 1,
      uncommon: 1,
      rare: 1,
      legendary: 1,
      masterpiece: 1,
    }),
    {
      common: 0.2,
      uncommon: 0.2,
      rare: 0.2,
      legendary: 0.2,
      masterpiece: 0.2,
    },
  );
});

test("configured base rarity maps retain player-level restrictions", () => {
  const lootData = {
    basic_crate_cost: 1,
    crate_expense_per_masterpiece: 1,
    items_per_basic_crate: 1,
  };
  const weights = {
    common: 1,
    uncommon: 1,
    rare: 1,
    legendary: 1,
    masterpiece: 1,
  };

  assert.deepEqual(getRarityMap(0, lootData, weights), {
    common: 1,
    uncommon: 0,
    rare: 0,
    legendary: 0,
    masterpiece: 0,
  });
  assert.deepEqual(getRarityMap(50, lootData, weights), {
    common: 0.19999999999999996,
    uncommon: 0.2,
    rare: 0.2,
    legendary: 0.2,
    masterpiece: 0.2,
  });
});

test("raw debug rarity maps bypass player-level restrictions", () => {
  const map = getConfiguredRarityMap(
    0,
    {
      basic_crate_cost: 1,
      crate_expense_per_masterpiece: 1,
      items_per_basic_crate: 1,
    },
    {
      common: 1,
      uncommon: 1,
      rare: 1,
      legendary: 1,
      masterpiece: 1,
    },
    true,
  );

  assert.deepEqual(map, {
    common: 0.2,
    uncommon: 0.2,
    rare: 0.2,
    legendary: 0.2,
    masterpiece: 0.2,
  });
});
