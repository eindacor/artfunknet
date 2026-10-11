import assert from "node:assert/strict";
import test from "node:test";

import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import { getPlayerAuctionEscrow } from "./auction-gameplay.ts";
import {
  createInitialLiveAuctionState,
  getAdvancedLiveAuctionState,
  getLiveAuctionAdminView,
  getLiveAuctionBidDecision,
  getLiveAuctionItemTerms,
  LIVE_AUCTION_STATE_ID,
  LiveAuctionError,
  normalizeTwitchStreamUrl,
  placeLiveAuctionBid,
  removeLiveAuctionBufferedItem,
  stopLiveAuction,
} from "./live-auction-event.ts";

test("Twitch stream URLs normalize to a canonical channel URL", () => {
  assert.equal(
    normalizeTwitchStreamUrl("https://www.twitch.tv/ArtFunkel"),
    "https://www.twitch.tv/artfunkel",
  );
  assert.equal(
    normalizeTwitchStreamUrl(
      "https://player.twitch.tv/?channel=ArtFunkel&parent=localhost",
    ),
    "https://www.twitch.tv/artfunkel",
  );
  assert.throws(
    () => normalizeTwitchStreamUrl("https://example.com/stream"),
    LiveAuctionError,
  );
});

test("live-auction item terms use rounded-up estimated value and configured increment", () => {
  assert.deepEqual(
    getLiveAuctionItemTerms({
      values: {
        actual: 12_345.25,
        auction_min: 2_500,
      },
    }, 500),
    {
      current_bid: 0,
      minimum_bid: 12_346,
      increment: 500,
    },
  );
});

test("bid decision charges a returning winner only the delta", () => {
  const decision = getLiveAuctionBidDecision(
    {
      live: true,
      hidden: false,
      current_item_id: "item-1",
      current_bid: 1_000,
      minimum_bid: 1_100,
      increment: 100,
      winner_id: "player-1",
    },
    "player-1",
    1_300,
  );
  assert.deepEqual(decision, {
    charge: 300,
    previousWinnerRefund: 0,
    nextMinimumBid: 1_400,
    sameWinner: true,
  });
});

test("bid decision charges a new winner fully and identifies refund", () => {
  const decision = getLiveAuctionBidDecision(
    {
      live: true,
      hidden: false,
      current_item_id: "item-1",
      current_bid: 1_000,
      minimum_bid: 1_100,
      increment: 100,
      winner_id: "player-1",
    },
    "player-2",
    1_200,
  );
  assert.equal(decision.charge, 1_200);
  assert.equal(decision.previousWinnerRefund, 1_000);
  assert.equal(decision.nextMinimumBid, 1_300);
});

test("bid decision rejects hidden and unsafe bids", () => {
  const state = {
    live: true,
    hidden: true,
    current_item_id: "item-1",
    current_bid: 1_000,
    minimum_bid: 1_100,
    increment: 100,
    winner_id: null,
  };
  assert.throws(
    () => getLiveAuctionBidDecision(state, "player-1", 1_200),
    LiveAuctionError,
  );
  assert.throws(
    () =>
      getLiveAuctionBidDecision(
        { ...state, hidden: false },
        "player-1",
        Number.MAX_SAFE_INTEGER,
      ),
    LiveAuctionError,
  );
});

test("advancing loads the next buffer item hidden and clears the winner", () => {
  const state = {
    ...createInitialLiveAuctionState(new Date("2026-09-30T16:00:00.000Z")),
    live: true,
    hidden: false,
    current_item_id: "sold",
    buffer_item_ids: ["next", "later"],
    current_bid: 4_000,
    minimum_bid: 4_200,
    increment: 200,
    winner_id: "winner",
    winner_name: "Winner",
    configured_increment: 750,
    version: 7,
  };
  const advanced = getAdvancedLiveAuctionState(
    state,
    { values: { actual: 20_000, auction_min: 3_000 } },
    {
      now: new Date("2026-09-30T17:00:00.000Z"),
      updatedBy: "admin@example.com",
    },
  );
  assert.equal(advanced.live, true);
  assert.equal(advanced.hidden, true);
  assert.equal(advanced.current_item_id, "next");
  assert.deepEqual(advanced.buffer_item_ids, ["later"]);
  assert.equal(advanced.minimum_bid, 20_000);
  assert.equal(advanced.increment, 750);
  assert.equal(advanced.winner_id, null);
  assert.equal(advanced.version, 8);
});

test("advancing an empty buffer leaves live thank-you state", () => {
  const state = {
    ...createInitialLiveAuctionState(),
    live: true,
    current_item_id: "sold",
    buffer_item_ids: [],
  };
  const advanced = getAdvancedLiveAuctionState(state, null, {
    updatedBy: "admin",
  });
  assert.equal(advanced.live, true);
  assert.equal(advanced.current_item_id, null);
  assert.equal(advanced.current_bid, 0);
  assert.equal(advanced.minimum_bid, 0);
});

test("removing a buffered live-auction item deletes only that claimed system item", async () => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  try {
    await client.connect();
    const database = client.db("live-auction-buffer-removal");
    await database.collection("items").insertMany([
      {
        _id: "remove-me",
        owner: "system:live-auction",
        status: "claimed",
      },
      {
        _id: "keep-me",
        owner: "system:live-auction",
        status: "claimed",
      },
    ]);
    await database.collection("metadata").insertOne({
      ...createInitialLiveAuctionState(),
      buffer_item_ids: ["remove-me", "keep-me"],
    });

    const state = await removeLiveAuctionBufferedItem(
      database,
      "remove-me",
      "admin@example.com",
    );

    assert.deepEqual(state.buffer_item_ids, ["keep-me"]);
    assert.equal(
      await database.collection("items").findOne({ _id: "remove-me" }),
      null,
    );
    assert.ok(
      await database.collection("items").findOne({ _id: "keep-me" }),
    );
  } finally {
    await client.close();
    await server.stop();
  }
});

test("pending live-auction refunds use and clean transient receipts", async () => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  try {
    await client.connect();
    const database = client.db("live-auction-refund-recovery");
    await database.collection("players").insertOne({
      _id: "player-1",
      active: true,
      screen_name: "Player One",
      profile: {
        bank_balance: 100,
        inventory_cap: 10,
        playthrough_stats: {},
      },
    });
    await database.collection("metadata").insertOne({
      ...createInitialLiveAuctionState(),
      pending_refunds: [
        { id: "refund-1", player_id: "player-1", amount: 250 },
      ],
    });

    await getLiveAuctionAdminView(database);
    await getLiveAuctionAdminView(database);

    const player = await database.collection("players").findOne({
      _id: "player-1",
    });
    const state = await database.collection("metadata").findOne({
      _id: LIVE_AUCTION_STATE_ID,
    });
    assert.equal(player?.profile.bank_balance, 350);
    assert.equal(player?.profile.live_auction_refund_receipt, undefined);
    assert.equal(player?.profile.live_auction_refund_ids, undefined);
    assert.deepEqual(state?.pending_refunds, []);
  } finally {
    await client.close();
    await server.stop();
  }
});

test("an interrupted live-auction refund is not credited twice", async () => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  try {
    await client.connect();
    const database = client.db("live-auction-refund-interrupted");
    await database.collection("players").insertOne({
      _id: "player-1",
      active: true,
      screen_name: "Player One",
      profile: {
        bank_balance: 350,
        inventory_cap: 10,
        live_auction_refund_receipt: {
          id: "refund-1",
          credited_at: "2026-10-10T12:00:00.000Z",
        },
        playthrough_stats: {},
      },
    });
    await database.collection("metadata").insertOne({
      ...createInitialLiveAuctionState(),
      pending_refunds: [
        { id: "refund-1", player_id: "player-1", amount: 250 },
      ],
    });

    await getLiveAuctionAdminView(database);

    const [player, state] = await Promise.all([
      database.collection("players").findOne({ _id: "player-1" }),
      database.collection("metadata").findOne({
        _id: LIVE_AUCTION_STATE_ID,
      }),
    ]);
    assert.equal(player?.profile.bank_balance, 350);
    assert.equal(player?.profile.live_auction_refund_receipt, undefined);
    assert.deepEqual(state?.pending_refunds, []);
  } finally {
    await client.close();
    await server.stop();
  }
});

test("an interrupted live-auction bid charge is refunded once", async () => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  try {
    await client.connect();
    const database = client.db("live-auction-bid-recovery");
    await database.collection("players").insertOne({
      _id: "player-1",
      active: true,
      screen_name: "Player One",
      profile: {
        bank_balance: 300,
        inventory_cap: 10,
        live_auction_bid_operation_ids: ["bid-1"],
        playthrough_stats: {},
      },
    });
    await database.collection("artworks").insertOne({
      _id: "art-1",
      title: "Current Work",
    });
    await database.collection("items").insertOne({
      _id: "item-1",
      artwork_id: "art-1",
      owner: "system:live-auction",
      status: "auctioned",
    });
    await database.collection("metadata").insertOne({
      ...createInitialLiveAuctionState(),
      live: true,
      hidden: false,
      current_item_id: "item-1",
      current_bid: 100,
      minimum_bid: 110,
      increment: 10,
      lock: {
        token: "bid-1",
        action: "bid",
        expires_at: "2000-01-01T00:00:00.000Z",
        player_id: "player-1",
        charge: 200,
      },
    });

    await getLiveAuctionAdminView(database);
    await getLiveAuctionAdminView(database);

    const [player, state] = await Promise.all([
      database.collection("players").findOne({ _id: "player-1" }),
      database.collection("metadata").findOne({
        _id: LIVE_AUCTION_STATE_ID,
      }),
    ]);
    assert.equal(player?.profile.bank_balance, 500);
    assert.deepEqual(player?.profile.live_auction_bid_operation_ids, []);
    assert.equal(state?.lock, undefined);
    assert.equal(state?.current_bid, 100);
  } finally {
    await client.close();
    await server.stop();
  }
});

test("placing a live-auction bid commits the state and charge together", async () => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  try {
    await client.connect();
    const database = client.db("live-auction-bid-commit");
    await database.collection("players").insertOne({
      _id: "player-1",
      active: true,
      screen_name: "Player One",
      profile: {
        bank_balance: 1_000,
        inventory_cap: 10,
        expansion_slots: 0,
        playthrough_stats: {},
      },
    });
    await database.collection("items").insertOne({
      _id: "item-1",
      owner: "system:live-auction",
      status: "auctioned",
      original: false,
      vintage: false,
    });
    await database.collection("metadata").insertOne({
      ...createInitialLiveAuctionState(),
      live: true,
      hidden: false,
      current_item_id: "item-1",
      current_bid: 100,
      minimum_bid: 110,
      increment: 10,
    });
    await database.collection("auctions").insertOne({
      _id: "standard-auction",
      current_winner_id: "player-1",
      current_bid: 75,
      expiration: "2099-01-01T00:00:00.000Z",
      settlement_status: "active",
    });

    const result = await placeLiveAuctionBid(
      database,
      "player-1",
      200,
      new Date("2026-10-01T16:00:00.000Z"),
    );

    const [player, state] = await Promise.all([
      database.collection("players").findOne({ _id: "player-1" }),
      database.collection("metadata").findOne({
        _id: LIVE_AUCTION_STATE_ID,
      }),
    ]);
    assert.equal(result.bankBalance, 800);
    assert.equal(player?.profile.bank_balance, 800);
    assert.deepEqual(player?.profile.live_auction_bid_operation_ids, []);
    assert.equal(state?.current_bid, 200);
    assert.equal(state?.minimum_bid, 210);
    assert.equal(state?.winner_id, "player-1");
    assert.equal(state?.lock, undefined);
    assert.equal(typeof state?.last_bid_operation_id, "string");
    assert.equal(await getPlayerAuctionEscrow(database, "player-1"), 275);
  } finally {
    await client.close();
    await server.stop();
  }
});

test("interrupted live-auction start and stop restore item state", async () => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  try {
    await client.connect();
    const database = client.db("live-auction-transition-recovery");
    await database.collection("artworks").insertOne({
      _id: "art-1",
      title: "Buffered Work",
    });
    await database.collection("items").insertOne({
      _id: "item-1",
      artwork_id: "art-1",
      owner: "system:live-auction",
      status: "auctioned",
    });
    await database.collection("metadata").insertOne({
      ...createInitialLiveAuctionState(),
      buffer_item_ids: ["item-1"],
      lock: {
        token: "start-1",
        action: "start",
        expires_at: "2000-01-01T00:00:00.000Z",
      },
    });

    await getLiveAuctionAdminView(database);
    assert.equal(
      (
        await database.collection("items").findOne({ _id: "item-1" })
      )?.status,
      "claimed",
    );

    await Promise.all([
      database.collection("items").updateOne(
        { _id: "item-1" },
        { $set: { status: "claimed" } },
      ),
      database.collection("metadata").replaceOne(
        { _id: LIVE_AUCTION_STATE_ID },
        {
          ...createInitialLiveAuctionState(),
          live: true,
          current_item_id: "item-1",
          current_bid: 100,
          minimum_bid: 110,
          increment: 10,
          lock: {
            token: "stop-1",
            action: "stop",
            expires_at: "2000-01-01T00:00:00.000Z",
          },
        },
      ),
    ]);

    await getLiveAuctionAdminView(database);
    const [item, state] = await Promise.all([
      database.collection("items").findOne({ _id: "item-1" }),
      database.collection("metadata").findOne({
        _id: LIVE_AUCTION_STATE_ID,
      }),
    ]);
    assert.equal(item?.status, "auctioned");
    assert.equal(state?.lock, undefined);
    assert.equal(state?.live, true);
  } finally {
    await client.close();
    await server.stop();
  }
});

test("stopping a live auction durably refunds the winning bidder", async () => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  try {
    await client.connect();
    const database = client.db("live-auction-stop-refund");
    await database.collection("players").insertOne({
      _id: "player-1",
      active: true,
      screen_name: "Player One",
      profile: {
        bank_balance: 100,
        inventory_cap: 10,
        playthrough_stats: {},
      },
    });
    await database.collection("items").insertOne({
      _id: "item-1",
      owner: "system:live-auction",
      status: "auctioned",
    });
    await database.collection("metadata").insertOne({
      ...createInitialLiveAuctionState(),
      live: true,
      hidden: false,
      current_item_id: "item-1",
      current_bid: 400,
      minimum_bid: 450,
      increment: 50,
      winner_id: "player-1",
      winner_name: "Player One",
    });

    await stopLiveAuction(database, "admin-1");

    const [player, item, state] = await Promise.all([
      database.collection("players").findOne({ _id: "player-1" }),
      database.collection("items").findOne({ _id: "item-1" }),
      database.collection("metadata").findOne({
        _id: LIVE_AUCTION_STATE_ID,
      }),
    ]);
    assert.equal(player?.profile.bank_balance, 500);
    assert.equal(item?.status, "claimed");
    assert.equal(state?.live, false);
    assert.deepEqual(state?.buffer_item_ids, ["item-1"]);
    assert.deepEqual(state?.pending_refunds, []);
    assert.equal(player?.profile.live_auction_refund_receipt, undefined);
    assert.equal(player?.profile.live_auction_refund_ids, undefined);
  } finally {
    await client.close();
    await server.stop();
  }
});

test("interrupted live-auction acceptance completes without duplicate effects", async () => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  try {
    await client.connect();
    const database = client.db("live-auction-acceptance-recovery");
    const settlementId = "settlement-1";
    await database.collection("players").insertOne({
      _id: "winner-1",
      active: true,
      screen_name: "Winner",
      profile: {
        bank_balance: 100,
        inventory_cap: 10,
        playthrough_stats: {
          items_collected: 0,
          money_spent: 0,
        },
      },
    });
    await database.collection("artworks").insertOne({
      _id: "art-1",
      title: "Recovered Work",
      artist: "Artist",
      rarity: "rare",
      active: true,
    });
    await database.collection("items").insertOne({
      _id: "item-1",
      artwork_id: "art-1",
      owner: "winner-1",
      status: "claimed",
      live_auction_settlement_id: settlementId,
      values: {
        actual: 1_000,
        auction_min: 500,
        sell: 500,
        purchase: 1_000,
        collector: 1_000,
        dealer: 1_000,
      },
    });
    await database.collection("metadata").insertOne({
      ...createInitialLiveAuctionState(),
      live: true,
      hidden: false,
      current_item_id: "item-1",
      current_bid: 500,
      minimum_bid: 550,
      increment: 50,
      winner_id: "winner-1",
      winner_name: "Winner",
      version: 4,
      lock: {
        token: settlementId,
        action: "accept",
        expires_at: "2000-01-01T00:00:00.000Z",
      },
    });

    await getLiveAuctionAdminView(database);
    await getLiveAuctionAdminView(database);

    const [player, item, state, notifications] = await Promise.all([
      database.collection("players").findOne({ _id: "winner-1" }),
      database.collection("items").findOne({ _id: "item-1" }),
      database.collection("metadata").findOne({
        _id: LIVE_AUCTION_STATE_ID,
      }),
      database
        .collection("player_notifications")
        .find({ user_id: "winner-1" })
        .toArray(),
    ]);
    assert.equal(player?.profile.playthrough_stats.items_collected, 1);
    assert.equal(player?.profile.playthrough_stats.money_spent, 500);
    assert.deepEqual(player?.profile.live_auction_settlement_ids, []);
    assert.equal(item?.live_auction_settlement_id, undefined);
    assert.equal(state?.current_item_id, null);
    assert.deepEqual(state?.pending_winner_notifications, []);
    assert.equal(notifications.length, 1);
    assert.equal(
      notifications[0]?._id,
      `live-auction-winner:${settlementId}`,
    );
  } finally {
    await client.close();
    await server.stop();
  }
});
