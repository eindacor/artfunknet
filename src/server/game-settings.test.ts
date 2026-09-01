import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ACTUAL_GAMEPLAY_CONFIG,
  DEFAULT_DEBUG_GAMEPLAY_CONFIG,
  validateGameplayConfig,
  validateRarityWeights,
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

test("actual and debug gameplay configurations validate independently", () => {
  assert.equal(validateGameplayConfig(DEFAULT_ACTUAL_GAMEPLAY_CONFIG).ok, true);
  assert.equal(validateGameplayConfig(DEFAULT_DEBUG_GAMEPLAY_CONFIG).ok, true);
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
