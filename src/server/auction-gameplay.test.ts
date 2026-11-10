import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import ts from "typescript";

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

test("auction sorting supports item drop chance", () => {
  assert.deepEqual(getAuctionSort("dropChance", "asc"), {
    "item_snapshot.drop_chance_coefficient": 1,
  });
  assert.deepEqual(getAuctionSort("dropChance", "desc"), {
    "item_snapshot.drop_chance_coefficient": -1,
  });
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
  canPlayerAccessAuction,
  createAuction,
  createCollectorResaleAuction,
  getAuctionAccessFilter,
  getAuctionCommissionAmount,
  getAuctionSort,
  getInitialPrivateAuctionBidContribution,
  grantAuctionXpReward,
  makePrivateAuctionsPublic,
  removeSettledAuctionRecord,
  settleAuction,
  settleExpiredAuctions,
  validateBidder,
  type Auction,
} from "./auction-gameplay.ts";
import { getGameplaySettings } from "./game-settings.ts";

test("auction bid API enforces restrictions and first-bid contributions", async t => {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  t.after(async () => { await client.close(); await server.stop(); });
  const database = client.db("auction-self-bids");
  const player = {
    _id: "player", screen_name: "Player", active: true,
    profile: { bank_balance: 10_000, level: 1, auction_cap: 10, inventory_cap: 10 },
  };
  await database.collection("players").insertMany([
    player, { ...player, _id: "other-player", screen_name: "Other Player" },
  ]);
  const base: Auction = {
    _id: "base", item_id: "auction-item", seller_id: null, seller_name: "Auction House", viewer: "public",
    starting_bid: 100, current_bid: 100, minimum_bid: 100, increment: 10, buy_now: 500,
    commission: null, current_winner_id: null, current_winner_name: null, has_bid: false,
    date_posted: new Date().toISOString(), expiration: new Date(Date.now() + 60 * 60_000).toISOString(),
    settlement_status: "active",
    item_snapshot: {
      artwork_id: "artwork", title: "Auction artwork", artist: "Artist", rarity: "common", rarity_value: 0,
      medium: "Oil", date: 2026, condition: 1, level: 1, roll_count: 0,
      foil: false, seasonal: false, lottery: 0, original: false,
    },
  };
  await database.collection("items").insertOne({
    _id: base.item_id, owner: AUCTION_HOUSE_OWNER_ID, status: "auctioned",
  });
  let playerId = player._id;
  let concurrentAuctionId: string | null = null;
  let concurrentAuctionUpdate: Record<string, unknown> | null = null;
  let recordedMetrics = 0;
  const dependencies: Record<string, unknown> = {
    "next/server": createRequire(import.meta.url)("next/server"),
    "@/server/auction-gameplay": {
      calculateAntiSnipeExpiration,
      getInitialPrivateAuctionBidContribution,
      settleAuction,
      settleExpiredAuctions,
      validateBidder,
    },
    "@/server/game-settings": { getGameplaySettings: async () => {
      if (concurrentAuctionId) {
        await database.collection<Auction>("auctions").updateOne({ _id: concurrentAuctionId }, {
          $set: concurrentAuctionUpdate ?? {
            commission: { player_id: playerId, coefficient: 0.1 },
          },
        });
      }
      return getGameplaySettings(database);
    } },
    "@/server/mongodb": { getDatabase: async () => database },
    "@/server/player-api": { requirePlayerApi: async () => ({ ok: true, session: { playerId } }) },
    "@/server/player-notifications": { createPlayerNotification: async () => undefined },
    "@/server/economy-metrics": { recordEconomyMetricsSafely: async () => { recordedMetrics++; } },
  };
  const code = ts.transpileModule(await readFile(
    new URL("../app/api/play/auctions/[id]/bid/route.ts", import.meta.url), "utf8",
  ), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const route = runInNewContext(`${code}\nexports`, {
    exports: {}, Date, Error, console,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }) as typeof import("../app/api/play/auctions/[id]/bid/route.ts");
  const bid = (auction: Auction, buyNow = false, amount = auction.minimum_bid) => route.POST(new Request("http://localhost/api/play/auctions/bid", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount, buyNow }),
  }), { params: Promise.resolve({ id: auction._id }) });
  const beforeItems = await database.collection("items").find({}).toArray();
  const restrictions = [
    { name: "seller", seller_id: player._id, commission: null },
    { name: "Collector commission recipient", seller_id: null, commission: { player_id: player._id, coefficient: 0.1 } },
  ];
  for (const restriction of restrictions) {
    for (const buyNow of [false, true]) {
      await t.test(`${restriction.name}: ${buyNow ? "buy now" : "bid"}`, async () => {
        const auction = { ...base, ...restriction, _id: `${restriction.name}-${buyNow}` };
        await database.collection<Auction>("auctions").insertOne(auction);
        const beforePlayer = await database.collection("players").findOne({ _id: playerId });
        const beforeAuction = await database.collection<Auction>("auctions").findOne({ _id: auction._id });
        const response = await bid(auction, buyNow);
        assert.equal(response.status, 409);
        assert.match((await response.json()).error, /seller|commission/);
        assert.deepEqual(await database.collection("players").findOne({ _id: playerId }), beforePlayer);
        assert.deepEqual(await database.collection<Auction>("auctions").findOne({ _id: auction._id }), beforeAuction);
        assert.deepEqual(await database.collection("items").find({}).toArray(), beforeItems);
        assert.equal(recordedMetrics, 0);
      });
    }
  }
  await t.test("an existing winning commission recipient cannot raise their bid", async () => {
    const auction: Auction = {
      ...base, _id: "existing-self-bid", has_bid: true, current_winner_id: player._id,
      current_winner_name: player.screen_name, minimum_bid: 110,
      commission: { player_id: player._id, coefficient: 0 },
    };
    await database.collection<Auction>("auctions").insertOne(auction);
    assert.equal((await bid(auction)).status, 409);
    assert.equal((await database.collection("players").findOne({ _id: playerId }))?.profile.bank_balance, 10_000);
    assert.deepEqual(await database.collection<Auction>("auctions").findOne({ _id: auction._id }), auction);
  });
  for (const buyNow of [false, true]) {
    await t.test(`commission added during ${buyNow ? "buy now" : "bid"} rejects and refunds the charge`, async () => {
      const auction = { ...base, _id: `concurrent-${buyNow}` };
      await database.collection<Auction>("auctions").insertOne(auction);
      concurrentAuctionId = auction._id;
      assert.equal((await bid(auction, buyNow)).status, 409);
      concurrentAuctionId = null;
      concurrentAuctionUpdate = null;
      assert.equal((await database.collection("players").findOne({ _id: playerId }))?.profile.bank_balance, 10_000);
      const saved = await database.collection<Auction>("auctions").findOne({ _id: auction._id });
      assert.deepEqual(saved, { ...auction, commission: { player_id: playerId, coefficient: 0.1 } });
      assert.deepEqual(await database.collection("items").find({}).toArray(), beforeItems);
      assert.equal(recordedMetrics, 0);
    });
  }
  await t.test("other players can bid on commissioned lots", async () => {
    playerId = "other-player";
    const auction = { ...base, _id: "allowed-commission", commission: { player_id: player._id, coefficient: 0.1 } };
    await database.collection<Auction>("auctions").insertOne(auction);
    assert.equal((await bid(auction)).status, 200);
    assert.equal((await database.collection("players").findOne({ _id: playerId }))?.profile.bank_balance, 9_900);
    assert.equal((await database.collection<Auction>("auctions").findOne({ _id: auction._id }))?.current_winner_id, playerId);
    assert.deepEqual((await database.collection<Auction>("auctions").findOne({ _id: auction._id }))?.bidder_ids, [playerId]);
    assert.equal((await database.collection("players").findOne({ _id: player._id }))?.profile.bank_balance, 10_000);
  });
  await t.test("active market experts cannot bid during another player's preview", async () => {
    playerId = "other-player";
    await database.collection("players").updateOne(
      { _id: playerId },
      {
        $set: {
          "profile.market_expert.expiration":
            new Date(Date.now() + 60_000).toISOString(),
        },
      },
    );
    const auction = {
      ...base,
      _id: "private-hidden",
      viewer: player._id,
    };
    await database.collection<Auction>("auctions").insertOne(auction);
    assert.equal((await bid(auction)).status, 409);
    assert.equal(
      (await database.collection("players").findOne({ _id: playerId }))?.profile.bank_balance,
      9_900,
    );
  });
  await t.test("former bidders retain private-lot bidding access after market access expires", async () => {
    playerId = "other-player";
    await database.collection("players").updateOne(
      { _id: playerId },
      {
        $set: {
          "profile.market_expert.expiration":
            new Date(Date.now() - 60_000).toISOString(),
        },
      },
    );
    const auction = {
      ...base,
      _id: "private-returning-bidder",
      viewer: player._id,
      bidder_ids: [playerId],
      date_posted: new Date(Date.now() - 6 * 60_000).toISOString(),
    };
    await database.collection<Auction>("auctions").insertOne(auction);
    assert.equal((await bid(auction)).status, 200);
    assert.deepEqual(
      (await database.collection<Auction>("auctions").findOne({ _id: auction._id }))?.bidder_ids,
      [playerId],
    );
  });
  await t.test("origin players can bid on commissioned lots during their exclusive preview", async () => {
    playerId = player._id;
    await database.collection("players").updateOne(
      { _id: playerId },
      { $set: { "profile.market_expert.expiration": new Date(Date.now() - 60_000).toISOString() } },
    );
    const auction = {
      ...base,
      _id: "private-allowed",
      viewer: playerId,
      commission: { player_id: playerId, coefficient: 0.1 },
    };
    await database.collection<Auction>("auctions").insertOne(auction);
    assert.equal((await bid(auction)).status, 200);
    const saved = await database.collection<Auction>("auctions").findOne({ _id: auction._id });
    assert.equal(saved?.current_winner_id, playerId);
    assert.deepEqual(saved?.bidder_ids, [playerId]);
  });
  await t.test("the displayed effect contributes only to the first private-auction bid", async () => {
    const expiration = new Date(Date.now() + 60_000).toISOString();
    await database.collection("players").updateMany(
      { _id: { $in: [player._id, "other-player"] } },
      {
        $set: {
          "profile.bank_balance": 10_000,
          "profile.market_expert.expiration": expiration,
        },
      },
    );
    await database.collection("artwork_effects").insertOne({
      _id: "private-bid-contribution",
      effect_type: "legendary",
      code: "PRIVATE_AUCTION_PRICE_REDUCTION",
      active: true,
      linked_attributes: ["benefactor", "auctioneer"],
      parameters: { contribution_coefficient: 0.25 },
    });
    await database.collection("artworks").insertOne({
      _id: "contribution-artwork",
      rarity: "legendary",
      effect_id: "private-bid-contribution",
    });
    await database.collection("items").insertOne({
      _id: "displayed-contribution-item",
      artwork_id: "contribution-artwork",
      owner: player._id,
      status: "displayed",
    });
    const auction: Auction = {
      ...base,
      _id: "private-bid-contribution",
      viewer: "origin-player",
      bidder_ids: [],
      date_posted: new Date(Date.now() - 6 * 60_000).toISOString(),
    };
    await database.collection<Auction>("auctions").insertOne(auction);

    playerId = player._id;
    const firstBid = await bid(auction, false, 7_000);
    assert.equal(firstBid.status, 200);
    assert.match((await firstBid.json()).message, /contributed \$1,750/);
    assert.equal(
      (await database.collection("players").findOne({ _id: playerId }))
        ?.profile.bank_balance,
      4_750,
    );
    assert.deepEqual(
      await database.collection<Auction>("auctions").findOne(
        { _id: auction._id },
        { projection: { _id: 0, current_bid: 1, bidder_ids: 1 } },
      ),
      { current_bid: 7_000, bidder_ids: [playerId] },
    );

    playerId = "other-player";
    assert.equal((await bid(auction, false, 7_010)).status, 200);
    assert.equal(
      (await database.collection("players").findOne({ _id: player._id }))
        ?.profile.bank_balance,
      11_750,
    );

    playerId = player._id;
    assert.equal((await bid(auction, false, 7_020)).status, 200);
    assert.equal(
      (await database.collection("players").findOne({ _id: playerId }))
        ?.profile.bank_balance,
      4_730,
    );
    assert.deepEqual(
      (
        await database.collection<Auction>("auctions").findOne({
          _id: auction._id,
        })
      )?.bidder_ids,
      [player._id, "other-player"],
    );
  });
  await t.test("a private-to-public race refunds the reduced first-bid charge", async () => {
    playerId = player._id;
    await database.collection("players").updateOne(
      { _id: playerId },
      { $set: { "profile.bank_balance": 10_000 } },
    );
    const auction: Auction = {
      ...base,
      _id: "private-contribution-public-race",
      viewer: "origin-player",
      bidder_ids: [],
      date_posted: new Date(Date.now() - 6 * 60_000).toISOString(),
    };
    await database.collection<Auction>("auctions").insertOne(auction);
    concurrentAuctionId = auction._id;
    concurrentAuctionUpdate = { viewer: "public" };

    assert.equal((await bid(auction, false, 7_000)).status, 409);
    concurrentAuctionId = null;
    concurrentAuctionUpdate = null;
    assert.equal(
      (await database.collection("players").findOne({ _id: playerId }))
        ?.profile.bank_balance,
      10_000,
    );
    assert.deepEqual(
      await database.collection<Auction>("auctions").findOne(
        { _id: auction._id },
        { projection: { _id: 0, viewer: 1, bidder_ids: 1 } },
      ),
      { viewer: "public", bidder_ids: [] },
    );
  });
  await t.test("the effect does not contribute to public-auction bids", async () => {
    playerId = player._id;
    await database.collection("players").updateOne(
      { _id: playerId },
      { $set: { "profile.bank_balance": 10_000 } },
    );
    const auction: Auction = {
      ...base,
      _id: "public-no-contribution",
      bidder_ids: [],
    };
    await database.collection<Auction>("auctions").insertOne(auction);

    const response = await bid(auction, false, 7_000);
    assert.equal(response.status, 200);
    assert.doesNotMatch((await response.json()).message, /contributed/);
    assert.equal(
      (await database.collection("players").findOne({ _id: playerId }))
        ?.profile.bank_balance,
      3_000,
    );
  });
});

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
  assert.equal(
    getAuctionCommissionAmount({
      current_bid: 1_000,
      current_winner_id: "player-1",
      commission: { player_id: "player-1", coefficient: 0.1 },
    }),
    0,
  );
});

test("private auction access preserves the origin preview before entering the expert market", async () => {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  try {
    const database = client.db("shared-private-auction-access");
    const now = new Date("2026-11-09T20:00:00.000Z");
    const previewDate = new Date(now.getTime() - 60_000).toISOString();
    const sharedDate = new Date(now.getTime() - 6 * 60_000).toISOString();
    await database.collection<Auction>("auctions").insertMany([
      { _id: "public", viewer: "public", date_posted: previewDate },
      { _id: "origin-preview", viewer: "player", date_posted: previewDate },
      { _id: "other-preview", viewer: "origin", date_posted: previewDate },
      { _id: "shared", viewer: "origin", date_posted: sharedDate },
      {
        _id: "former-bidder",
        viewer: "origin",
        bidder_ids: ["player"],
        date_posted: sharedDate,
      },
      {
        _id: "legacy-winner",
        viewer: "origin",
        current_winner_id: "player",
        date_posted: sharedDate,
      },
    ] as Auction[]);

    assert.deepEqual(
      (await database.collection<Auction>("auctions")
        .find(getAuctionAccessFilter("player", false, now))
        .project({ _id: 1 }).sort({ _id: 1 }).toArray())
        .map((auction) => auction._id),
      ["former-bidder", "legacy-winner", "origin-preview", "public"],
    );
    assert.deepEqual(
      (await database.collection<Auction>("auctions")
        .find(getAuctionAccessFilter("player", true, now))
        .project({ _id: 1 }).sort({ _id: 1 }).toArray())
        .map((auction) => auction._id),
      ["former-bidder", "legacy-winner", "origin-preview", "public", "shared"],
    );
    assert.equal(
      canPlayerAccessAuction(
        {
          viewer: "origin",
          bidder_ids: ["player"],
          current_winner_id: "other",
          date_posted: sharedDate,
        },
        "player",
        false,
        now,
      ),
      true,
    );
    assert.equal(
      canPlayerAccessAuction(
        {
          viewer: "origin",
          bidder_ids: ["player"],
          current_winner_id: "other",
          date_posted: previewDate,
        },
        "player",
        true,
        now,
      ),
      false,
    );
    assert.equal(
      canPlayerAccessAuction(
        {
          viewer: "player",
          bidder_ids: [],
          current_winner_id: null,
          date_posted: previewDate,
        },
        "player",
        false,
        now,
      ),
      true,
    );
  } finally {
    await client.close();
    await server.stop();
  }
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
        dismissed_private_auction_ids: [
          "private-1",
          "non-transferable",
          "other-private",
        ],
      },
    });
    await database.collection("auctions").insertMany([
      {
        _id: "private-1",
        viewer: "player-1",
        transferable: true,
        expiration,
        settlement_status: "active",
      },
      {
        _id: "non-transferable",
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
        ["private-1", "non-transferable", "other-private"],
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
          _id: "non-transferable",
        })
      )?.viewer,
      "player-1",
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
      ["non-transferable", "other-private"],
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
      drop_chance_coefficient: 0.00025,
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
      createdAuction.item_snapshot.drop_chance_coefficient,
      item.drop_chance_coefficient,
    );
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
