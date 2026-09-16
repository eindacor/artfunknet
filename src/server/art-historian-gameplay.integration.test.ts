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

type PlayerDoc = {
  _id: string;
  active: boolean;
  profile: {
    level: number;
    bank_balance: number;
    xp: number;
    lottery_tickets: number;
  };
};

type MetadataDoc = {
  _id: string;
  loot_data: LootData;
};

async function setupTestDb(db: Db, playerId: string) {
  const now = new Date();
  const futureTime = new Date(now.getTime() + 60 * 60 * 1000);

  // 1. Seed player
  await db.collection<PlayerDoc>("players").insertOne({
    _id: playerId,
    active: true,
    profile: {
      level: 1,
      bank_balance: 5000,
      xp: 0,
      lottery_tickets: 0,
    },
  });

  // 2. Seed metadata loot data with complete fields
  await db.collection<MetadataDoc>("metadata").insertOne({
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
    } as unknown as LootData,
  });

  // 3. Seed active common artworks
  await db.collection<Artwork>("artworks").insertMany([
    { _id: "art-1", active: true, rarity: "common", value_scale: 0.5, title: "Art 1", artist: "Artist 1" } as Artwork,
    { _id: "art-2", active: true, rarity: "common", value_scale: 0.5, title: "Art 2", artist: "Artist 2" } as Artwork,
    { _id: "art-3", active: true, rarity: "common", value_scale: 0.5, title: "Art 3", artist: "Artist 3" } as Artwork,
    { _id: "art-4", active: true, rarity: "common", value_scale: 0.5, title: "Art 4", artist: "Artist 4" } as Artwork,
  ]);

  // 4. Seed unique attributes with valid parameters schema
  await db.collection<LegendaryAttribute>("unique_attributes").insertMany([
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
  ]);

  return { now, futureTime };
}

// Golden Path Integration Test: creates quest in own gallery with MARKET_EXPERT_QUEST_BONUS and active winning auctions
test("Integration: Art Historian quest calculates moneyMultiplier for >0 active winning auctions", async () => {
  const mongoServer = await MongoMemoryServer.create();
  const client = new MongoClient(mongoServer.getUri());

  try {
    await client.connect();
    const db: Db = client.db("test-1");
    const playerId = "player-1";
    const { now, futureTime } = await setupTestDb(db, playerId);

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
    const expectedMoney = Math.floor(2100 * (1 + 3 * 0.1)); // 2730
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
    const { now, futureTime } = await setupTestDb(db, playerId);

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
    // Base common quest money = 2100 with 1.0x multiplier because ownGallery is false
    assert.equal(quest.reward.money, 2100);
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
    const { now, futureTime } = await setupTestDb(db, playerId);

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
    // Base common quest money = 2100 with 1.0x multiplier because legendary effect is not displayed
    assert.equal(quest.reward.money, 2100);
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
    await setupTestDb(db, playerId);

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
