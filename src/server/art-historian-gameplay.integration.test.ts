import assert from "node:assert/strict";
import test from "node:test";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import {
  ART_HISTORIAN_ATTRIBUTE_ID,
  createArtHistorianQuest,
} from "./art-historian-gameplay.ts";
import type { Auction } from "./auction-gameplay.ts";
import type { Artwork, GameItem, LootData } from "./gameplay.ts";
import type { LegendaryAttribute } from "./legendary-attributes.ts";
import type { GalleryNpc } from "./npc-gameplay.ts";

import { setupTestDb } from "./test-utils/db-setup.ts";

const HISTORIAN_UNIQUE_ATTRIBUTES = [
  {
    _id: "attr-market-expert",
    code: "MARKET_EXPERT_QUEST_BONUS",
    active: true,
    title: "Market Expert Quest Bonus",
    parameters: { multiplier_per_winning_auction: 0.1 },
  } as unknown as LegendaryAttribute,
  {
    _id: "attr-xp-bonus",
    code: "QUEST_XP_BONUS",
    active: true,
    title: "Quest XP Bonus",
    parameters: {},
  } as unknown as LegendaryAttribute,
  {
    _id: "attr-money-for-xp",
    code: "MONEY_FOR_XP",
    active: true,
    title: "Money For XP",
    parameters: { money_per_xp: 2 },
  } as unknown as LegendaryAttribute,
];

// Golden Path Integration Test: creates quest in own gallery with MARKET_EXPERT_QUEST_BONUS and active winning auctions
test("Integration: Art Historian quest calculates moneyMultiplier for >0 active winning auctions", async () => {
  const mongoServer = await MongoMemoryServer.create();
  const client = new MongoClient(mongoServer.getUri());

  try {
    await client.connect();
    const db: Db = client.db("test-1");
    const playerId = "player-1";
    const { now, futureTime } = await setupTestDb(db, playerId, {
      uniqueAttributes: HISTORIAN_UNIQUE_ATTRIBUTES,
    });

    await db.collection<GameItem>("items").insertOne({
      _id: "item-1",
      owner: playerId,
      artwork_id: "art-1",
      status: "displayed",
      active_unique_attribute: "attr-market-expert",
    } as GameItem);

    const npc: GalleryNpc = {
      _id: "npc-1",
      attribute_id: ART_HISTORIAN_ATTRIBUTE_ID,
      owner_id: playerId,
      owner_name: "Test Player",
      npc_name: "Art Historian",
      quality: "platinum",
      spawned_at: now,
      expiration: futureTime,
      players_met: [],
      icon: "historian-icon",
      proc_chance: 1.0,
    };
    await db.collection<GalleryNpc>("npcs").insertOne(npc);

    // 3 active winning auctions
    await db.collection<Auction>("auctions").insertMany([
      { _id: "a1", current_winner_id: playerId, expiration: futureTime.toISOString(), settlement_status: "active" } as Auction,
      { _id: "a2", current_winner_id: playerId, expiration: futureTime.toISOString(), settlement_status: "active" } as Auction,
      { _id: "a3", current_winner_id: playerId, expiration: futureTime.toISOString(), settlement_status: "active" } as Auction,
    ]);

    const quest = await createArtHistorianQuest(db, { _id: playerId, profile: { level: 1 } }, npc, now);
    const expectedMoney = Math.floor(2520 * (1 + 3 * 0.1)); // 3276
    assert.equal(quest.reward.money, expectedMoney);
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});

// Important Negative Case 1: NPC is in another player's gallery
test("Integration: MARKET_EXPERT_QUEST_BONUS does not trigger when visiting another player's gallery", async () => {
  const mongoServer = await MongoMemoryServer.create();
  const client = new MongoClient(mongoServer.getUri());

  try {
    await client.connect();
    const db: Db = client.db("test-2");
    const playerId = "player-1";
    const { now, futureTime } = await setupTestDb(db, playerId, {
      uniqueAttributes: HISTORIAN_UNIQUE_ATTRIBUTES,
    });

    await db.collection<GameItem>("items").insertOne({
      _id: "item-1",
      owner: playerId,
      artwork_id: "art-1",
      status: "displayed",
      active_unique_attribute: "attr-market-expert",
    } as GameItem);

    // NPC belongs to another player (visiting another player's gallery)
    const npc: GalleryNpc = {
      _id: "npc-1",
      attribute_id: ART_HISTORIAN_ATTRIBUTE_ID,
      owner_id: "other-player-456",
      owner_name: "Other Player",
      npc_name: "Art Historian",
      quality: "platinum",
      spawned_at: now,
      expiration: futureTime,
      players_met: [],
      icon: "historian-icon",
      proc_chance: 1.0,
    };
    await db.collection<GalleryNpc>("npcs").insertOne(npc);

    // 3 active winning auctions for player-1
    await db.collection<Auction>("auctions").insertMany([
      { _id: "a1", current_winner_id: playerId, expiration: futureTime.toISOString(), settlement_status: "active" } as Auction,
      { _id: "a2", current_winner_id: playerId, expiration: futureTime.toISOString(), settlement_status: "active" } as Auction,
      { _id: "a3", current_winner_id: playerId, expiration: futureTime.toISOString(), settlement_status: "active" } as Auction,
    ]);

    const quest = await createArtHistorianQuest(db, { _id: playerId, profile: { level: 1 } }, npc, now);
    // Base common quest money = 2520 with 1.0x multiplier because ownGallery is false
    assert.equal(quest.reward.money, 2520);
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});

// Important Negative Case 2: Legendary effect artwork is in inventory, not displayed
test("Integration: MARKET_EXPERT_QUEST_BONUS triggers only when legendary effect is on a displayed artwork", async () => {
  const mongoServer = await MongoMemoryServer.create();
  const client = new MongoClient(mongoServer.getUri());

  try {
    await client.connect();
    const db: Db = client.db("test-3");
    const playerId = "player-1";
    const { now, futureTime } = await setupTestDb(db, playerId, {
      uniqueAttributes: HISTORIAN_UNIQUE_ATTRIBUTES,
    });

    // Item is in inventory ("claimed"), NOT displayed
    await db.collection<GameItem>("items").insertOne({
      _id: "item-1",
      owner: playerId,
      artwork_id: "art-1",
      status: "claimed",
      active_unique_attribute: "attr-market-expert",
    } as GameItem);

    const npc: GalleryNpc = {
      _id: "npc-1",
      attribute_id: ART_HISTORIAN_ATTRIBUTE_ID,
      owner_id: playerId,
      owner_name: "Test Player",
      npc_name: "Art Historian",
      quality: "platinum",
      spawned_at: now,
      expiration: futureTime,
      players_met: [],
      icon: "historian-icon",
      proc_chance: 1.0,
    };
    await db.collection<GalleryNpc>("npcs").insertOne(npc);

    // 3 active winning auctions
    await db.collection<Auction>("auctions").insertMany([
      { _id: "a1", current_winner_id: playerId, expiration: futureTime.toISOString(), settlement_status: "active" } as Auction,
      { _id: "a2", current_winner_id: playerId, expiration: futureTime.toISOString(), settlement_status: "active" } as Auction,
      { _id: "a3", current_winner_id: playerId, expiration: futureTime.toISOString(), settlement_status: "active" } as Auction,
    ]);

    const quest = await createArtHistorianQuest(db, { _id: playerId, profile: { level: 1 } }, npc, now);
    // Base common quest money = 2520 with 1.0x multiplier because legendary effect is not displayed
    assert.equal(quest.reward.money, 2520);
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});

// Test: MONEY_FOR_XP displayed effect detection during quest reward evaluation
test("Integration: MONEY_FOR_XP active effect is resolved correctly for displayed legendary artwork", async () => {
  const mongoServer = await MongoMemoryServer.create();
  const client = new MongoClient(mongoServer.getUri());

  try {
    await client.connect();
    const db: Db = client.db("test-4");
    const playerId = "player-1";
    await setupTestDb(db, playerId, {
      uniqueAttributes: HISTORIAN_UNIQUE_ATTRIBUTES,
    });

    // Seed displayed item with MONEY_FOR_XP effect
    await db.collection<GameItem>("items").insertOne({
      _id: "item-money-xp",
      owner: playerId,
      artwork_id: "art-1",
      status: "displayed",
      active_unique_attribute: "attr-money-for-xp",
    } as GameItem);

    const { getDisplayedLegendaryEffect, getLegendaryNumberParameter } = await import("./legendary-attributes.ts");
    const effect = await getDisplayedLegendaryEffect(db, playerId, "MONEY_FOR_XP");
    assert.notEqual(effect, null);
    assert.equal(effect?._id, "attr-money-for-xp");
    const moneyPerXp = getLegendaryNumberParameter(effect, "money_per_xp", 2);
    assert.equal(moneyPerXp, 2);

    const xpReward = 100;
    const moneyForXpBonus = Math.floor(xpReward * moneyPerXp);
    assert.equal(moneyForXpBonus, 200);
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});
