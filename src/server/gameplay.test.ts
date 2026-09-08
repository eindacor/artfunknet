import assert from "node:assert/strict";
import test from "node:test";

import {
  applyItemGenerationProbabilityMultipliers,
  amplifyRarityMap,
  calculateItemValues,
  filterActiveArtworks,
  getArtworkGenerationWeight,
  getGeneratedItemCondition,
  getRarityMap,
  getConfiguredRarityMap,
  getSpecialAttributeCount,
  isSeasonalArtwork,
  normalizeRarityMap,
  rollProbability,
  rollGeneratedCardRenderer,
  rollGeneratedItemProperties,
  rollUnlocked,
  rollWeighted,
} from "./gameplay.ts";

const lootData = {
  basic_crate_cost: 30_000_000,
  crate_expense_per_masterpiece: 3_600_000_000,
  items_per_basic_crate: 12,
};

test("inactive artwork is excluded from item generation pools", () => {
  const artworks = [
    { _id: "active", active: true },
    { _id: "inactive", active: false },
  ];

  assert.deepEqual(filterActiveArtworks(artworks), [
    { _id: "active", active: true },
  ]);
});

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

test("NPC rarity amplification preserves common odds and scales higher rarities", () => {
  const base = {
    common: 0.8,
    uncommon: 0.15,
    rare: 0.04,
    legendary: 0.009,
    masterpiece: 0.001,
  };
  const amplified = amplifyRarityMap(base, 0.5);
  assert.equal(amplified.common, base.common);
  assert.equal(amplified.masterpiece, base.masterpiece * 0.5);
  assert.equal(amplified.rare, base.rare * 0.75);
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

test("generated card styles roll only from active renderers", () => {
  const rolls = [0.2, 0.8];
  assert.equal(
    rollGeneratedCardRenderer(
      ["museum", "zine"],
      0.25,
      () => rolls.shift() ?? 0,
    ),
    "zine",
  );
  assert.equal(
    rollGeneratedCardRenderer(["museum"], 1, () => 0),
    undefined,
  );
  assert.equal(
    rollGeneratedCardRenderer([], 1, () => 0),
    undefined,
  );
  const weightedRolls = [0, 0.8];
  assert.equal(
    rollGeneratedCardRenderer(
      ["museum", "terminal", "zine"],
      1,
      () => weightedRolls.shift() ?? 0,
      { terminal: 3, zine: 1 },
    ),
    "zine",
  );
  assert.equal(
    rollGeneratedCardRenderer(
      ["museum", "terminal", "zine"],
      1,
      () => 0,
      { terminal: 0, zine: 1 },
    ),
    "zine",
  );
});

test("mint value multiplier applies only while the item is mint", () => {
  const item = {
    condition: 1,
    mint: true,
    mint_value_multiplier: 2,
    attributes: { locked: [], unlocked: [], special: [] },
    foil: false,
    seasonal: false,
    lottery: 0,
    original: false,
    vintage: false,
    unlocked: false,
    level: 1,
  };
  const artwork = {
    rarity: "common" as const,
    value_scale: 1,
  };
  const lootData = {
    rarity_values: {
      common: { min: 100, max: 100 },
    },
  };

  const mintValues = calculateItemValues(
    item,
    artwork as Parameters<typeof calculateItemValues>[1],
    lootData as Parameters<typeof calculateItemValues>[2],
  );
  const displayedValues = calculateItemValues(
    { ...item, mint: false, mint_value_multiplier: 1 },
    artwork as Parameters<typeof calculateItemValues>[1],
    lootData as Parameters<typeof calculateItemValues>[2],
  );

  assert.equal(displayedValues.actual, 80);
  assert.equal(mintValues.actual, 161);
  assert.equal(mintValues.sell, Math.floor(mintValues.actual * 0.8));
  assert.equal(mintValues.purchase, Math.floor(mintValues.actual * 1.5));
  assert.equal(mintValues.auction_min, Math.floor(mintValues.actual * 0.8 * 0.8));
  assert.equal(mintValues.collector, Math.floor(mintValues.actual * 1.2));
  assert.equal(mintValues.dealer, Math.floor(mintValues.actual * 0.9));
});

test("lottery levels preserve the original value multiplier", () => {
  const item = {
    condition: 1,
    mint: false,
    mint_value_multiplier: 1,
    attributes: { locked: [], unlocked: [], special: [] },
    foil: false,
    seasonal: false,
    lottery: 6,
    original: false,
    vintage: false,
    unlocked: false,
    level: 0,
  };
  const artwork = {
    rarity: "common" as const,
    value_scale: 1,
  };
  const lootData = {
    rarity_values: {
      common: { min: 100, max: 100 },
    },
  };

  const standard = calculateItemValues(
    { ...item, lottery: 0 },
    artwork as Parameters<typeof calculateItemValues>[1],
    lootData as Parameters<typeof calculateItemValues>[2],
  );
  const lottery = calculateItemValues(
    item,
    artwork as Parameters<typeof calculateItemValues>[1],
    lootData as Parameters<typeof calculateItemValues>[2],
  );

  assert.equal(lottery.actual, standard.actual * 16);
});

test("mint generation forces perfect condition", () => {
  assert.equal(getGeneratedItemCondition(true, 0), 1);
  assert.equal(getGeneratedItemCondition(true, 0.75), 1);
});

test("seasonal artwork is determined by its configured rarity slot", () => {
  const seasonalItems = {
    common: ["common-art"],
    uncommon: [],
    rare: ["rare-art"],
    legendary: [],
    masterpiece: [],
  };
  assert.equal(
    isSeasonalArtwork(
      { seasonal_items: seasonalItems },
      { _id: "rare-art", rarity: "rare" },
    ),
    true,
  );
  assert.equal(
    isSeasonalArtwork(
      { seasonal_items: seasonalItems },
      { _id: "rare-art", rarity: "common" },
    ),
    false,
  );
});

test("seasonal generation scalar increases seasonal artwork weight", () => {
  const seasonalItems = {
    common: ["seasonal"],
    uncommon: [],
    rare: [],
    legendary: [],
    masterpiece: [],
  };
  const artwork = {
    _id: "seasonal",
    rarity: "common" as const,
    value_scale: 0.5,
  };

  assert.equal(
    getArtworkGenerationWeight(
      artwork,
      { seasonal_items: seasonalItems },
      3,
    ),
    getArtworkGenerationWeight(artwork, {
      seasonal_items: seasonalItems,
    }) * 3,
  );
});

test("unlocked probability applies only to non-common artwork", () => {
  assert.equal(rollUnlocked("common", 1, () => 0), false);
  assert.equal(rollUnlocked("rare", 0.05, () => 0.049), true);
  assert.equal(rollUnlocked("rare", 0.05, () => 0.05), false);
});

test("generation probability multipliers boost and clamp configured odds", () => {
  assert.deepEqual(
    applyItemGenerationProbabilityMultipliers(
      {
        foil: 0.4,
        mint: 0.01,
        unlocked: 0.2,
        cardStyle: 0.1,
      },
      { foil: 2, mint: 3, unlocked: 0.5, cardStyle: 20 },
    ),
    {
      foil: 0.8,
      mint: 0.03,
      unlocked: 0.1,
      cardStyle: 1,
    },
  );
});

test("generated properties roll independently and can coexist", () => {
  const rolls = [0.004, 0.0004, 0.049];
  const combined = rollGeneratedItemProperties(
    "rare",
    {
      foil: 0.005,
      mint: 0.0005,
      unlocked: 0.05,
    },
    () => rolls.shift() ?? 1,
  );
  assert.deepEqual(combined, {
    foil: true,
    mint: true,
    unlocked: true,
  });

  const independentRolls = [0.9, 0.0004, 0.9];
  assert.deepEqual(
    rollGeneratedItemProperties(
      "rare",
      {
        foil: 0.005,
        mint: 0.0005,
        unlocked: 0.05,
      },
      () => independentRolls.shift() ?? 1,
    ),
    {
      foil: false,
      mint: true,
      unlocked: false,
    },
  );
});

test("common items can combine foil and Mint but not unlocked", () => {
  assert.deepEqual(
    rollGeneratedItemProperties(
      "common",
      {
        foil: 1,
        mint: 1,
        unlocked: 1,
      },
      () => 0,
    ),
    {
      foil: true,
      mint: true,
      unlocked: false,
    },
  );
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
