import assert from "node:assert/strict";
import test from "node:test";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import { getAuctionViews } from "./auction-gameplay.ts";
import {
  getAuctioneerMarketAccessMinutes,
  processAuctioneerInteraction,
} from "./auctioneer-gameplay.ts";
import type { GameItem } from "./gameplay.ts";
import type { LegendaryAttribute } from "./legendary-attributes.ts";
import { ART_DONOR_ATTRIBUTE_ID, AUCTIONEER_ATTRIBUTE_ID } from "./legendary-attributes.ts";
import type { GalleryNpc } from "./npc-gameplay.ts";

import { setupTestDb, STARTING_INVENTORY_TEST_OPTIONS } from "./test-utils/db-setup.ts";

test("Auctioneer quality scales initial and extended market access with own-gallery benefits", () => {
  const expected = {
    bronze: { initial: 12, extension: 7, homeInitial: 30, homeExtension: 17 },
    silver: { initial: 13, extension: 8, homeInitial: 32, homeExtension: 20 },
    gold: { initial: 14, extension: 9, homeInitial: 35, homeExtension: 22 },
    platinum: {
      initial: 15,
      extension: 10,
      homeInitial: 37,
      homeExtension: 25,
    },
  } as const;
  for (const [quality, minutes] of Object.entries(expected)) {
    assert.equal(
      getAuctioneerMarketAccessMinutes(quality as GalleryNpc["quality"], false, false),
      minutes.initial,
    );
    assert.equal(
      getAuctioneerMarketAccessMinutes(quality as GalleryNpc["quality"], false, true),
      minutes.extension,
    );
    assert.equal(
      getAuctioneerMarketAccessMinutes(quality as GalleryNpc["quality"], true, false),
      minutes.homeInitial,
    );
    assert.equal(
      getAuctioneerMarketAccessMinutes(quality as GalleryNpc["quality"], true, true),
      minutes.homeExtension,
    );
  }
});

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
    const result = await processAuctioneerInteraction(
      db,
      { _id: "player", profile: { level: 1 } },
      npc,
      now,
      () => 0,
    );
    const ownBenefits = scenario.owner !== "ordinary";
    assert.equal(result.interaction.auctionCount, 4 + (ownBenefits ? 1 : 0) + (scenario.paired ? 2 : 0),
      JSON.stringify(scenario));
    assert.equal(result.priceMultiplier, 4);
    assert.equal(new Date(result.interaction.expiration).getTime() - now.getTime(), (ownBenefits ? 37 : 15) * 60_000);
    for (const auction of result.auctions) {
      assert.equal(auction.buy_now, ownBenefits ? Math.ceil(auction.starting_bid * 1.1) : null);
      assert.deepEqual(
        auction.commission,
        ownBenefits
          ? {
              player_id: "player",
              coefficient: 0.1,
            }
          : null,
        JSON.stringify(scenario),
      );
      assert.equal(
        new Date(auction.expiration).getTime() - now.getTime(),
        10 * 60_000,
      );
    }
    if (ownBenefits) {
      assert.match(result.message, /10% commission/);
    } else {
      assert.doesNotMatch(result.message, /commission/);
    }
  }
});

const PRIVATE_AUCTION_UNIQUE_ATTRIBUTE: LegendaryAttribute = {
  _id: "attr-private-auction-price-reduction",
  code: "PRIVATE_AUCTION_PRICE_REDUCTION",
  active: true,
  title: "Private Auction Price Reduction",
  parameters: { contribution_coefficient: 0.375 },
} as unknown as LegendaryAttribute;

const AUCTION_BUY_NOW_ATTRIBUTE: LegendaryAttribute = {
  _id: "attr-auction-buy-now",
  code: "AUCTION_BUY_NOW",
  active: true,
  title: "Auction Buy Now",
  parameters: { chance: 0.5, buy_now_multiplier: 1.1 },
} as unknown as LegendaryAttribute;

test("Integration: PRIVATE_AUCTION_PRICE_REDUCTION no longer changes generated starting prices", async () => {
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

test("Integration: standard private-auction pricing is unchanged when the effect is not displayed", async () => {
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

test("Integration: standard private-auction pricing is unchanged in another player's gallery", async () => {
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

test("Integration: bid contribution parameters do not alter generated starting prices", async () => {
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
      { $set: { parameters: { contribution_coefficient: 0.55 } } },
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
      { $set: { parameters: { chance: 0.5, buy_now_multiplier: 1.2 } } },
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

    const rolls = [0.49, 0.5, 0.1, 0.9, 0.499];
    const result = await processAuctioneerInteraction(
      db,
      { _id: playerId, profile: { level: 1 } },
      npc,
      now,
      () => rolls.shift() ?? 1,
    );

    assert.equal(result.auctions.length, 5);
    for (const [index, auction] of result.auctions.entries()) {
      assert.equal(
        auction.buy_now,
        index === 0 || index === 2 || index === 4
          ? Math.ceil(auction.starting_bid * 1.2)
          : null,
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

test("Integration: Public Commission automatically applies to Auctioneer lots won by other players", async () => {
  const mongoServer = await MongoMemoryServer.create();
  const client = new MongoClient(mongoServer.getUri());

  try {
    await client.connect();
    const db: Db = client.db("test-private-auction-commission");
    const playerId = "player-1";
    const { now, futureTime } = await setupTestDb(db, playerId);
    await db.collection("artwork_effects").insertOne({
      _id: "public-commission",
      code: "MP_TRANSFERABLE_AUCTION",
      effect_type: "masterpiece",
      active: true,
      title: "Public Commission",
      description: "Auctioneer lots pay commission.",
      flavor_text: "The market remembers its patron.",
      linked_attributes: [AUCTIONEER_ATTRIBUTE_ID],
      parameters: { commission_multiplier: 2 },
    });
    await db.collection("artworks").updateOne(
      { _id: "art-1" },
      { $set: { rarity: "masterpiece", effect_id: "public-commission" } },
    );
    await db.collection<GameItem>("items").insertOne({
      _id: "public-commission-item",
      owner: playerId,
      artwork_id: "art-1",
      status: "displayed",
    } as GameItem);
    const npc: GalleryNpc = {
      _id: "npc-auctioneer-commission",
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

    const result = await processAuctioneerInteraction(
      db,
      { _id: playerId, profile: { level: 1 } },
      npc,
      now,
    );

    assert.ok(result.auctions.length > 0);
    for (const auction of result.auctions) {
      assert.equal(auction.viewer, playerId);
      assert.deepEqual(auction.commission, {
        player_id: playerId,
        coefficient: 0.2,
      });
      assert.equal(auction.transferable, true);
    }
    assert.match(result.message, /five-minute preview/);
    assert.match(result.message, /20% commission/);
    await db.collection("players").insertOne({
      _id: "featured-artist",
      active: true,
      artist_featured: true,
      artist_id: "featured-artist-record",
    });
    const featuredResult = await processAuctioneerInteraction(
      db,
      { _id: playerId, profile: { level: 1 } },
      {
        ...npc,
        _id: "npc-auctioneer-featured-commission",
        owner_id: "featured-artist",
      },
      now,
    );
    for (const auction of featuredResult.auctions) {
      assert.deepEqual(auction.commission, {
        player_id: playerId,
        coefficient: 0.2,
      });
      assert.equal(auction.transferable, true);
    }
    const ordinaryResult = await processAuctioneerInteraction(
      db,
      { _id: playerId, profile: { level: 1 } },
      {
        ...npc,
        _id: "npc-auctioneer-ordinary-commission",
        owner_id: "ordinary-player",
      },
      now,
    );
    for (const auction of ordinaryResult.auctions) {
      assert.equal(auction.commission, null);
      assert.equal(auction.transferable, undefined);
    }
    assert.doesNotMatch(ordinaryResult.message, /commission/);
    await db.collection("players").insertMany([
      {
        _id: "active-expert",
        active: true,
        profile: {
          market_expert: {
            expiration: new Date(now.getTime() + 10 * 60_000).toISOString(),
          },
        },
      },
      {
        _id: "former-bidder",
        active: true,
        profile: {
          market_expert: {
            expiration: new Date(now.getTime() - 60_000).toISOString(),
          },
        },
      },
    ]);
    const auctionIds = result.auctions.map((auction) => auction._id);
    assert.deepEqual(
      (await getAuctionViews(db, playerId, {
        itemId: result.auctions[0].item_id,
        pageSize: auctionIds.length,
        now,
      })).auctions.map((auction) => auction._id),
      [auctionIds[0]],
    );
    assert.equal(
      (await getAuctionViews(db, "active-expert", {
        auctionIds,
        pageSize: auctionIds.length,
        now,
      })).total,
      0,
    );
    assert.equal(
      (await getAuctionViews(db, playerId, {
        auctionIds,
        pageSize: auctionIds.length,
        now,
      })).total,
      auctionIds.length,
    );
    const sharedNow = new Date(now.getTime() + 5 * 60_000);
    assert.equal(
      (await getAuctionViews(db, "active-expert", {
        auctionIds,
        pageSize: auctionIds.length,
        now: sharedNow,
      })).total,
      auctionIds.length,
    );
    assert.equal(
      (await getAuctionViews(db, "former-bidder", {
        auctionIds,
        pageSize: auctionIds.length,
        now: sharedNow,
      })).total,
      0,
    );
    await db.collection("auctions").updateOne(
      { _id: auctionIds[0] },
      { $addToSet: { bidder_ids: "former-bidder" } },
    );
    assert.deepEqual(
      (await getAuctionViews(db, "former-bidder", {
        auctionIds,
        pageSize: auctionIds.length,
        now: sharedNow,
      })).auctions.map((auction) => auction._id),
      [auctionIds[0]],
    );
    assert.equal(
      (await getAuctionViews(db, playerId, {
        auctionIds,
        exclusivity: "private",
        originatedPrivateOnly: true,
        pageSize: auctionIds.length,
        now,
      })).total,
      auctionIds.length,
    );
    assert.ok(auctionIds.length >= 2);
    await db.collection("auctions").updateOne(
      { _id: auctionIds[0] },
      {
        $set: {
          "item_snapshot.card_renderer": "archive",
          "item_snapshot.mint": true,
          "item_snapshot.unlocked": true,
          "item_snapshot.attribute_ids": ["attribute-a", "special-a"],
          "item_snapshot.special_attribute_ids": ["special-a"],
          "item_snapshot.attribute_options": [
            { id: "attribute-a", label: "Attribute A", special: false },
            { id: "special-a", label: "Special A", special: true },
          ],
        },
      },
    );
    await db.collection("auctions").updateOne(
      { _id: auctionIds[1] },
      {
        $set: {
          "item_snapshot.card_renderer": "museum",
          "item_snapshot.mint": false,
          "item_snapshot.unlocked": false,
          "item_snapshot.attribute_ids": ["attribute-b"],
          "item_snapshot.special_attribute_ids": [],
          "item_snapshot.attribute_options": [
            { id: "attribute-b", label: "Attribute B", special: false },
          ],
        },
      },
    );
    const filtered = await getAuctionViews(db, playerId, {
      auctionIds,
      artStyle: "archive",
      properties: { mint: "only", unlocked: "only" },
      attributeIds: ["attribute-a", "attribute-b"],
      attributeMinimum: 1,
      specialAttributeIds: ["special-a"],
      specialAttributeMinimum: 1,
      pageSize: auctionIds.length,
      now,
    });
    assert.deepEqual(
      filtered.auctions.map((auction) => auction._id),
      [auctionIds[0]],
    );
    assert.ok(
      filtered.filterOptions.attributes.some(
        (option) => option.id === "attribute-a",
      ),
    );
    assert.ok(
      filtered.filterOptions.attributes.some(
        (option) => option.id === "attribute-b",
      ),
    );
    assert.ok(
      filtered.filterOptions.specialAttributes.some(
        (option) =>
          option.id === "special-a" && option.label === "Special A",
      ),
    );
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});
