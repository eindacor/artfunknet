import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateHistorianClaimXp,
  calculateHistorianReward,
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

  assert.equal(common.money, 5_000);
  assert.equal(common.xp, 60);
  assert.equal(masterpiece.money, 9_000);
  assert.equal(masterpiece.xp, 100);
  assert.deepEqual(masterpiece.item, {
    rarity: "legendary",
    foil: true,
  });
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
