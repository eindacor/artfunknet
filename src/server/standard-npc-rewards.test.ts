import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateBenefactorReward,
  calculateEnthusiastReward,
} from "./standard-npc-rewards.ts";

test("Benefactor rewards preserve quality and random donation variance", () => {
  assert.equal(
    calculateBenefactorReward({
      averageDropValue: 1_000,
      quality: "bronze",
      ownGallery: false,
      visitorCount: 0,
      highConditionItemCount: 0,
      visitorBonus: false,
      conditionBonus: false,
      visitorMultiplierPerVisitor: 0.1,
      conditionMultiplierPerItem: 0.05,
      randomRoll: 0.5,
    }),
    1_800,
  );
});

test("Benefactor own-gallery Legendary multipliers stack in legacy order", () => {
  assert.equal(
    calculateBenefactorReward({
      averageDropValue: 1_000,
      quality: "platinum",
      ownGallery: true,
      visitorCount: 3,
      highConditionItemCount: 2,
      visitorBonus: true,
      conditionBonus: true,
      visitorMultiplierPerVisitor: 0.1,
      conditionMultiplierPerItem: 0.05,
      randomRoll: 0,
    }),
    10_010,
  );
});

test("Art Enthusiast rewards use XP chunks and own-gallery visitor bonuses", () => {
  assert.equal(
    calculateEnthusiastReward({
      xpChunk: 1_000,
      quality: "gold",
      ownGallery: true,
      visitorCount: 4,
      visitorBonus: true,
      visitorMultiplierPerVisitor: 0.05,
    }),
    840,
  );
});
