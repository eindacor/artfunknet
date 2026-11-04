import assert from "node:assert/strict";
import test from "node:test";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import {
  processAuctioneerInteraction,
} from "./auctioneer-gameplay.ts";
import type { GameItem } from "./gameplay.ts";
import type { LegendaryAttribute } from "./legendary-attributes.ts";
import { ART_DONOR_ATTRIBUTE_ID, AUCTIONEER_ATTRIBUTE_ID } from "./legendary-attributes.ts";
import type { GalleryNpc } from "./npc-gameplay.ts";

import { setupTestDb, STARTING_INVENTORY_TEST_OPTIONS } from "./test-utils/db-setup.ts";

test("featured Auctioneers use own-gallery effects and require a live Donor in the visited gallery for the pair bonus", async t => {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  t.after(async () => { await client.close(); await server.stop(); });
  const cases = [
    { owner: "player", donor: null, paired: false },
    { owner: "player", donor: "player", paired: true },
    { owner: "artist", donor: "player", paired: false },
    { owner: "artist", donor: "elsewhere", paired: false },
    { owner: "artist", donor: "artist", paired: true },
    { owner: "artist", donor: "artist", paired: false, expired: true },
    { owner: "ordinary", donor: "ordinary", paired: false },
  ];
  for (const [index, scenario] of cases.entries()) {
    const db = client.db(`auctioneer-gallery-context-${index}`);
    const { now, futureTime } = await setupTestDb(db, "player", {
      attributes: STARTING_INVENTORY_TEST_OPTIONS.attributes,
      uniqueAttributes: [
        { _id: "pair", code: "DONOR_AUCTIONEER_TRADE", active: true, parameters: { auctioneer_item_delta: 2 } },
        { ...AUCTION_BUY_NOW_ATTRIBUTE, _id: "buy-now" },
        { ...PRIVATE_AUCTION_UNIQUE_ATTRIBUTE, _id: "price" },
      ],
    });
    await db.collection<{ _id: string }>("players").insertOne({
      _id: "artist", active: true, artist_featured: true, artist_id: "artist-record",
    });
    for (const [offset, effectId] of ["pair", "buy-now", "price"].entries()) {
      const artworkId = `art-${offset + 1}`;
      await db.collection<{ _id: string }>("artworks").updateOne({ _id: artworkId }, {
        $set: { rarity: "legendary", effect_id: effectId },
      });
      await db.collection<GameItem>("items").insertOne({
        _id: `effect-item-${offset}`, artwork_id: artworkId, owner: "player", status: "displayed",
      } as GameItem);
    }
    const npc: GalleryNpc = {
      _id: "auctioneer", attribute_id: AUCTIONEER_ATTRIBUTE_ID, owner_id: scenario.owner,
      owner_name: "Gallery", npc_name: "Auctioneer", quality: "platinum",
      spawned_at: now, expiration: futureTime, players_met: [], icon: "fa-gavel", proc_chance: 1,
    };
    if (scenario.donor) await db.collection<GalleryNpc>("npcs").insertOne({
      ...npc, _id: "donor", owner_id: scenario.donor, attribute_id: ART_DONOR_ATTRIBUTE_ID,
      expiration: scenario.expired ? new Date(now.getTime() - 1) : futureTime,
    });
    const result = await processAuctioneerInteraction(db, { _id: "player", profile: { level: 1 } }, npc, now);
    const ownBenefits = scenario.owner !== "ordinary";
    assert.equal(result.interaction.auctionCount, 4 + (ownBenefits ? 1 : 0) + (scenario.paired ? 2 : 0),
      JSON.stringify(scenario));
    assert.equal(result.priceMultiplier, ownBenefits ? 2.5 : 4);
    assert.equal(new Date(result.interaction.expiration).getTime() - now.getTime(), (ownBenefits ? 37 : 15) * 60_000);
    for (const auction of result.auctions) {
      assert.equal(auction.buy_now, ownBenefits ? Math.ceil(auction.starting_bid * 1.1) : null);
    }
  }
});

const PRIVATE_AUCTION_UNIQUE_ATTRIBUTE: LegendaryAttribute = {
  _id: "attr-private-auction-price-reduction",
  code: "PRIVATE_AUCTION_PRICE_REDUCTION",
  active: true,
  title: "Private Auction Price Reduction",
  parameters: {},
} as unknown as LegendaryAttribute;

const AUCTION_BUY_NOW_ATTRIBUTE: LegendaryAttribute = {
  _id: "attr-auction-buy-now",
  code: "AUCTION_BUY_NOW",
  active: true,
  title: "Auction Buy Now",
  parameters: { buy_now_multiplier: 1.1 },
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
    await db.collection<LegendaryAttribute>("artwork_effects").updateOne(
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

test("Integration: AUCTION_BUY_NOW adds configurable buy-now prices to own-gallery private auctions", async () => {
  const mongoServer = await MongoMemoryServer.create();
  const client = new MongoClient(mongoServer.getUri());

  try {
    await client.connect();
    const db: Db = client.db("test-private-auction-buy-now");
    const playerId = "player-1";
    const { now, futureTime } = await setupTestDb(db, playerId, {
      uniqueAttributes: [AUCTION_BUY_NOW_ATTRIBUTE],
    });

    await db.collection<LegendaryAttribute>("artwork_effects").updateOne(
      { code: "AUCTION_BUY_NOW" },
      { $set: { parameters: { buy_now_multiplier: 1.2 } } },
    );
    await db.collection<GameItem>("items").insertOne({
      _id: "item-auction-buy-now",
      owner: playerId,
      artwork_id: "art-1",
      status: "displayed",
      active_unique_attribute: "attr-auction-buy-now",
    } as GameItem);

    const npc: GalleryNpc = {
      _id: "npc-auctioneer-buy-now",
      attribute_id: AUCTIONEER_ATTRIBUTE_ID,
      owner_id: playerId,
      owner_name: "Test Player",
      npc_name: "Auctioneer",
      quality: "platinum",
      spawned_at: now,
      expiration: futureTime,
      players_met: [],
      icon: "auctioneer-icon",
      proc_chance: 1,
    };
    await db.collection<GalleryNpc>("npcs").insertOne(npc);

    const result = await processAuctioneerInteraction(
      db,
      { _id: playerId, profile: { level: 1 } },
      npc,
      now,
    );

    assert.ok(result.auctions.length > 0);
    for (const auction of result.auctions) {
      assert.equal(
        auction.buy_now,
        Math.ceil(auction.starting_bid * 1.2),
      );
    }
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});

test("Integration: AUCTION_BUY_NOW does not apply to Auctioneers in other galleries", async () => {
  const mongoServer = await MongoMemoryServer.create();
  const client = new MongoClient(mongoServer.getUri());

  try {
    await client.connect();
    const db: Db = client.db("test-private-auction-buy-now-away");
    const playerId = "player-1";
    const { now, futureTime } = await setupTestDb(db, playerId, {
      uniqueAttributes: [AUCTION_BUY_NOW_ATTRIBUTE],
    });

    await db.collection<GameItem>("items").insertOne({
      _id: "item-auction-buy-now",
      owner: playerId,
      artwork_id: "art-1",
      status: "displayed",
      active_unique_attribute: "attr-auction-buy-now",
    } as GameItem);

    const npc: GalleryNpc = {
      _id: "npc-auctioneer-buy-now-away",
      attribute_id: AUCTIONEER_ATTRIBUTE_ID,
      owner_id: "other-player",
      owner_name: "Other Player",
      npc_name: "Auctioneer",
      quality: "platinum",
      spawned_at: now,
      expiration: futureTime,
      players_met: [],
      icon: "auctioneer-icon",
      proc_chance: 1,
    };
    await db.collection<GalleryNpc>("npcs").insertOne(npc);

    const result = await processAuctioneerInteraction(
      db,
      { _id: playerId, profile: { level: 1 } },
      npc,
      now,
    );

    assert.ok(result.auctions.length > 0);
    for (const auction of result.auctions) {
      assert.equal(auction.buy_now, null);
    }
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});
