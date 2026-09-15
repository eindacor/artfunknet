import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateHistorianClaimXp,
  calculateHistorianReward,
  calculateMarketExpertMoneyMultiplier,
  isHistorianSpecialItem,
} from "./art-historian-gameplay.ts";

test("Art Historian rewards preserve original rarity multipliers", () => {
  const common = calculateHistorianReward({
    averageDropValue: 1_000,
    playerLevel: 0,
    questRarity: "common",
  });
  const masterpiece = calculateHistorianReward({
    averageDropValue: 1_000,
    playerLevel: 0,
    questRarity: "masterpiece",
  });

  assert.equal(common.money, 2_000);
  assert.equal(common.xp, 60);
  assert.equal(masterpiece.money, 3_600);
  assert.equal(masterpiece.xp, 100);
  assert.deepEqual(masterpiece.item, {
    rarity: "legendary",
    foil: true,
  });
});

test("calculateMarketExpertMoneyMultiplier scales with winning auction count", () => {
  assert.equal(calculateMarketExpertMoneyMultiplier(0, 0.06), 1.0);
  assert.equal(calculateMarketExpertMoneyMultiplier(3, 0.06), 1.18);
  assert.equal(calculateMarketExpertMoneyMultiplier(5, 0.06), 1.30);
  assert.equal(calculateMarketExpertMoneyMultiplier(-2, 0.06), 1.0);
});

test("calculateHistorianReward applies moneyMultiplier correctly", () => {
  const baseReward = calculateHistorianReward({
    averageDropValue: 1_000,
    playerLevel: 0,
    questRarity: "common",
    moneyMultiplier: 1.0,
  });
  const boostedReward = calculateHistorianReward({
    averageDropValue: 1_000,
    playerLevel: 0,
    questRarity: "common",
    moneyMultiplier: calculateMarketExpertMoneyMultiplier(3, 0.06),
  });

  assert.equal(baseReward.money, 2_000);
  assert.equal(boostedReward.money, 2_360);
});

test("calculateHistorianReward stacks xpMultiplier and moneyMultiplier independently", () => {
  const stackedReward = calculateHistorianReward({
    averageDropValue: 1_000,
    playerLevel: 0,
    questRarity: "common",
    xpMultiplier: 1.5,
    moneyMultiplier: calculateMarketExpertMoneyMultiplier(3, 0.06),
  });

  assert.equal(stackedReward.money, 2_360);
  assert.equal(stackedReward.xp, 90);
  assert.equal(stackedReward.xp_chunk_percentage, 0.9);
});

test("Art Historian claims reward extra and special targets", () => {
  assert.equal(calculateHistorianClaimXp(100, 3, 3, 0), 100);
  assert.equal(calculateHistorianClaimXp(100, 4, 3, 2), 180);
});

test("Art Historian special targets preserve original property list", () => {
  const baseItem = {
    foil: false,
    unlocked: false,
    seasonal: false,
    original: false,
    vintage: false,
    lottery: 0,
  };
  assert.equal(isHistorianSpecialItem(baseItem), false);
  assert.equal(
    isHistorianSpecialItem({ ...baseItem, seasonal: true }),
    true,
  );
});
