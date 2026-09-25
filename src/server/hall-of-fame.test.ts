import assert from "node:assert/strict";
import { test } from "node:test";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import {
  checkItemForHallOfFameStatus,
  getMatchingHallOfFameQualifiers,
  itemMatchesQualifierQuery,
  setHallOfFameCandidateScanEnabled,
  transferIfHallOfFameItem,
  type HallOfFameRecord,
  type HallOfFameSubmission,
} from "./hall-of-fame.ts";
import type { Artwork, GameItem } from "./gameplay.ts";

test("itemMatchesQualifierQuery matches masterpiece mint query correctly", () => {
  const sampleItem: Partial<GameItem> = {
    mint: true,
    foil: false,
    unlocked: false,
    seasonal: false,
    original: false,
    values: { sell: 100, purchase: 150, actual: 120, auction_min: 80, collector: 140, dealer: 100 },
  };

  const isMatched = itemMatchesQualifierQuery(sampleItem as GameItem, "masterpiece", {
    rarity: "masterpiece",
    mint: true,
  });

  assert.equal(isMatched, true);
});

test("itemMatchesQualifierQuery rejects non-matching rarity or mint condition", () => {
  const sampleItem: Partial<GameItem> = {
    mint: false,
    foil: true,
    unlocked: true,
    values: { sell: 100, purchase: 150, actual: 120, auction_min: 80, collector: 140, dealer: 100 },
  };

  const isMatched = itemMatchesQualifierQuery(sampleItem as GameItem, "rare", {
    rarity: "masterpiece",
    mint: true,
  });

  assert.equal(isMatched, false);
});

test("itemMatchesQualifierQuery checks value ceilings", () => {
  const sampleItem: Partial<GameItem> = {
    mint: true,
    foil: true,
    values: { sell: 8000000, purchase: 15000000, actual: 12000000, auction_min: 6000000, collector: 14000000, dealer: 10000000 },
  };

  const matches10m = itemMatchesQualifierQuery(sampleItem as GameItem, "masterpiece", {
    minActualValue: 10_000_000,
  });
  const matches100m = itemMatchesQualifierQuery(sampleItem as GameItem, "masterpiece", {
    minActualValue: 100_000_000,
  });

  assert.equal(matches10m, true);
  assert.equal(matches100m, false);
});

test("getMatchingHallOfFameQualifiers returns every qualification an item fulfills", () => {
  const item = {
    mint: true,
    foil: true,
    unlocked: true,
    seasonal: false,
    original: false,
    lottery: 0,
    values: { actual: 12_000_000 },
  } as GameItem;

  assert.deepEqual(
    getMatchingHallOfFameQualifiers(item, "masterpiece").map(
      (qualifier) => qualifier.id,
    ),
    [
      "first-mint-masterpiece",
      "first-foil-masterpiece",
      "first-unlocked-masterpiece",
      "first-mint-foil-masterpiece",
      "first-mint-unlocked-masterpiece",
      "first-foil-unlocked-masterpiece",
      "first-mint-foil-unlocked-masterpiece",
      "first-unlocked-foil",
      "first-10m-valuation",
    ],
  );
});

test("qualifying items become pending submissions and notify the player", async () => {
  const mongoServer = await MongoMemoryServer.create();
  const client = new MongoClient(mongoServer.getUri());
  try {
    await client.connect();
    const database = client.db("hall-of-fame-test");
    const artwork = {
      _id: "artwork-1",
      title: "Test Masterpiece",
      artist: "Test Artist",
      rarity: "masterpiece",
    } as Artwork;
    const item = {
      _id: "item-1",
      artwork_id: artwork._id,
      owner: "player-1",
      status: "claimed",
      mint: true,
      foil: true,
      unlocked: true,
      seasonal: false,
      original: false,
      lottery: 0,
      values: { actual: 12_000_000 },
    } as GameItem;
    await database.collection<Artwork>("artworks").insertOne(artwork);
    await database.collection<GameItem>("items").insertOne(item);
    await setHallOfFameCandidateScanEnabled(database, true);

    const submission = await checkItemForHallOfFameStatus(
      database,
      item,
      { _id: "player-1", screen_name: "Player One" },
    );
    const duplicateSubmission = await checkItemForHallOfFameStatus(
      database,
      item,
      { _id: "player-1", screen_name: "Player One" },
    );

    assert.deepEqual(
      submission.map((entry) => entry.qualifier_id),
      [
        "first-mint-masterpiece",
        "first-foil-masterpiece",
        "first-unlocked-masterpiece",
        "first-mint-foil-masterpiece",
        "first-mint-unlocked-masterpiece",
        "first-foil-unlocked-masterpiece",
        "first-mint-foil-unlocked-masterpiece",
        "first-unlocked-foil",
        "first-10m-valuation",
      ],
    );
    assert.deepEqual(duplicateSubmission, []);
    assert.equal(
      await database
        .collection<HallOfFameSubmission>("hall_of_fame_submissions")
        .countDocuments(),
      9,
    );
    assert.equal(
      await database
        .collection<HallOfFameRecord>("hall_of_fame")
        .countDocuments(),
      0,
    );
    assert.equal(
      await database.collection("player_notifications").countDocuments(),
      1,
    );
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});

test("test account claims are checked for Hall of Fame qualifiers", async () => {
  const mongoServer = await MongoMemoryServer.create();
  const client = new MongoClient(mongoServer.getUri());
  try {
    await client.connect();
    const database = client.db("hall-of-fame-test-account");
    const artwork = {
      _id: "artwork-test-account",
      title: "Foil Masterpiece",
      artist: "Test Artist",
      rarity: "masterpiece",
    } as Artwork;
    const item = {
      _id: "item-test-account",
      artwork_id: artwork._id,
      owner: "player-test-account",
      status: "claimed",
      mint: false,
      foil: true,
      unlocked: false,
      seasonal: false,
      original: false,
      lottery: 0,
      values: { actual: 1_000 },
    } as GameItem;
    await database.collection<Artwork>("artworks").insertOne(artwork);
    await setHallOfFameCandidateScanEnabled(database, true);

    const submissions = await checkItemForHallOfFameStatus(
      database,
      item,
      {
        _id: "player-test-account",
        screen_name: "Test Player",
        test_account: true,
      },
    );

    assert.deepEqual(
      submissions.map((entry) => entry.qualifier_id),
      ["first-foil-masterpiece"],
    );
    assert.equal(
      await database.collection("player_notifications").countDocuments(),
      1,
    );
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});

test("rechecking an item can submit qualifiers that became available later", async () => {
  const mongoServer = await MongoMemoryServer.create();
  const client = new MongoClient(mongoServer.getUri());
  try {
    await client.connect();
    const database = client.db("hall-of-fame-recheck-test");
    const artwork = {
      _id: "artwork-recheck",
      title: "Rechecked Masterpiece",
      artist: "Test Artist",
      rarity: "masterpiece",
    } as Artwork;
    const item = {
      _id: "item-recheck",
      artwork_id: artwork._id,
      owner: "player-recheck",
      status: "claimed",
      mint: false,
      foil: true,
      unlocked: false,
      seasonal: false,
      original: false,
      lottery: 0,
      values: { actual: 1_000 },
    } as GameItem;
    await database.collection<Artwork>("artworks").insertOne(artwork);
    await setHallOfFameCandidateScanEnabled(database, true);
    await database
      .collection<HallOfFameSubmission>("hall_of_fame_submissions")
      .insertOne({
        _id: "first-seasonal-item",
        item_id: item._id,
        item_snapshot: item,
        title: "First Seasonal Artwork",
        description: "Existing unrelated submission",
        submitted_at: new Date().toISOString(),
        qualifier_id: "first-seasonal-item",
        player_id: "player-recheck",
        player_screen_name: "Recheck Player",
      });

    const submissions = await checkItemForHallOfFameStatus(
      database,
      item,
      { _id: "player-recheck", screen_name: "Recheck Player" },
    );

    assert.deepEqual(
      submissions.map((entry) => entry.qualifier_id),
      ["first-foil-masterpiece"],
    );
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});

test("automatic qualifier scanning is disabled by default", async () => {
  const mongoServer = await MongoMemoryServer.create();
  const client = new MongoClient(mongoServer.getUri());
  try {
    await client.connect();
    const database = client.db("hall-of-fame-disabled-test");
    const artwork = {
      _id: "artwork-disabled",
      title: "Disabled Scan Masterpiece",
      artist: "Test Artist",
      rarity: "masterpiece",
    } as Artwork;
    const item = {
      _id: "item-disabled",
      artwork_id: artwork._id,
      owner: "player-disabled",
      status: "claimed",
      mint: true,
      foil: true,
      unlocked: true,
      seasonal: false,
      original: false,
      lottery: 0,
      values: { actual: 12_000_000 },
    } as GameItem;
    await database.collection<Artwork>("artworks").insertOne(artwork);

    const submissions = await checkItemForHallOfFameStatus(
      database,
      item,
      { _id: "player-disabled", screen_name: "Disabled Player" },
    );

    assert.deepEqual(submissions, []);
    assert.equal(
      await database
        .collection("hall_of_fame_submissions")
        .countDocuments(),
      0,
    );
    assert.equal(
      await database.collection("player_notifications").countDocuments(),
      0,
    );
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});

test("approved Hall of Fame items are transferred instead of deleted", async () => {
  const mongoServer = await MongoMemoryServer.create();
  const client = new MongoClient(mongoServer.getUri());
  try {
    await client.connect();
    const database = client.db("hall-of-fame-transfer-test");
    const item = {
      _id: "item-2",
      artwork_id: "artwork-2",
      owner: "player-2",
      status: "displayed",
      transaction_history: [],
    } as GameItem;
    await database.collection<GameItem>("items").insertOne(item);
    await database.collection<HallOfFameRecord>("hall_of_fame").insertOne({
      _id: "record-2",
      item_id: item._id,
      item_snapshot: item,
      title: "Historic Work",
      description: "Test record",
      created_at: new Date().toISOString(),
    });

    assert.equal(await transferIfHallOfFameItem(database, item), true);
    const preserved = await database
      .collection<GameItem>("items")
      .findOne({ _id: item._id });
    assert.equal(preserved?.owner, "artfunkel inc.");
    assert.equal(preserved?.status, "claimed");
    assert.equal(
      preserved?.transaction_history.at(-1)?.source,
      "hall of fame",
    );
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});
