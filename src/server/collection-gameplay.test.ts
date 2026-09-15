import assert from "node:assert/strict";
import test from "node:test";

import {
  applyXp,
  getCapsForLevel,
  getXpChunk,
  getXpGoal,
} from "./collection-gameplay.ts";

test("legacy XP goals and chunks are preserved", () => {
  assert.equal(getXpGoal(0), 100);
  assert.equal(getXpGoal(1), 130);
  assert.equal(getXpGoal(50), 10_000_000);
  assert.equal(getXpChunk(0), 100);
});

test("XP carries through multiple level thresholds", () => {
  assert.deepEqual(applyXp(0, 90, 50), {
    level: 1,
    xp: 40,
    lotteryTickets: 0,
  });
});

test("players earn a lottery ticket whenever they reach a fifth level", () => {
  assert.deepEqual(applyXp(4, getXpGoal(4) - 1, 1), {
    level: 5,
    xp: 0,
    lotteryTickets: 1,
  });
  assert.deepEqual(applyXp(9, getXpGoal(9) - 1, 1), {
    level: 10,
    xp: 0,
    lotteryTickets: 1,
  });
  assert.deepEqual(applyXp(5, getXpGoal(5) - 1, 1), {
    level: 6,
    xp: 0,
    lotteryTickets: 0,
  });
});

test("max-level XP caps award lottery tickets and reset progress", () => {
  const goal = getXpGoal(50);
  assert.deepEqual(applyXp(50, goal - 1, 1), {
    level: 50,
    xp: 0,
    lotteryTickets: 1,
  });
  assert.deepEqual(applyXp(50, goal - 10, goal + 25), {
    level: 50,
    xp: 15,
    lotteryTickets: 2,
  });
});

test("level caps use the original linear scaling", () => {
  assert.deepEqual(getCapsForLevel(0), {
    inventory_cap: 15,
    display_cap: 5,
    auction_cap: 8,
    ticket_cap: 3,
    pc_cap: 12,
    visitor_cap: 20,
    repairing_cap: 4,
  });
  assert.equal(getCapsForLevel(50).inventory_cap, 64);
  assert.equal(getCapsForLevel(50).display_cap, 10);
});

test("settleGalleryEarnings suppresses MONEY_FOR_XP on passive accrual", async () => {
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  const { MongoClient } = await import("mongodb");
  const mongoServer = await MongoMemoryServer.create();
  const client = new MongoClient(mongoServer.getUri());

  try {
    await client.connect();
    const db = client.db("test-gallery-suppression");
    const playerId = "player-1";
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

    await db.collection("players").insertOne({
      _id: playerId,
      active: true,
      profile: {
        level: 1,
        xp: 0,
        bank_balance: 0,
        lottery_tickets: 0,
        last_gallery_payout: oneHourAgo,
      },
    });

    await db.collection("unique_attributes").insertOne({
      _id: "attr-money-xp",
      code: "MONEY_FOR_XP",
      active: true,
      parameters: { money_per_xp: 2 },
    });

    await db.collection("metadata").insertOne({
      _id: "loot-data",
      loot_data: {
        base_drop_value: 1000,
        level_multiplier: 1,
        basic_crate_cost: 30000000,
        items_per_basic_crate: 12,
        crate_expense_per_masterpiece: 3600000000,
        global_foil_chance: 0,
        global_unlocked_chance: 0,
        global_patreon_chance: 0,
        global_misprint_chance: 0,
        rarity_values: {
          common: { min: 1000, max: 2000 },
          uncommon: { min: 2000, max: 4000 },
          rare: { min: 4000, max: 8000 },
          legendary: { min: 8000, max: 16000 },
          masterpiece: { min: 16000, max: 32000 },
        },
        drop_tables: {
          rarity_weights: {
            1: { common: 100, uncommon: 0, rare: 0, legendary: 0, masterpiece: 0 },
          },
        },
      },
    });

    await db.collection("artworks").insertOne({
      _id: "art-1",
      active: true,
      rarity: "common",
      value_scale: 0.5,
      title: "Art 1",
      artist: "Artist 1",
    });

    await db.collection("items").insertOne({
      _id: "item-1",
      owner: playerId,
      artwork_id: "art-1",
      status: "displayed",
      active_unique_attribute: "attr-money-xp",
      condition: 1.0,
      level: 1,
      foil: false,
      seasonal: false,
      vintage: false,
      original: false,
      lottery: 0,
      values: { display: 100, sell: 50, actual: 1000 },
      authenticity: { forgery: false },
    });

    const { settleGalleryEarnings } = await import("./collection-gameplay.ts");
    const { DEFAULT_ACTUAL_GAMEPLAY_CONFIG } = await import("./game-settings.ts");
    const result = await settleGalleryEarnings(db, playerId, DEFAULT_ACTUAL_GAMEPLAY_CONFIG, now);
    assert.equal(result.intervals, 6);
    assert.equal(result.money > 0, true);
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});
