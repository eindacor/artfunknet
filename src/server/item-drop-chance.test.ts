import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_ACTUAL_GAMEPLAY_CONFIG } from "./game-settings.ts";
import type { LootData } from "./gameplay.ts";
import {
  calculateItemDropChance,
  createItemDropChanceContext,
} from "./item-drop-chance.ts";
import { MASTERPIECE_EFFECT_CODES } from "./masterpiece-effects.ts";

const config = {
  ...DEFAULT_ACTUAL_GAMEPLAY_CONFIG,
  rarityWeights: {
    common: 714, uncommon: 200, rare: 70, legendary: 15, masterpiece: 1,
  },
  foilProbability: 0.1,
  unlockedProbability: 0.2,
  cardRendererProbability: 0.25,
  mintProbability: 0.02,
  cardStyleWeights: {
    ...DEFAULT_ACTUAL_GAMEPLAY_CONFIG.cardStyleWeights,
    legacy: 3,
    postcard: 1,
    arcade: 0,
  },
};
const lootData: LootData = {
  basic_crate_cost: 1,
  items_per_basic_crate: 1,
  crate_expense_per_masterpiece: 1,
  rarity_values: {
    common: { min: 1, max: 10 },
    uncommon: { min: 10, max: 20 },
    rare: { min: 20, max: 30 },
    legendary: { min: 30, max: 40 },
    masterpiece: { min: 40, max: 50 },
  },
  seasonal_items: { common: [], uncommon: [], rare: [], legendary: [], masterpiece: [] },
  global_foil_chance: 0.9,
  global_patreon_chance: 0,
  global_unlocked_chance: 0.9,
  global_misprint_chance: 0,
};
const context = createItemDropChanceContext(config, lootData, [
  { rarity: "common", active: true },
  { rarity: "common", active: true },
  { rarity: "rare", active: true },
  { rarity: "rare", active: true },
  { rarity: "rare", active: false },
], ["legacy", "postcard", "museum", "arcade"]);
const standard = { foil: false, unlocked: false, seasonal: false, mint: false };
const mintEffect = {
  _id: "guaranteed-mint",
  active: true,
  effect_type: "masterpiece" as const,
  code: MASTERPIECE_EFFECT_CODES.preservationMint,
};

test("posted odds use maximum-level rarity and do not divide ordinary items by the artwork pool", () => {
  assert.deepEqual(calculateItemDropChance(standard, { rarity: "common" }, context), {
    drop_chance_coefficient: 0.714,
    odds: "71.4%",
  });
  assert.equal(
    calculateItemDropChance({ ...standard, seasonal: true }, { rarity: "common" }, context)
      .drop_chance_coefficient,
    0.357,
  );
});

test("odds that would round to one use percentages, while a denominator rounding to two stays one-in", () => {
  for (const [coefficient, odds] of [
    [0.75, "75%"],
    [0.6667, "66.67%"],
    [2 / 3, "1 in 2"],
    [1, "100%"],
  ] as const) {
    assert.deepEqual(calculateItemDropChance(standard, { rarity: "common" }, {
      ...context,
      rarity: { ...context.rarity, common: coefficient },
    }), { drop_chance_coefficient: coefficient, odds });
  }
});

test("seasonal, foil, unlocked, weighted art style, and Mint factors compound using global settings", () => {
  const chance = calculateItemDropChance({
    seasonal: true, foil: true, unlocked: true, mint: true, card_renderer: "postcard",
  }, { rarity: "rare" }, context);
  assert.ok(Math.abs(chance.drop_chance_coefficient! - 0.000000875) < 1e-18);
  assert.equal(chance.odds, "1 in 1,142,857");
  assert.equal(
    calculateItemDropChance({ ...standard, foil: true }, { rarity: "common" }, context)
      .drop_chance_coefficient,
    0.0714,
  );
});

test("specific style weights affect only Mint items, while all styled items use the global style chance", () => {
  for (const card_renderer of ["legacy", "postcard", "arcade", "inactive"]) {
    assert.equal(
      calculateItemDropChance({ ...standard, card_renderer }, { rarity: "common" }, context)
        .drop_chance_coefficient,
      0.1785,
    );
  }
  const mintLegacy = calculateItemDropChance({
    ...standard, mint: true, card_renderer: "legacy",
  }, { rarity: "common" }, context);
  const mintPostcard = calculateItemDropChance({
    ...standard, mint: true, card_renderer: "postcard",
  }, { rarity: "common" }, context);
  assert.ok(Math.abs(mintLegacy.drop_chance_coefficient - 0.0026775) < 1e-18);
  assert.ok(Math.abs(mintPostcard.drop_chance_coefficient - 0.0008925) < 1e-18);
});

test("guaranteed-Mint masterpieces skip only the Mint probability, even when random Mint drops are disabled", () => {
  const guaranteedContext = createItemDropChanceContext(
    { ...config, mintProbability: 0 },
    lootData,
    [],
    ["legacy", "postcard"],
    [mintEffect],
  );
  for (const [card_renderer, expected, odds] of [
    ["museum", 0.001, "1 in 1,000"],
    ["legacy", 0.0001875, "1 in 5,333"],
    ["postcard", 0.0000625, "1 in 16,000"],
    ["inactive", 0, "Not currently droppable"],
  ] as const) {
    const chance = calculateItemDropChance({
      ...standard, mint: true, card_renderer,
    }, { rarity: "masterpiece", effect_id: mintEffect._id }, guaranteedContext);
    assert.ok(Math.abs(chance.drop_chance_coefficient - expected) < 1e-18);
    assert.equal(chance.odds, odds);
  }
});

test("other, inactive, or unlinked effects do not exempt a masterpiece from the Mint probability", () => {
  for (const effects of [
    [],
    [{ ...mintEffect, active: false }],
    [{ ...mintEffect, code: MASTERPIECE_EFFECT_CODES.perfectReroll }],
    [{ ...mintEffect, effect_type: "legendary" as const }],
    [{ ...mintEffect, _id: "another-effect" }],
  ]) {
    const ordinaryContext = createItemDropChanceContext(
      config, lootData, [], ["legacy", "postcard"], effects,
    );
    const chance = calculateItemDropChance({
      ...standard, mint: true, card_renderer: "postcard",
    }, { rarity: "masterpiece", effect_id: mintEffect._id }, ordinaryContext);
    assert.ok(Math.abs(chance.drop_chance_coefficient - 0.00000125) < 1e-18);
    assert.equal(chance.odds, "1 in 800,000");
  }
});

test("museum is unstyled, while unavailable Mint variants produce zero instead of infinite odds", () => {
  assert.equal(
    calculateItemDropChance({ ...standard, card_renderer: "museum" }, { rarity: "common" }, context)
      .drop_chance_coefficient,
    0.714,
  );
  for (const card_renderer of ["arcade", "inactive", "unknown-style"]) {
    assert.deepEqual(calculateItemDropChance({
      ...standard, mint: true, card_renderer,
    }, { rarity: "common" }, context), {
      drop_chance_coefficient: 0,
      odds: "Not currently droppable",
    });
  }
  assert.equal(calculateItemDropChance({
    ...standard, seasonal: true,
  }, { rarity: "masterpiece" }, context).drop_chance_coefficient, 0);
  assert.equal(calculateItemDropChance({
    ...standard, mint: true,
  }, { rarity: "common" }, { ...context, mint: 0 }).drop_chance_coefficient, 0);
});

test("recalculation preserves forgery disclosure labels while storing the coefficient", () => {
  for (const odds of ["forged", "unknown"]) {
    assert.deepEqual(calculateItemDropChance({
      ...standard, odds,
    }, { rarity: "common" }, context), { drop_chance_coefficient: 0.714, odds });
  }
});
