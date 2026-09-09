import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ACTUAL_GAMEPLAY_CONFIG,
  DEFAULT_DEBUG_GAMEPLAY_CONFIG,
  DEFAULT_XP_REWARD_SCALARS,
  validateCardStyleWeights,
  validateGameplayConfig,
  validateRarityWeights,
  validateXpRewardScalars,
} from "./game-settings.ts";

const validWeights = {
  common: 100,
  uncommon: 30,
  rare: 10,
  legendary: 1,
  masterpiece: 0.1,
};

test("rarity weights accept arbitrary positive proportions", () => {
  assert.deepEqual(validateRarityWeights(validWeights), {
    ok: true,
    value: validWeights,
  });
});

test("rarity weights require every known rarity and reject unknown keys", () => {
  assert.equal(
    validateRarityWeights({ ...validWeights, common: undefined }).ok,
    false,
  );
  assert.equal(
    validateRarityWeights({ ...validWeights, mythic: 1 }).ok,
    false,
  );
});

test("rarity weights reject invalid and all-zero maps", () => {
  assert.equal(validateRarityWeights({ ...validWeights, rare: -1 }).ok, false);
  assert.equal(
    validateRarityWeights({
      common: 0,
      uncommon: 0,
      rare: 0,
      legendary: 0,
      masterpiece: 0,
    }).ok,
    false,
  );
});

test("card style weights require every known non-default style", () => {
  const weights = DEFAULT_ACTUAL_GAMEPLAY_CONFIG.cardStyleWeights;
  assert.deepEqual(validateCardStyleWeights(weights), {
    ok: true,
    value: weights,
  });

  assert.equal(
    validateCardStyleWeights({ ...weights, museum: 1 }).ok,
    false,
  );
  assert.equal(
    validateCardStyleWeights({ ...weights, baseball: undefined }).ok,
    false,
  );
  assert.equal(
    validateCardStyleWeights(
      Object.fromEntries(Object.keys(weights).map((key) => [key, 0])),
    ).ok,
    false,
  );
});

test("XP reward scalars preserve current reward defaults", () => {
  assert.deepEqual(
    DEFAULT_ACTUAL_GAMEPLAY_CONFIG.xpRewardScalars,
    DEFAULT_XP_REWARD_SCALARS,
  );
  assert.equal(DEFAULT_XP_REWARD_SCALARS.forgeryOffload, 0.8);
  assert.equal(validateXpRewardScalars(DEFAULT_XP_REWARD_SCALARS).ok, true);
  assert.equal(
    validateXpRewardScalars({
      ...DEFAULT_XP_REWARD_SCALARS,
      galleryDisplay: -0.01,
    }).ok,
    false,
  );
  assert.equal(
    validateXpRewardScalars({
      ...DEFAULT_XP_REWARD_SCALARS,
      unknownReward: 1,
    }).ok,
    false,
  );
});

test("actual and debug gameplay configurations validate independently", () => {
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.dailyDropCooldownMinutes, 1);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.dailyDropCount, 50);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.cardRendererProbability, 0.05);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.crateValueScalar, 1.8);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.standardCrateCostScalar, 1);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.foilCrateCostScalar, 1.5);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.unlockedCrateCostScalar, 1.2);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.designerCrateCostScalar, 2);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.ultimateCrateCostScalar, 3);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.foilCrateChanceScalar, 5);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.unlockedCrateChanceScalar, 5);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.artStyleCrateChanceScalar, 5);
  assert.equal(
    DEFAULT_ACTUAL_GAMEPLAY_CONFIG.ultimateArtStyleChanceScalar,
    3,
  );
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.ultimateFoilChanceScalar, 5);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.ultimateUnlockedChanceScalar, 5);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.ultimateMintChanceScalar, 5);
  assert.equal(
    DEFAULT_ACTUAL_GAMEPLAY_CONFIG.ultimateSeasonalChanceScalar,
    5,
  );
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.foilProbability, 0.01);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.mintProbability, 0.005);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.mintValueMultiplier, 2);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.galleryPayoutIntervalMinutes, 10);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.npcSpawnIntervalMinutes, 1);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.repairIntervalMinutes, 60);
  assert.equal(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.repairAmount, 0.1);
  assert.equal(
    DEFAULT_ACTUAL_GAMEPLAY_CONFIG.npcMeetingResetIntervalMinutes,
    1_440,
  );
  assert.deepEqual(DEFAULT_ACTUAL_GAMEPLAY_CONFIG.npcMeetingLimits, {
    bronze: 120,
    silver: 100,
    gold: 80,
    platinum: 60,
  });
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.cardRendererProbability, 0.25);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.crateValueScalar, 1);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.standardCrateCostScalar, 1);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.foilCrateCostScalar, 1);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.unlockedCrateCostScalar, 1);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.designerCrateCostScalar, 1);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.ultimateCrateCostScalar, 1);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.foilCrateChanceScalar, 3);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.unlockedCrateChanceScalar, 3);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.artStyleCrateChanceScalar, 3);
  assert.equal(
    DEFAULT_DEBUG_GAMEPLAY_CONFIG.ultimateArtStyleChanceScalar,
    3,
  );
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.ultimateFoilChanceScalar, 3);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.ultimateUnlockedChanceScalar, 3);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.ultimateMintChanceScalar, 3);
  assert.equal(
    DEFAULT_DEBUG_GAMEPLAY_CONFIG.ultimateSeasonalChanceScalar,
    3,
  );
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.mintProbability, 0.25);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.mintValueMultiplier, 2);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.repairIntervalMinutes, 1);
  assert.equal(DEFAULT_DEBUG_GAMEPLAY_CONFIG.repairAmount, 0.1);
  assert.equal(
    DEFAULT_DEBUG_GAMEPLAY_CONFIG.npcMeetingResetIntervalMinutes,
    1,
  );
  assert.equal(validateGameplayConfig(DEFAULT_ACTUAL_GAMEPLAY_CONFIG).ok, true);
  assert.equal(validateGameplayConfig(DEFAULT_DEBUG_GAMEPLAY_CONFIG).ok, true);
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      cardRendererProbability: 1.001,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      npcSpawnIntervalMinutes: 0,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      crateValueScalar: 0,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      designerCrateCostScalar: 0,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      foilCrateChanceScalar: -0.001,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      artStyleCrateChanceScalar: 1_001,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      ultimateSeasonalChanceScalar: 0,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      repairIntervalMinutes: 0,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      repairAmount: 1.001,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      npcMeetingLimits: {
        ...DEFAULT_DEBUG_GAMEPLAY_CONFIG.npcMeetingLimits,
        gold: 0,
      },
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      foilProbability: -0.001,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      foilProbability: 1.001,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      mintProbability: -0.001,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      mintProbability: 1.001,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      mintValueMultiplier: 0.999,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      mintValueMultiplier: 1_001,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      unlockedProbability: -0.001,
    }).ok,
    false,
  );
  assert.equal(
    validateGameplayConfig({
      ...DEFAULT_DEBUG_GAMEPLAY_CONFIG,
      unlockedProbability: 1.001,
    }).ok,
    false,
  );
});
