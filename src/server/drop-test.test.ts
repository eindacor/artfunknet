import assert from "node:assert/strict";
import test from "node:test";

import {
  getDropTestRarityMap,
  simulateDropRarities,
} from "./drop-test.ts";
import {
  DEFAULT_VISITOR_RARITY_AMPLIFIERS,
} from "./game-settings.ts";
import {
  getConfiguredRarityMap,
  getVisitorRarityMap,
} from "./gameplay.ts";

const lootData = {
  basic_crate_cost: 30_000_000,
  crate_expense_per_masterpiece: 3_600_000_000,
  items_per_basic_crate: 12,
};
const configuredWeights = {
  common: 100,
  uncommon: 20,
  rare: 10,
  legendary: 2,
  masterpiece: 1,
};

test("visitor rarity amplifiers have one default gameplay map", () => {
  assert.deepEqual(DEFAULT_VISITOR_RARITY_AMPLIFIERS, {
    bronze: 0,
    silver: 0.1,
    gold: 0.2,
    platinum: 0.3,
  });
});

test("standard drop tests use the standard crate rarity map", () => {
  assert.deepEqual(
    getDropTestRarityMap({
      source: "standard",
      playerLevel: 50,
      lootData,
      configuredWeights,
      visitorRarityAmplifiers: DEFAULT_VISITOR_RARITY_AMPLIFIERS,
    }),
    getConfiguredRarityMap(50, lootData, configuredWeights),
  );
});

test("visitor drop tests use the selected canonical quality amplifier", () => {
  for (const source of ["donor", "dealer", "auctioneer"] as const) {
    for (const [quality, amplifier] of Object.entries(
      DEFAULT_VISITOR_RARITY_AMPLIFIERS,
    )) {
      assert.deepEqual(
        getDropTestRarityMap({
          source,
          quality:
            quality as keyof typeof DEFAULT_VISITOR_RARITY_AMPLIFIERS,
          playerLevel: 50,
          lootData,
          configuredWeights,
          visitorRarityAmplifiers: DEFAULT_VISITOR_RARITY_AMPLIFIERS,
        }),
        getConfiguredRarityMap(
          50,
          lootData,
          getVisitorRarityMap(
            50,
            lootData,
            configuredWeights,
            amplifier,
          ),
          true,
        ),
      );
    }
  }
});

test("drop simulations run 100,000 rolls using active artwork rarities", () => {
  const result = simulateDropRarities({
    source: "auctioneer",
    quality: "platinum",
    playerLevel: 50,
    lootData,
    configuredWeights,
    visitorRarityAmplifiers: DEFAULT_VISITOR_RARITY_AMPLIFIERS,
    availableRarities: ["rare"],
  });

  assert.equal(result.rolls, 100_000);
  assert.deepEqual(result.counts, {
    common: 0,
    uncommon: 0,
    rare: 100_000,
    legendary: 0,
    masterpiece: 0,
  });
});
