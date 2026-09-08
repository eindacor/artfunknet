import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCollectorReward,
  getCollectorForgeryHeat,
  getHighestAvailableCollectorQuality,
} from "./collector-gameplay.ts";

const item = {
  condition: 0.9,
  level: 5,
  roll_count: 0,
  values: {
    actual: 10_000,
    sell: 0,
    purchase: 0,
    auction_min: 0,
    collector: 0,
    dealer: 0,
  },
};

test("collector rewards preserve quality, own-gallery, and additive bonuses", () => {
  assert.deepEqual(
    calculateCollectorReward({
      item,
      quality: "bronze",
      ownGallery: false,
      goodConditionBonus: false,
      rollCountBonus: false,
      xpOffer: false,
      xpChunk: 100,
    }),
    { amount: 14_000, type: "money", multiplier: 1.4 },
  );
  const ownGallery = calculateCollectorReward({
    item,
    quality: "platinum",
    ownGallery: true,
    goodConditionBonus: true,
    rollCountBonus: true,
    xpOffer: false,
    xpChunk: 100,
  });
  assert.equal(ownGallery.multiplier, 3.27);
  assert.equal(ownGallery.amount, 32_700);
});

test("collector XP rewards use the legacy level-based chunk percentage", () => {
  const reward = calculateCollectorReward({
    item,
    quality: "bronze",
    ownGallery: false,
    goodConditionBonus: false,
    rollCountBonus: false,
    xpOffer: true,
    xpChunk: 1_000,
  });
  assert.equal(reward.amount, 279);
});

test("collector forgery heat preserves the legendary reduction", () => {
  const forgedItem = {
    mint: false,
    foil: false,
    unlocked: false,
    seasonal: false,
    vintage: false,
    lottery: 0,
    level: 1,
    authenticity: { forgery_quality: 0.5, identified: false },
    artwork: { rarity: "common" as const },
  };
  assert.equal(getCollectorForgeryHeat(forgedItem, false), 0.118);
  assert.equal(getCollectorForgeryHeat(forgedItem, true), 0.095);
});

test("maximum Collector quality steps down as meeting caps are exhausted", () => {
  assert.equal(getHighestAvailableCollectorQuality({}), "platinum");
  assert.equal(
    getHighestAvailableCollectorQuality({ platinum: 60 }),
    "gold",
  );
  assert.equal(
    getHighestAvailableCollectorQuality({
      platinum: 60,
      gold: 80,
      silver: 100,
    }),
    "bronze",
  );
  assert.equal(
    getHighestAvailableCollectorQuality({
      platinum: 60,
      gold: 80,
      silver: 100,
      bronze: 120,
    }),
    null,
  );
});

test("maximum Collector quality accepts configured meeting caps", () => {
  assert.equal(
    getHighestAvailableCollectorQuality(
      { platinum: 2 },
      { bronze: 4, silver: 3, gold: 2, platinum: 2 },
    ),
    "gold",
  );
});
