import assert from "node:assert/strict";
import test from "node:test";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import {
  ART_HISTORIAN_ATTRIBUTE_ID,
  createArtHistorianQuest,
  type ArtHistorianQuest,
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

test("Integration: Art Historian quest calculates moneyMultiplier based on active winning auctions in DB", async () => {
  const mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db: Db = client.db("test-artfunkel");
    const now = new Date();
    const futureTime = new Date(now.getTime() + 60 * 60 * 1000);
    const pastTime = new Date(now.getTime() - 60 * 60 * 1000);

    const playerId = "player-test-123";

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

    // 3. Seed active common artworks (matching level 1 drop pool)
    await db.collection<Artwork>("artworks").insertMany([
      { _id: "art-1", active: true, rarity: "common", value_scale: 0.5, title: "Art 1", artist: "Artist 1" } as Artwork,
      { _id: "art-2", active: true, rarity: "common", value_scale: 0.5, title: "Art 2", artist: "Artist 2" } as Artwork,
      { _id: "art-3", active: true, rarity: "common", value_scale: 0.5, title: "Art 3", artist: "Artist 3" } as Artwork,
      { _id: "art-4", active: true, rarity: "common", value_scale: 0.5, title: "Art 4", artist: "Artist 4" } as Artwork,
    ]);

    // 4. Seed MARKET_EXPERT_QUEST_BONUS legendary attribute definition
    const legendaryAttrId = "attr-market-expert";
    await db.collection<LegendaryAttribute>("unique_attributes").insertOne({
      _id: legendaryAttrId,
      code: "MARKET_EXPERT_QUEST_BONUS",
      active: true,
      title: "Market Expert Quest Bonus",
    } as LegendaryAttribute);

    // 5. Seed displayed item with the legendary effect in player's gallery
    await db.collection<GameItem>("items").insertOne({
      _id: "item-displayed-1",
      owner: playerId,
      artwork_id: "art-1",
      status: "displayed",
      active_unique_attribute: legendaryAttrId,
    } as GameItem);

    // 6. Seed Art Historian NPC in player's gallery
    const npc: GalleryNpc = {
      _id: "npc-historian-1",
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

    // 7. Seed auctions collection:
    // 3 active winning auctions for player
    // 1 expired auction for player (should NOT count)
    // 1 auction settling for player (should NOT count)
    // 1 active auction won by another player (should NOT count)
    await db.collection<Auction>("auctions").insertMany([
      {
        _id: "auc-1",
        current_winner_id: playerId,
        expiration: futureTime.toISOString(),
        settlement_status: "active",
      } as Auction,
      {
        _id: "auc-2",
        current_winner_id: playerId,
        expiration: futureTime.toISOString(),
        settlement_status: "active",
      } as Auction,
      {
        _id: "auc-3",
        current_winner_id: playerId,
        expiration: futureTime.toISOString(),
        settlement_status: "active",
      } as Auction,
      {
        _id: "auc-expired",
        current_winner_id: playerId,
        expiration: pastTime.toISOString(),
        settlement_status: "active",
      } as Auction,
      {
        _id: "auc-settling",
        current_winner_id: playerId,
        expiration: futureTime.toISOString(),
        settlement_status: "settling",
      } as Auction,
      {
        _id: "auc-other-player",
        current_winner_id: "other-player",
        expiration: futureTime.toISOString(),
        settlement_status: "active",
      } as Auction,
    ]);

    const playerRecord = { _id: playerId, profile: { level: 1 } };

    // Execute createArtHistorianQuest
    const createdQuest = await createArtHistorianQuest(
      db,
      playerRecord,
      npc,
      now,
    );

    // Fetch inserted quest document from MongoDB
    const persistedQuest = await db
      .collection<ArtHistorianQuest>("quests")
      .findOne({ _id: createdQuest._id });

    assert.ok(persistedQuest, "Quest should be persisted in MongoDB");
    assert.equal(persistedQuest.owner_id, playerId);

    // Expected money multiplier: 1 + 3 * 0.06 = 1.18
    // Common artwork mint: 1000 + 0.5 * (2000 - 1000) = 1500; 1500 * 0.7 = 1050
    // Base quest money for common quest: 1050 * 2 * 1.0 = 2100
    // Total money with multiplier: Math.floor(2100 * 1.18) = 2478
    const expectedMoney = Math.floor(2100 * (1 + 3 * 0.06));

    assert.equal(
      persistedQuest.reward.money,
      expectedMoney,
      `Quest reward money (${persistedQuest.reward.money}) should match calculated money with 3 active winning auctions (1.18x multiplier -> ${expectedMoney})`,
    );
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});
