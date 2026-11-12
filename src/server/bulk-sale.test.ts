import assert from "node:assert/strict";
import test from "node:test";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import { DROPPABLE_CARD_RENDERER_IDS } from "../components/item-cards/catalog.ts";
import {
  filterBulkLootCandidates,
  getBulkDisposalPermission,
  getFilteredBulkLootCandidates,
  getBulkForgeryDialog,
  getBulkForgeryMessage,
  recoverPendingBulkOperations,
  parseBulkSaleProtections,
  isBulkLootCandidate,
  shouldPreserveBulkSaleItem,
  type BulkSaleProtections,
} from "./bulk-sale.ts";
import type { ArtHistorianQuest } from "./art-historian-gameplay.ts";
import type { GameItem } from "./gameplay.ts";
import { setupTestDb } from "./test-utils/db-setup.ts";

const protections = {
  keptArtStyleIds: [...DROPPABLE_CARD_RENDERER_IDS],
  keepRares: true,
  keepLegendaries: true,
  keepMasterpieces: true,
  keepUnfoundQuestTargets: true,
  keepUnarchived: true,
};

test("bulk sale protections preserve selected rarity tiers", () => {
  assert.equal(
    shouldPreserveBulkSaleItem(
      {
        artwork: { rarity: "legendary" },
        archivePermission: { allowed: false, reason: "Already archived." },
      },
      protections,
    ),
    true,
  );
  assert.equal(
    shouldPreserveBulkSaleItem(
      {
        artwork: { rarity: "masterpiece" },
        archivePermission: { allowed: false, reason: "Already archived." },
      },
      protections,
    ),
    true,
  );
});

test("bulk candidate eligibility includes originals but preserves permanent items", () => {
  assert.equal(isBulkLootCandidate({ original: false, permanent: false }), true);
  assert.equal(isBulkLootCandidate({ original: true, permanent: false }), true);
  assert.equal(isBulkLootCandidate({ original: false, permanent: true }), false);
});

test("bulk sale protection preserves archive-eligible variants", () => {
  assert.equal(
    shouldPreserveBulkSaleItem(
      {
        artwork: { rarity: "common" },
        archivePermission: { allowed: true },
      },
      protections,
    ),
    true,
  );
  assert.equal(
    shouldPreserveBulkSaleItem(
      {
        artwork: { rarity: "common" },
        archivePermission: { allowed: false, reason: "Already archived." },
      },
      protections,
    ),
    false,
  );
});

test("bulk sale protection preserves quest targets", () => {
  assert.equal(
    shouldPreserveBulkSaleItem(
      {
        artwork: { rarity: "common" },
        unsubmittedQuestTarget: true,
      },
      protections,
    ),
    true,
  );
  assert.equal(
    shouldPreserveBulkSaleItem(
      {
        artwork: { rarity: "common" },
        unsubmittedQuestTarget: false,
      },
      { ...protections, keptArtStyleIds: [], keepUnarchived: false },
    ),
    false,
  );
});

test("bulk quest protection ignores owned copies and ends only after submission to the Historian", async () => {
  const mongoServer = await MongoMemoryServer.create();
  const client = new MongoClient(mongoServer.getUri());

  try {
    await client.connect();
    const database: Db = client.db("bulk-sale-fulfilled-target");
    const playerId = "player-1";
    await setupTestDb(database, playerId);
    const item = {
      _id: "duplicate-art-1",
      artwork_id: "art-1",
      owner: playerId,
      status: "for_sale",
      condition: 1,
      mint: false,
      mint_value_multiplier: 1,
      attributes: { locked: [], unlocked: [], special: [] },
      transaction_history: [],
      source: "test",
      date_created: new Date().toISOString(),
      date_received: new Date().toISOString(),
      level: 1,
      roll_count: 0,
      reroll_spent: 0,
      foil: false,
      unlocked: false,
      seasonal: false,
      lottery: 0,
      original: false,
      patreon: false,
      vintage: false,
      authenticity: {
        forgery: false,
        forgery_quality: 0,
        liable: "",
        liability_pending: false,
        identified: false,
        fee: 0,
        original_owner: playerId,
      },
      tags: [],
      misprint: false,
      values: { sell: 100, artist: 100, collector: 100 },
    } as GameItem;
    await database.collection<GameItem>("items").insertMany([
      item,
      { ...item, _id: "owned-copy", status: "claimed" },
    ]);
    await database.collection<ArtHistorianQuest>("quests").insertOne({
      _id: "quest-1",
      owner_id: playerId,
      target: ["art-1"],
      fulfilled_targets: [],
      reward: { money: 100, xp: 10, xp_chunk_percentage: 0.5 },
      rarity: "common",
      min_requirement: 1,
      created_at: new Date().toISOString(),
    });

    const questProtections = {
      keptArtStyleIds: [],
      keepRares: false,
      keepLegendaries: false,
      keepMasterpieces: false,
      keepUnfoundQuestTargets: true,
      keepUnarchived: false,
    };
    for (const ownedStatus of ["claimed", "displayed"] as const) {
      await database.collection<GameItem>("items").updateOne({ _id: "owned-copy" }, { $set: { status: ownedStatus } });
      for (const status of ["unclaimed", "for_sale"] as const) {
        await database.collection<GameItem>("items").updateOne({ _id: item._id }, { $set: { status } });
        const protectedItems = await getFilteredBulkLootCandidates(database, playerId, questProtections, [status]);
        assert.deepEqual(protectedItems.items, [], `${status} targets stay protected with a ${ownedStatus} copy`);
      }
      const privateAuction = { ...item, owner: "system:auction-house", status: "auctioned" as const };
      assert.deepEqual((await filterBulkLootCandidates(database, playerId, questProtections, [privateAuction])).items, []);
      assert.deepEqual((await filterBulkLootCandidates(database, playerId, {
        ...questProtections, keepUnfoundQuestTargets: false,
      }, [privateAuction])).items.map(candidate => candidate._id), [item._id]);
    }

    await database.collection<ArtHistorianQuest>("quests").updateOne({ _id: "quest-1" }, {
      $set: { fulfilled_targets: [{
        artwork_id: "art-1", item_id: "submitted-art-1", item_snapshot: { ...item, _id: "submitted-art-1" },
        fulfilled_at: new Date().toISOString(), special: false,
      }] },
    });
    const result = await getFilteredBulkLootCandidates(
      database,
      playerId,
      questProtections,
      ["for_sale"],
    );

    assert.deepEqual([...result.questTargetIds], []);
    assert.deepEqual(result.items.map((candidate) => candidate._id), [item._id]);
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});

test("selected bulk actions honor saved quest protection without blocking deliberate single-item disposal", async (t) => {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  t.after(async () => { await client.close(); await server.stop(); });
  const db = client.db("selected-bulk-quest-protection");
  await db.collection("artworks").insertMany([
    { _id: "art", rarity: "common" }, { _id: "other-art", rarity: "common" },
  ]);
  await db.collection("players").insertOne({ _id: "player", profile: {} });
  await db.collection("quests").insertMany([
    { _id: "complete", owner_id: "player", target: ["art"], fulfilled_targets: [{ artwork_id: "art" }] },
    { _id: "incomplete", owner_id: "player", target: ["art"], fulfilled_targets: [] },
    { _id: "other-player", owner_id: "other", target: ["other-art"] },
  ]);
  const permission = (body?: object, artworkId = "art") => getBulkDisposalPermission(
    db, "player", {
      _id: "item", artwork_id: artworkId, status: "unclaimed", revealed: true,
      authenticity: { forgery: false, identified: false },
    } as GameItem,
    new Request("http://localhost", { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) }),
  );
  assert.equal((await permission({ bulkAction: true })).allowed, false, "defaults protect a target still outstanding in any quest");
  assert.equal((await permission()).allowed, true, "single-item actions remain deliberate overrides");
  await db.collection("players").updateOne({ _id: "player" }, {
    $set: { "profile.view_settings.bulkSaleProtections": {
      keptArtStyleIds: [], keepRares: false, keepLegendaries: false, keepMasterpieces: false,
      keepUnfoundQuestTargets: true, keepUnarchived: false,
    } },
  });
  assert.equal((await permission({ bulkAction: true }, "other-art")).allowed, true, "other players' targets do not block disposal");
  await db.collection("players").updateOne({ _id: "player" }, {
    $set: { "profile.view_settings.bulkSaleProtections.keepUnfoundQuestTargets": false },
  });
  assert.equal((await permission({ bulkAction: true })).allowed, true);
  await db.collection("players").updateOne({ _id: "player" }, {
    $set: { "profile.view_settings.bulkSaleProtections.keepUnfoundQuestTargets": true },
  });
  await db.collection("quests").updateOne({ _id: "incomplete" }, {
    $set: { fulfilled_targets: [{ artwork_id: "art" }] },
  });
  assert.equal((await permission({ bulkAction: true })).allowed, true, "fulfilled targets no longer block bulk disposal");
});

test("bulk protections can filter auction-house-owned private auction items", async () => {
  const mongoServer = await MongoMemoryServer.create();
  const client = new MongoClient(mongoServer.getUri());

  try {
    await client.connect();
    const database: Db = client.db("bulk-sale-private-auctions");
    const playerId = "player-1";
    await setupTestDb(database, playerId);
    const item = {
      _id: "private-auction-item",
      artwork_id: "art-1",
      owner: "system:auction-house",
      status: "auctioned",
      condition: 1,
      mint: false,
      mint_value_multiplier: 1,
      attributes: { locked: [], unlocked: [], special: [] },
      transaction_history: [],
      source: "private auction",
      date_created: new Date().toISOString(),
      date_received: new Date().toISOString(),
      level: 1,
      roll_count: 0,
      reroll_spent: 0,
      foil: false,
      unlocked: false,
      seasonal: false,
      lottery: 0,
      original: false,
      patreon: false,
      vintage: false,
      authenticity: {
        forgery: false,
        forgery_quality: 0,
        liable: "",
        liability_pending: false,
        identified: false,
        fee: 0,
        original_owner: "",
      },
      tags: [],
      misprint: false,
      values: { actual: 100, sell: 100, artist: 100, collector: 100 },
    } as GameItem;

    const result = await filterBulkLootCandidates(
      database,
      playerId,
      {
        keptArtStyleIds: [],
        keepRares: false,
        keepLegendaries: false,
        keepMasterpieces: false,
        keepUnfoundQuestTargets: false,
        keepUnarchived: false,
      },
      [item],
    );

    assert.deepEqual(result.items.map((candidate) => candidate._id), [
      item._id,
    ]);
    const unrestricted: BulkSaleProtections = {
      keptArtStyleIds: [], keepRares: false, keepLegendaries: false, keepMasterpieces: false,
      keepUnfoundQuestTargets: false, keepUnarchived: false,
    };
    const pending = { ...item, status: "unclaimed" as const, drop_chance_coefficient: 1e-9 };
    const candidates = [
      { ...pending, _id: "revealed", revealed: true },
      { ...pending, _id: "sealed", revealed: false, odds: "unknown" },
      { ...pending, _id: "legacy" },
    ];
    assert.deepEqual(
      (await filterBulkLootCandidates(database, playerId, unrestricted, candidates)).items.map(item => item._id),
      ["revealed"],
    );
    await database.collection("metadata").updateOne({ _id: "gameplay-settings" }, { $set: {
      "gameplay.configs.actual.offer_reveal_thresholds": { level1: 0, level2: 0, level3: 0 },
      "gameplay.debug_enabled": false,
    } }, { upsert: true });
    assert.deepEqual(
      (await filterBulkLootCandidates(database, playerId, unrestricted, candidates)).items.map(item => item._id),
      ["revealed", "legacy"],
      "current cutoffs apply to legacy items, but explicit sealed flags always win",
    );
    await database.collection("artworks").updateOne({ _id: item.artwork_id }, { $set: { rarity: "legendary" } });
    assert.deepEqual(
      (await filterBulkLootCandidates(database, playerId, unrestricted, candidates)).items.map(item => item._id),
      ["revealed"],
      "legacy rarity floors use hydrated artwork rather than assuming ordinary rarity",
    );
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});

test("bulk sale protection preserves only selected applied art styles", () => {
  const selectiveProtections: BulkSaleProtections = {
    ...protections,
    keptArtStyleIds: ["zine"],
    keepUnarchived: false,
  };
  assert.equal(
    shouldPreserveBulkSaleItem(
      {
        artwork: { rarity: "common" },
        card_renderer: "zine",
      },
      selectiveProtections,
    ),
    true,
  );
  assert.equal(
    shouldPreserveBulkSaleItem(
      {
        artwork: { rarity: "common" },
        card_renderer: "arcade",
      },
      selectiveProtections,
    ),
    false,
  );
  assert.equal(
    shouldPreserveBulkSaleItem(
      {
        artwork: { rarity: "common" },
        card_renderer: "museum",
      },
      selectiveProtections,
    ),
    false,
  );
});

test("parseBulkSaleProtections handles valid JSON and invalid bodies safely", () => {
  const valid = parseBulkSaleProtections(
    JSON.stringify({
      keptArtStyleIds: ["zine", "museum", "unknown", "zine", "arcade"],
      keepLegendaries: true,
    }),
  );
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.protections.keepLegendaries, true);
    assert.equal(valid.protections.keepMasterpieces, false);
    assert.deepEqual(valid.protections.keptArtStyleIds, ["arcade", "zine"]);
  }

  const invalid = parseBulkSaleProtections("{invalid-json");
  assert.equal(invalid.ok, false);
});

test("parseBulkSaleProtections supports legacy art-style booleans", () => {
  const enabled = parseBulkSaleProtections(
    JSON.stringify({ keepArtStyles: true }),
  );
  assert.equal(enabled.ok, true);
  if (enabled.ok) {
    assert.deepEqual(
      enabled.protections.keptArtStyleIds,
      DROPPABLE_CARD_RENDERER_IDS,
    );
    assert.equal(
      (enabled.protections.keptArtStyleIds as readonly string[]).includes(
        "museum",
      ),
      false,
    );
  }

  const disabled = parseBulkSaleProtections(
    JSON.stringify({ keepArtStyles: false }),
  );
  assert.equal(disabled.ok, true);
  if (disabled.ok) {
    assert.deepEqual(disabled.protections.keptArtStyleIds, []);
  }
});

test("getBulkForgeryMessage formats messages for sale and donation actions", () => {
  const saleMsg = getBulkForgeryMessage(1, 2, true, "sale");
  assert.equal(
    saleMsg,
    "The sale failed. 1 known forgery was detected and destroyed; 2 previously unknown forgeries were detected and returned to inventory.",
  );

  const donationMsg = getBulkForgeryMessage(2, 0, true, "donation");
  assert.equal(
    donationMsg,
    "The donation failed. 2 known forgeries were detected and destroyed.",
  );
});

test("getBulkForgeryDialog assigns correct dialog variants", () => {
  assert.equal(getBulkForgeryDialog(1, 1, "test").variant, "mixed");
  assert.equal(getBulkForgeryDialog(1, 0, "test").variant, "destroyed");
  assert.equal(getBulkForgeryDialog(0, 1, "test").variant, "returned");
});

test("bulk operation recovery rolls back uncredited work and clears history", async () => {
  const mongoServer = await MongoMemoryServer.create();
  const client = new MongoClient(mongoServer.getUri());
  try {
    await client.connect();
    const database = client.db("bulk-operation-rollback");
    await database.collection("players").insertOne({
      _id: "player-1",
      active: true,
      profile: {
        bulk_operation_receipt: {
          id: "sale-1",
          kind: "sale",
          state: "reserved",
          started_at: "2000-01-01T00:00:00.000Z",
        },
        bulk_sale_operations: ["historical-sale"],
        bulk_donation_operations: ["historical-donation"],
      },
    });
    await database.collection("items").insertOne({
      _id: "item-1",
      owner: "player-1",
      status: "bulk_sale_pending",
      bulk_sale_operation: "sale-1",
      original: false,
    });

    await recoverPendingBulkOperations(database, "player-1");

    const [player, item] = await Promise.all([
      database.collection("players").findOne({ _id: "player-1" }),
      database.collection("items").findOne({ _id: "item-1" }),
    ]);
    assert.equal(item?.status, "unclaimed");
    assert.equal(item?.bulk_sale_operation, undefined);
    assert.equal(player?.profile.bulk_operation_receipt, undefined);
    assert.equal(player?.profile.bulk_sale_operations, undefined);
    assert.equal(player?.profile.bulk_donation_operations, undefined);
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});

test("bulk operation recovery finishes credited work and removes its receipt", async () => {
  const mongoServer = await MongoMemoryServer.create();
  const client = new MongoClient(mongoServer.getUri());
  try {
    await client.connect();
    const database = client.db("bulk-operation-completion");
    await database.collection("players").insertOne({
      _id: "player-1",
      active: true,
      profile: {
        bulk_operation_receipt: {
          id: "donation-1",
          kind: "donation",
          state: "credited",
          started_at: "2000-01-01T00:00:00.000Z",
          credited_at: "2000-01-01T00:00:01.000Z",
        },
      },
    });
    await database.collection("items").insertOne({
      _id: "item-1",
      artwork_id: "art-1",
      owner: "player-1",
      status: "bulk_donate_pending",
      bulk_donation_operation: "donation-1",
      original: false,
    });

    await recoverPendingBulkOperations(database, "player-1");

    const [player, item] = await Promise.all([
      database.collection("players").findOne({ _id: "player-1" }),
      database.collection("items").findOne({ _id: "item-1" }),
    ]);
    assert.equal(item, null);
    assert.equal(player?.profile.bulk_operation_receipt, undefined);
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});
