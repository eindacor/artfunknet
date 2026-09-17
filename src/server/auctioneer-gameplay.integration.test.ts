import assert from "node:assert/strict";
import test from "node:test";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import {
  processAuctioneerInteraction,
} from "./auctioneer-gameplay.ts";
import type { Auction } from "./auction-gameplay.ts";
import type { Artwork, GameItem, ItemAttribute, LootData } from "./gameplay.ts";
import type { LegendaryAttribute } from "./legendary-attributes.ts";
import { AUCTIONEER_ATTRIBUTE_ID } from "./legendary-attributes.ts";
import type { GalleryNpc } from "./npc-gameplay.ts";

import { setupTestDb } from "./test-utils/db-setup.ts";

const PRIVATE_AUCTION_UNIQUE_ATTRIBUTE: LegendaryAttribute = {
  _id: "attr-private-auction-price-reduction",
  code: "PRIVATE_AUCTION_PRICE_REDUCTION",
  active: true,
  title: "Private Auction Price Reduction",
  parameters: {},
} as unknown as LegendaryAttribute;

// Golden Path Integration Test: displayed item with PRIVATE_AUCTION_PRICE_REDUCTION reduces private auction starting prices (2.5x vs 4.0x)
test("Integration: PRIVATE_AUCTION_PRICE_REDUCTION reduces private auction starting price when displayed in own gallery", async () => {
  const mongoServer = await MongoMemoryServer.create();
  const client = new MongoClient(mongoServer.getUri());

  try {
    await client.connect();
    const db: Db = client.db("test-private-auction-1");
    const playerId = "player-1";
    const { now, futureTime } = await setupTestDb(db, playerId, {
      uniqueAttributes: [PRIVATE_AUCTION_UNIQUE_ATTRIBUTE],
    });

    // Displayed item with PRIVATE_AUCTION_PRICE_REDUCTION attribute
    await db.collection<GameItem>("items").insertOne({
      _id: "item-legendary-1",
      owner: playerId,
      artwork_id: "art-1",
      status: "displayed",
      active_unique_attribute: "attr-private-auction-price-reduction",
    } as GameItem);

    // Auctioneer NPC in player's own gallery
    const npc: GalleryNpc = {
      _id: "npc-auctioneer-1",
      attribute_id: AUCTIONEER_ATTRIBUTE_ID,
      owner_id: playerId,
      owner_name: "Test Player",
      npc_name: "Auctioneer",
      quality: "platinum",
      spawned_at: now,
      expiration: futureTime,
      players_met: [],
      icon: "auctioneer-icon",
      proc_chance: 1.0,
    };
    await db.collection<GalleryNpc>("npcs").insertOne(npc);

    const result = await processAuctioneerInteraction(
      db,
      { _id: playerId, profile: { level: 1 } },
      npc,
      now,
    );

    assert.equal(result.priceMultiplier, 2.5);
    assert.ok(result.auctions.length > 0);

    for (const auction of result.auctions) {
      const item = await db.collection<GameItem>("items").findOne({ _id: auction.item_id });
      assert.ok(item, "Auction item should exist in database");
      assert.equal(auction.starting_bid, Math.floor(item.values.actual * 2.5));
    }
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});

// Negative Case 1: Item with PRIVATE_AUCTION_PRICE_REDUCTION is in inventory (not displayed)
test("Integration: PRIVATE_AUCTION_PRICE_REDUCTION does not apply when item is in inventory (not displayed)", async () => {
  const mongoServer = await MongoMemoryServer.create();
  const client = new MongoClient(mongoServer.getUri());

  try {
    await client.connect();
    const db: Db = client.db("test-private-auction-2");
    const playerId = "player-1";
    const { now, futureTime } = await setupTestDb(db, playerId, {
      uniqueAttributes: [PRIVATE_AUCTION_UNIQUE_ATTRIBUTE],
    });

    // Item is claimed in inventory, NOT displayed
    await db.collection<GameItem>("items").insertOne({
      _id: "item-legendary-1",
      owner: playerId,
      artwork_id: "art-1",
      status: "claimed",
      active_unique_attribute: "attr-private-auction-price-reduction",
    } as GameItem);

    const npc: GalleryNpc = {
      _id: "npc-auctioneer-1",
      attribute_id: AUCTIONEER_ATTRIBUTE_ID,
      owner_id: playerId,
      owner_name: "Test Player",
      npc_name: "Auctioneer",
      quality: "platinum",
      spawned_at: now,
      expiration: futureTime,
      players_met: [],
      icon: "auctioneer-icon",
      proc_chance: 1.0,
    };
    await db.collection<GalleryNpc>("npcs").insertOne(npc);

    const result = await processAuctioneerInteraction(
      db,
      { _id: playerId, profile: { level: 1 } },
      npc,
      now,
    );

    // Fallback price multiplier 4.0 when effect is not displayed
    assert.equal(result.priceMultiplier, 4);
    assert.ok(result.auctions.length > 0);

    for (const auction of result.auctions) {
      const item = await db.collection<GameItem>("items").findOne({ _id: auction.item_id });
      assert.ok(item, "Auction item should exist in database");
      assert.equal(auction.starting_bid, Math.floor(item.values.actual * 4));
    }
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});

// Negative Case 2: Visiting Auctioneer in another player's gallery
test("Integration: PRIVATE_AUCTION_PRICE_REDUCTION does not apply when visiting another player's gallery", async () => {
  const mongoServer = await MongoMemoryServer.create();
  const client = new MongoClient(mongoServer.getUri());

  try {
    await client.connect();
    const db: Db = client.db("test-private-auction-3");
    const playerId = "player-1";
    const { now, futureTime } = await setupTestDb(db, playerId, {
      uniqueAttributes: [PRIVATE_AUCTION_UNIQUE_ATTRIBUTE],
    });

    // Player has displayed item in their own gallery
    await db.collection<GameItem>("items").insertOne({
      _id: "item-legendary-1",
      owner: playerId,
      artwork_id: "art-1",
      status: "displayed",
      active_unique_attribute: "attr-private-auction-price-reduction",
    } as GameItem);

    // Auctioneer NPC belongs to another player
    const npc: GalleryNpc = {
      _id: "npc-auctioneer-1",
      attribute_id: AUCTIONEER_ATTRIBUTE_ID,
      owner_id: "other-player-999",
      owner_name: "Other Player",
      npc_name: "Auctioneer",
      quality: "platinum",
      spawned_at: now,
      expiration: futureTime,
      players_met: [],
      icon: "auctioneer-icon",
      proc_chance: 1.0,
    };
    await db.collection<GalleryNpc>("npcs").insertOne(npc);

    const result = await processAuctioneerInteraction(
      db,
      { _id: playerId, profile: { level: 1 } },
      npc,
      now,
    );

    // Fallback price multiplier 4.0 when ownGallery is false
    assert.equal(result.priceMultiplier, 4);
    assert.ok(result.auctions.length > 0);

    for (const auction of result.auctions) {
      const item = await db.collection<GameItem>("items").findOne({ _id: auction.item_id });
      assert.ok(item, "Auction item should exist in database");
      assert.equal(auction.starting_bid, Math.floor(item.values.actual * 4));
    }
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});

// Custom Parameter Test: PRIVATE_AUCTION_PRICE_REDUCTION with explicit price_multiplier parameter
test("Integration: PRIVATE_AUCTION_PRICE_REDUCTION respects custom price_multiplier parameter", async () => {
  const mongoServer = await MongoMemoryServer.create();
  const client = new MongoClient(mongoServer.getUri());

  try {
    await client.connect();
    const db: Db = client.db("test-private-auction-4");
    const playerId = "player-1";
    const { now, futureTime } = await setupTestDb(db, playerId, {
      uniqueAttributes: [PRIVATE_AUCTION_UNIQUE_ATTRIBUTE],
    });

    // Update unique_attributes document with custom parameter
    await db.collection<LegendaryAttribute>("unique_attributes").updateOne(
      { code: "PRIVATE_AUCTION_PRICE_REDUCTION" },
      { $set: { parameters: { price_multiplier: 1.8 } } },
    );

    // Displayed item with PRIVATE_AUCTION_PRICE_REDUCTION attribute
    await db.collection<GameItem>("items").insertOne({
      _id: "item-legendary-1",
      owner: playerId,
      artwork_id: "art-1",
      status: "displayed",
      active_unique_attribute: "attr-private-auction-price-reduction",
    } as GameItem);

    const npc: GalleryNpc = {
      _id: "npc-auctioneer-1",
      attribute_id: AUCTIONEER_ATTRIBUTE_ID,
      owner_id: playerId,
      owner_name: "Test Player",
      npc_name: "Auctioneer",
      quality: "platinum",
      spawned_at: now,
      expiration: futureTime,
      players_met: [],
      icon: "auctioneer-icon",
      proc_chance: 1.0,
    };
    await db.collection<GalleryNpc>("npcs").insertOne(npc);

    const result = await processAuctioneerInteraction(
      db,
      { _id: playerId, profile: { level: 1 } },
      npc,
      now,
    );

    assert.equal(result.priceMultiplier, 1.8);
    assert.ok(result.auctions.length > 0);

    for (const auction of result.auctions) {
      const item = await db.collection<GameItem>("items").findOne({ _id: auction.item_id });
      assert.ok(item, "Auction item should exist in database");
      assert.equal(auction.starting_bid, Math.floor(item.values.actual * 1.8));
    }
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});
