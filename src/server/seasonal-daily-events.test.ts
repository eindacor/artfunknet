import assert from "node:assert/strict";
import test from "node:test";

import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import { getDailyEventWeekKey } from "./daily-event-time.ts";
import {
  getFridayCrateView,
  selectFairSeasonalArtwork,
} from "./seasonal-daily-events.ts";

test("seasonal rotation exhausts the remaining pool before repeating", () => {
  assert.deepEqual(
    selectFairSeasonalArtwork(
      ["art-a", "art-b", "art-c"],
      ["art-b", "art-c"],
      "art-a",
      () => 0,
    ),
    { selected: "art-b", remaining: ["art-c"] },
  );
});

test("seasonal rotation refills without immediately repeating current art", () => {
  const selection = selectFairSeasonalArtwork(
    ["art-a", "art-b"],
    [],
    "art-a",
    () => 0,
  );
  assert.equal(selection.selected, "art-b");
  assert.deepEqual(selection.remaining, []);
});

test("stale Friday crate claims reconcile completed and partial generations", async () => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  try {
    await client.connect();
    const database = client.db("friday-crate-recovery");
    const now = new Date("2026-10-02T16:00:00.000Z");
    const weekKey = getDailyEventWeekKey(now);
    const playerId = "player-1";
    const claimId = `friday-crate:${weekKey}:${playerId}`;
    const staleClaim = {
      _id: claimId,
      player_id: playerId,
      week_key: weekKey,
      claimed_at: new Date(now.getTime() - 11 * 60 * 1000).toISOString(),
      generation_source: "friday-source",
      item_ids: [],
      status: "generating",
    };
    await database.collection("daily_event_claims").insertOne(staleClaim);
    await database.collection("items").insertMany(
      Array.from({ length: 20 }, (_, index) => ({
        _id: `item-${index}`,
        owner: playerId,
        source: staleClaim.generation_source,
      })),
    );

    const completedView = await getFridayCrateView(database, playerId, now);
    const completedClaim = await database
      .collection("daily_event_claims")
      .findOne({ _id: claimId });
    assert.equal(completedView.claimed, true);
    assert.equal(completedClaim?.status, "completed");
    assert.equal(completedClaim?.item_ids.length, 20);

    await Promise.all([
      database.collection("daily_event_claims").deleteMany({}),
      database.collection("items").deleteMany({}),
    ]);
    await database.collection("daily_event_claims").insertOne(staleClaim);
    await database.collection("items").insertMany(
      Array.from({ length: 3 }, (_, index) => ({
        _id: `partial-${index}`,
        owner: playerId,
        source: staleClaim.generation_source,
      })),
    );

    const retryView = await getFridayCrateView(database, playerId, now);
    assert.equal(retryView.claimed, false);
    assert.equal(
      await database
        .collection("daily_event_claims")
        .countDocuments({ _id: claimId }),
      0,
    );
    assert.equal(
      await database.collection("items").countDocuments({
        owner: playerId,
        source: staleClaim.generation_source,
      }),
      0,
    );
  } finally {
    await client.close();
    await server.stop();
  }
});

test("fresh Friday crate generation remains locked", async () => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  try {
    await client.connect();
    const database = client.db("friday-crate-active-generation");
    const now = new Date("2026-10-02T16:00:00.000Z");
    const weekKey = getDailyEventWeekKey(now);
    const playerId = "player-1";
    const claimId = `friday-crate:${weekKey}:${playerId}`;
    await database.collection("daily_event_claims").insertOne({
      _id: claimId,
      player_id: playerId,
      week_key: weekKey,
      claimed_at: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      generation_source: "active-source",
      item_ids: [],
      status: "generating",
    });

    const view = await getFridayCrateView(database, playerId, now);
    const claim = await database
      .collection("daily_event_claims")
      .findOne({ _id: claimId });
    assert.equal(view.claimed, false);
    assert.equal(claim?.status, "generating");
  } finally {
    await client.close();
    await server.stop();
  }
});
