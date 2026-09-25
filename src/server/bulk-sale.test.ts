import assert from "node:assert/strict";
import test from "node:test";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import {
  getFilteredBulkLootCandidates,
  getBulkForgeryDialog,
  getBulkForgeryMessage,
  parseBulkSaleProtections,
  shouldPreserveBulkSaleItem,
} from "./bulk-sale.ts";
import type { ArtHistorianQuest } from "./art-historian-gameplay.ts";
import type { GameItem } from "./gameplay.ts";
import { setupTestDb } from "./test-utils/db-setup.ts";

const protections = {
  keepArtStyles: true,
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

test("bulk sale protection preserves unfound quest targets", () => {
  assert.equal(
    shouldPreserveBulkSaleItem(
      {
        artwork: { rarity: "common" },
        unfoundQuestTarget: true,
      },
      protections,
    ),
    true,
  );
  assert.equal(
    shouldPreserveBulkSaleItem(
      {
        artwork: { rarity: "common" },
        unfoundQuestTarget: false,
      },
      { ...protections, keepArtStyles: false, keepUnarchived: false },
    ),
    false,
  );
});

test("bulk sale protection ignores targets already submitted to the Historian", async () => {
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
    await database.collection<GameItem>("items").insertOne(item);
    await database.collection<ArtHistorianQuest>("quests").insertOne({
      _id: "quest-1",
      owner_id: playerId,
      target: ["art-1"],
      fulfilled_targets: [
        {
          artwork_id: "art-1",
          item_id: "submitted-art-1",
          item_snapshot: { ...item, _id: "submitted-art-1" },
          fulfilled_at: new Date().toISOString(),
          special: false,
        },
      ],
      reward: { money: 100, xp: 10, xp_chunk_percentage: 0.5 },
      rarity: "common",
      min_requirement: 1,
      created_at: new Date().toISOString(),
    });

    const result = await getFilteredBulkLootCandidates(
      database,
      playerId,
      {
        keepArtStyles: false,
        keepLegendaries: false,
        keepMasterpieces: false,
        keepUnfoundQuestTargets: true,
        keepUnarchived: false,
      },
      ["for_sale"],
    );

    assert.deepEqual([...result.questTargetIds], []);
    assert.deepEqual(result.items.map((candidate) => candidate._id), [item._id]);
  } finally {
    await client.close();
    await mongoServer.stop();
  }
});

test("bulk sale protection preserves applied art styles", () => {
  assert.equal(
    shouldPreserveBulkSaleItem(
      {
        artwork: { rarity: "common" },
        card_renderer: "zine",
      },
      protections,
    ),
    true,
  );
  assert.equal(
    shouldPreserveBulkSaleItem(
      {
        artwork: { rarity: "common" },
        card_renderer: "museum",
      },
      { ...protections, keepUnarchived: false },
    ),
    false,
  );
});

test("parseBulkSaleProtections handles valid JSON and invalid bodies safely", () => {
  const valid = parseBulkSaleProtections(JSON.stringify({ keepLegendaries: true }));
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.protections.keepLegendaries, true);
    assert.equal(valid.protections.keepMasterpieces, false);
  }

  const invalid = parseBulkSaleProtections("{invalid-json");
  assert.equal(invalid.ok, false);
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
