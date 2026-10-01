import assert from "node:assert/strict";
import test from "node:test";

import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import {
  getPublicAuctionReplenishmentCount,
  PUBLIC_AUCTION_TARGET,
} from "./auction-population.ts";
import { getAuctionSettlementDisposition } from "./auction-settlement.ts";
import type { GameItem } from "./gameplay.ts";
import type { HydratedGameItem } from "./item-artwork.ts";

test("public auctions replenish only the missing system lots", () => {
  assert.equal(PUBLIC_AUCTION_TARGET, 20);
  assert.equal(getPublicAuctionReplenishmentCount(0), 20);
  assert.equal(getPublicAuctionReplenishmentCount(7), 13);
  assert.equal(getPublicAuctionReplenishmentCount(20), 0);
  assert.equal(getPublicAuctionReplenishmentCount(24), 0);
});

test("settlement never classifies recorded bids as unsold", () => {
  assert.equal(
    getAuctionSettlementDisposition({
      currentWinnerId: null,
      currentWinnerName: null,
      currentBid: 100,
      hasBid: false,
      startingBid: 100,
    }),
    "unsold",
  );
  assert.equal(
    getAuctionSettlementDisposition({
      currentWinnerId: "player-2",
      currentWinnerName: "Test Player 2",
      currentBid: 120,
      hasBid: true,
      startingBid: 100,
    }),
    "player-sale",
  );
  assert.equal(
    getAuctionSettlementDisposition({
      currentWinnerId: null,
      currentWinnerName: "Test Player 2",
      currentBid: 120,
      hasBid: true,
      startingBid: 100,
    }),
    "unresolved-bid",
  );
  assert.equal(
    getAuctionSettlementDisposition({
      currentWinnerId: null,
      currentWinnerName: "Test Player 2",
      currentBid: 120,
      hasBid: undefined,
      startingBid: 100,
    }),
    "unresolved-bid",
  );
});

import {
  AUCTION_HOUSE_OWNER_ID,
  calculateAntiSnipeExpiration,
  createAuction,
  createCollectorResaleAuction,
  getAuctionCommissionAmount,
  grantAuctionXpReward,
  makePrivateAuctionsPublic,
  removeSettledAuctionRecord,
  settleAuction,
  type Auction,
} from "./auction-gameplay.ts";

test("auction commissions use a clamped coefficient of the final price", () => {
  assert.equal(
    getAuctionCommissionAmount({
      current_bid: 1_999,
      commission: { player_id: "player-1", coefficient: 0.1 },
    }),
    199,
  );
  assert.equal(
    getAuctionCommissionAmount({
      current_bid: 1_000,
      commission: { player_id: "player-1", coefficient: 2 },
    }),
    1_000,
  );
  assert.equal(
    getAuctionCommissionAmount({
      current_bid: 1_000,
      commission: null,
    }),
    0,
  );
});

test("private auctions become public with commission for their viewer", async () => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  try {
    await client.connect();
    const database = client.db("transferable-auctions");
    const expiration = new Date(Date.now() + 60_000).toISOString();
    await database.collection("players").insertOne({
      _id: "player-1",
      profile: {
        dismissed_private_auction_ids: ["private-1", "other-private"],
      },
    });
    await database.collection("auctions").insertMany([
      {
        _id: "private-1",
        viewer: "player-1",
        expiration,
        settlement_status: "active",
      },
      {
        _id: "other-private",
        viewer: "player-2",
        expiration,
        settlement_status: "active",
      },
    ]);

    assert.deepEqual(
      await makePrivateAuctionsPublic(
        database,
        "player-1",
        ["private-1", "other-private"],
        0.25,
      ),
      ["private-1"],
    );
    assert.deepEqual(
      await database.collection("auctions").findOne(
        { _id: "private-1" },
        { projection: { _id: 0, viewer: 1, commission: 1 } },
      ),
      {
        viewer: "public",
        commission: {
          player_id: "player-1",
          coefficient: 0.25,
        },
      },
    );
    assert.equal(
      (
        await database.collection("auctions").findOne({
          _id: "other-private",
        })
      )?.viewer,
      "player-2",
    );
    assert.deepEqual(
      (
        await database.collection("players").findOne({
          _id: "player-1",
        })
      )?.profile.dismissed_private_auction_ids,
      ["other-private"],
    );
  } finally {
    await client.close();
    await server.stop();
  }
});

test("auction settlement pays the attached commission recipient", async () => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  try {
    await client.connect();
    const database = client.db("auction-commission");
    await database.collection("players").insertMany([
      {
        _id: "commission-player",
        screen_name: "Commission Player",
        active: true,
        profile: { bank_balance: 100 },
      },
      {
        _id: "winner",
        screen_name: "Winner",
        active: true,
        profile: {
          bank_balance: 1_000,
          level: 1,
          auction_cap: 10,
          inventory_cap: 10,
          playthrough_stats: {
            items_collected: 0,
            money_spent: 0,
          },
          karma: 0,
        },
      },
    ]);
    const item = {
      _id: "commission-item",
      artwork_id: "art-1",
      owner: "commission-player",
      status: "collector_pending",
      condition: 1,
      level: 1,
      roll_count: 0,
      tags: ["for sale"],
      values: {
        actual: 1_000,
        sell: 500,
        purchase: 1_000,
        auction_min: 800,
        collector: 1_400,
        dealer: 1_200,
      },
      authenticity: {
        forgery: false,
        identified: true,
        forgery_quality: 0,
        liable: "",
        liability_pending: false,
        fee: 0,
      },
      transaction_history: [],
    } as GameItem;
    await database.collection<GameItem>("items").insertOne(item);
    const createdAuction = await createCollectorResaleAuction(
      database,
      {
        ...item,
        artwork: {
          _id: "art-1",
          title: "Commission Art",
          artist: "Artist",
          rarity: "common",
          medium: "painting",
          date: 2026,
        },
      } as HydratedGameItem,
      {
        playerId: "commission-player",
        collectorReward: 1_400,
        commissionCoefficient: 0.1,
      },
    );
    assert.equal(createdAuction.viewer, "public");
    assert.deepEqual(createdAuction.commission, {
      player_id: "commission-player",
      coefficient: 0.1,
    });
    assert.equal(
      (
        await database.collection<GameItem>("items").findOne({
          _id: item._id,
        })
      )?.owner,
      AUCTION_HOUSE_OWNER_ID,
    );
    const auction = {
      ...createdAuction,
      current_bid: 2_000,
      minimum_bid: 2_020,
      current_winner_id: "winner",
      current_winner_name: "Winner",
      has_bid: true,
      expiration: new Date(Date.now() - 1_000).toISOString(),
    } satisfies Auction;
    await database.collection<Auction>("auctions").updateOne(
      { _id: auction._id },
      {
        $set: {
          current_bid: auction.current_bid,
          minimum_bid: auction.minimum_bid,
          current_winner_id: auction.current_winner_id,
          current_winner_name: auction.current_winner_name,
          has_bid: auction.has_bid,
          expiration: auction.expiration,
        },
      },
    );

    assert.equal(await settleAuction(database, auction), true);
    assert.equal(
      (
        await database.collection("players").findOne({
          _id: "commission-player",
        })
      )?.profile.bank_balance,
      300,
    );
    assert.equal(
      (
        await database.collection<GameItem>("items").findOne({
          _id: item._id,
        })
      )?.owner,
      "winner",
    );
    assert.equal(
      await database.collection<Auction>("auctions").countDocuments({
        _id: auction._id,
      }),
      0,
    );
    const commissionNotification = await database
      .collection("player_notifications")
      .findOne({ user_id: "commission-player", kind: "success" });
    assert.match(commissionNotification?.message ?? "", /\$200 commission/);
  } finally {
    await client.close();
    await server.stop();
  }
});

test("auction settlement notifies the seller after a successful sale", async () => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  try {
    await client.connect();
    const database = client.db("auction-seller-notification");
    await database.collection("players").insertMany([
      {
        _id: "seller",
        screen_name: "Seller",
        active: true,
        profile: { bank_balance: 100 },
      },
      {
        _id: "winner",
        screen_name: "Winner",
        active: true,
        profile: {
          bank_balance: 1_000,
          level: 1,
          auction_cap: 10,
          inventory_cap: 10,
          playthrough_stats: {
            items_collected: 0,
            money_spent: 0,
          },
          karma: 0,
        },
      },
    ]);
    const item = {
      _id: "seller-item",
      artwork_id: "art-1",
      owner: "seller",
      status: "auctioned",
      condition: 1,
      level: 1,
      roll_count: 0,
      tags: [],
      values: {
        actual: 1_000,
        sell: 500,
        purchase: 1_000,
        auction_min: 800,
        collector: 1_400,
        dealer: 1_200,
      },
      authenticity: {
        forgery: false,
        identified: true,
        forgery_quality: 0,
        liable: "",
        liability_pending: false,
        fee: 0,
      },
      transaction_history: [],
    } as GameItem;
    await database.collection<GameItem>("items").insertOne(item);
    const createdAuction = await createAuction(
      database,
      {
        ...item,
        artwork: {
          _id: "art-1",
          title: "Seller Art",
          artist: "Artist",
          rarity: "common",
          medium: "painting",
          date: 2026,
        },
      } as HydratedGameItem,
      {
        sellerId: "seller",
        sellerName: "Seller",
        startingBid: 800,
        buyNow: null,
        durationMinutes: 60,
      },
    );
    const auction = {
      ...createdAuction,
      current_bid: 1_250,
      minimum_bid: 1_270,
      current_winner_id: "winner",
      current_winner_name: "Winner",
      has_bid: true,
      expiration: new Date(Date.now() - 1_000).toISOString(),
    } satisfies Auction;
    await database.collection<Auction>("auctions").updateOne(
      { _id: auction._id },
      {
        $set: {
          current_bid: auction.current_bid,
          minimum_bid: auction.minimum_bid,
          current_winner_id: auction.current_winner_id,
          current_winner_name: auction.current_winner_name,
          has_bid: auction.has_bid,
          expiration: auction.expiration,
        },
      },
    );

    assert.equal(await settleAuction(database, auction), true);
    const sellerNotification = await database
      .collection("player_notifications")
      .findOne({ user_id: "seller", kind: "success" });
    assert.match(
      sellerNotification?.message ?? "",
      /Seller Art sold at auction for \$1,250/,
    );
  } finally {
    await client.close();
    await server.stop();
  }
});

test("calculateAntiSnipeExpiration extends expiration when remaining time is under configured minutes", () => {
  const now = new Date("2026-09-10T20:00:00.000Z");
  // Expiration 2 minutes from now, extension 5 minutes -> extends to now + 5 min (20:05:00)
  const exp2Min = "2026-09-10T20:02:00.000Z";
  assert.equal(
    calculateAntiSnipeExpiration(exp2Min, 5, now),
    "2026-09-10T20:05:00.000Z",
  );

  // Expiration 10 minutes from now, extension 5 minutes -> remains 20:10:00
  const exp10Min = "2026-09-10T20:10:00.000Z";
  assert.equal(
    calculateAntiSnipeExpiration(exp10Min, 5, now),
    "2026-09-10T20:10:00.000Z",
  );

  // Expiration 7 minutes from now, custom extension 10 minutes -> extends to now + 10 min (20:10:00)
  const exp7Min = "2026-09-10T20:07:00.000Z";
  assert.equal(
    calculateAntiSnipeExpiration(exp7Min, 10, now),
    "2026-09-10T20:10:00.000Z",
  );
});

test("removing a private auction also removes its dismissed profile reference", async () => {
  let playerUpdate: { query: unknown; update: unknown } | null = null;
  const database = {
    collection(name: string) {
      if (name === "auctions") {
        return {
          deleteOne: async () => ({ deletedCount: 1 }),
        };
      }
      if (name === "players") {
        return {
          updateOne: async (query: unknown, update: unknown) => {
            playerUpdate = { query, update };
            return { matchedCount: 1 };
          },
        };
      }
      throw new Error(`Unexpected collection ${name}`);
    },
  };

  await removeSettledAuctionRecord(database as never, {
    _id: "auction-1",
    viewer: "player-1",
  });

  assert.deepEqual(playerUpdate, {
    query: { _id: "player-1" },
    update: {
      $pull: {
        "profile.dismissed_private_auction_ids": "auction-1",
      },
    },
  });
});

test("grantAuctionXpReward returns null when marketExpert is false", async () => {
  const result = await grantAuctionXpReward(
    {} as never,
    { _id: "p1", profile: { level: 1, xp: 0 } },
    false,
  );
  assert.equal(result, null);
});

test("grantAuctionXpReward awards XP when marketExpert is true and XP_FOR_AUCTIONS is displayed", async () => {
  let updatedPlayer:
    | { query: unknown; update: { $set: Record<string, number> } }
    | undefined;
  const mockDb = {
    collection: (name: string) => {
      if (name === "items") {
        return {
          find: () => ({
            project: () => ({
              toArray: async () => [{ artwork_id: "art-xp-auc" }],
            }),
          }),
        };
      }
      if (name === "artworks") {
        return {
          find: () => ({
            project: () => ({
              toArray: async () => [{ effect_id: "attr-xp-auc" }],
            }),
          }),
        };
      }
      if (name === "artwork_effects") {
        return {
          find: (query: { _id?: { $in?: string[] } }) => ({
            sort: () => ({
              toArray: async () =>
                query._id?.$in?.includes("attr-xp-auc")
                  ? [
                      {
                        _id: "attr-xp-auc",
                        code: "XP_FOR_AUCTIONS",
                        active: true,
                        parameters: {},
                      },
                    ]
                  : [],
            }),
          }),
        };
      }
      if (name === "players") {
        return {
          updateOne: async (
            query: unknown,
            update: { $set: Record<string, number> },
          ) => {
            updatedPlayer = { query, update };
            return { modifiedCount: 1 };
          },
        };
      }
      if (name === "metadata") {
        return {
          bulkWrite: async () => ({ modifiedCount: 1 }),
        };
      }
      return {};
    },
  };

  const result = await grantAuctionXpReward(
    mockDb as never,
    { _id: "p1", profile: { level: 1, xp: 0 } },
    true,
  );

  assert.notEqual(result, null);
  assert.equal(result?.xpGranted, 58);
  assert.equal(result?.bonusMoneyGranted, 0);
  assert.ok(updatedPlayer);
  assert.equal(updatedPlayer.update.$set["profile.xp"], 58);
});
