import assert from "node:assert/strict";
import test from "node:test";

import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import { migrateItemRevealStates } from "../../scripts/database-migrations.mjs";
import type { GameItem } from "./gameplay.ts";
import { ensureItemRevealStates, revealPlayerItem } from "./item-reveal.ts";
import {
  DEFAULT_ACTUAL_GAMEPLAY_CONFIG,
  getGameplaySettings,
  toStoredGameplayConfig,
} from "./game-settings.ts";
import { DEFAULT_OFFER_REVEAL_THRESHOLDS as cutoffs } from "./offer-reveal.ts";

function item(id: string, overrides: Partial<GameItem> = {}): GameItem {
  return {
    _id: id,
    owner: "owner",
    status: "unclaimed",
    source: "test",
    date_received: new Date().toISOString(),
    drop_chance_coefficient: 1e-9,
    original_drop_chance_coefficient: 0,
    serial_number: 42,
    authenticity: { identified: false, forgery: false },
    ...overrides,
  } as GameItem;
}

test("item reveal state is persistent, transferable, access-controlled and rerunnable", async (t) => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  t.after(async () => { await client.close(); await server.stop(); });
  await client.connect();

  await t.test("two devices can confirm once without changing authenticity, serials or original odds", async () => {
    const db = client.db("reveal-persistence");
    const items = db.collection<GameItem>("items");
    await items.insertOne(item("rare", { revealed: false }));
    assert.equal(await revealPlayerItem(db, "stranger", "rare"), false);
    assert.deepEqual(await Promise.all([
      revealPlayerItem(db, "owner", "rare"), revealPlayerItem(db, "owner", "rare"),
    ]), [true, true]);
    const saved = await items.findOne({ _id: "rare" });
    assert.equal(saved?.revealed, true);
    assert.equal(saved?.authenticity.identified, false);
    assert.equal(saved?.serial_number, 42);
    assert.equal(saved?.original_drop_chance_coefficient, 0);
    await items.updateOne({ _id: "rare" }, { $set: { owner: "buyer", status: "claimed" } });
    assert.equal((await items.findOne({ _id: "rare" }))?.revealed, true);
    assert.equal(await revealPlayerItem(db, "owner", "rare"), false);
    assert.equal(await revealPlayerItem(db, "buyer", "rare"), true);
    await items.insertOne(item("sealed-transfer", { revealed: false, status: "claimed" }));
    await items.updateOne({ _id: "sealed-transfer" }, { $set: { owner: "buyer" } });
    assert.equal((await items.findOne({ _id: "sealed-transfer" }))?.revealed, false);
    assert.equal(await revealPlayerItem(db, "buyer", "sealed-transfer"), true);
  });

  await t.test("only available, undismissed private auction offers can be revealed by nonowners", async () => {
    const db = client.db("reveal-auction-access");
    const items = db.collection<GameItem>("items");
    await items.insertMany(["valid", "expired", "dismissed", "settling", "public"].map(
      (id) => item(id, { owner: "system", status: "auctioned", revealed: false }),
    ));
    await db.collection<{ _id: string }>("players").insertOne({
      _id: "viewer", profile: { dismissed_private_auction_ids: ["dismissed"] },
    });
    await db.collection<{ _id: string }>("auctions").insertMany(
      ["valid", "expired", "dismissed", "settling", "public"].map((id) => ({
        _id: id, item_id: id, viewer: id === "public" ? "public" : "viewer",
        expiration: new Date(Date.now() + (id === "expired" ? -1000 : 60000)).toISOString(),
        ...(id === "settling" ? { settlement_status: "settling" } : {}),
      })),
    );
    assert.equal(await revealPlayerItem(db, "other-viewer", "valid"), false);
    assert.equal(await revealPlayerItem(db, "viewer", "valid"), true);
    for (const id of ["expired", "dismissed", "settling", "public"]) {
      assert.equal(await revealPlayerItem(db, "viewer", id), false);
      assert.equal((await items.findOne({ _id: id }))?.revealed, false);
    }
    await items.insertOne(item("expired-drop", { expires_at: new Date(Date.now() - 1000).toISOString() }));
    assert.equal(await revealPlayerItem(db, "owner", "expired-drop"), false);
  });

  await t.test("legacy initialization preserves known collections and existing states across batch boundaries", async () => {
    const db = client.db("reveal-migration");
    const items = db.collection<GameItem>("items");
    await items.insertMany(Array.from({ length: 505 }, (_, index) =>
      item(`legacy-${index}`, { status: index % 2 ? "claimed" : "unclaimed" }),
    ));
    await items.insertMany([
      item("already-known", { revealed: true }),
      item("already-sealed", { status: "claimed", revealed: false }),
      item("ordinary", { drop_chance_coefficient: 0.5 }),
      item("old-auction", { status: "auctioned" }),
    ]);
    assert.deepEqual(await migrateItemRevealStates(db), { updated: 507 });
    assert.deepEqual(await migrateItemRevealStates(db), { updated: 0 });
    assert.equal((await items.findOne({ _id: "legacy-0" }))?.revealed, false);
    assert.equal((await items.findOne({ _id: "legacy-1" }))?.revealed, true);
    assert.equal((await items.findOne({ _id: "legacy-504" }))?.revealed, false);
    assert.equal((await items.findOne({ _id: "already-known" }))?.revealed, true);
    assert.equal((await items.findOne({ _id: "already-sealed" }))?.revealed, false);
    assert.equal((await items.findOne({ _id: "ordinary" }))?.revealed, true);
    assert.equal((await items.findOne({ _id: "old-auction" }))?.revealed, true);
    assert.equal((await items.findOne({ _id: "legacy-0" }))?.original_drop_chance_coefficient, 0);
  });

  await t.test("visible snapshots initialize legacy state and keep items revealed after cutoffs change", async () => {
    const db = client.db("reveal-snapshots");
    const items = db.collection<GameItem>("items");
    await items.insertMany([item("pending"), item("collection", { status: "claimed" })]);
    const snapshots = await ensureItemRevealStates(db, await items.find({}).toArray(), cutoffs);
    assert.equal(snapshots.find((entry) => entry._id === "pending")?.revealed, false);
    assert.equal(snapshots.find((entry) => entry._id === "collection")?.revealed, true);
    await ensureItemRevealStates(db, await items.find({}).toArray(), { level1: 0, level2: 0, level3: 0 });
    const known = await ensureItemRevealStates(db, await items.find({}).toArray(), cutoffs);
    assert.ok(known.every((entry) => entry.revealed));
    assert.equal((await items.findOne({ _id: "pending" }))?.revealed, true);
  });

  await t.test("old metadata gets safe defaults and actual/debug cutoffs are read independently", async () => {
    const db = client.db("reveal-settings");
    assert.deepEqual((await getGameplaySettings(db)).active.offerRevealThresholds, cutoffs);
    const actual = { ...DEFAULT_ACTUAL_GAMEPLAY_CONFIG, offerRevealThresholds: { level1: 0.1, level2: 0.01, level3: 0.001 } };
    const debug = { ...DEFAULT_ACTUAL_GAMEPLAY_CONFIG, offerRevealThresholds: { level1: 0.2, level2: 0.02, level3: 0.002 } };
    await db.collection<{ _id: string }>("metadata").insertOne({
      _id: "gameplay-settings",
      gameplay: { debug_enabled: true, configs: {
        actual: toStoredGameplayConfig(actual), debug: toStoredGameplayConfig(debug),
      } },
    });
    const settings = await getGameplaySettings(db);
    assert.deepEqual(settings.actual.offerRevealThresholds, actual.offerRevealThresholds);
    assert.deepEqual(settings.active.offerRevealThresholds, debug.offerRevealThresholds);
  });

  for (const rarity of ["legendary", "masterpiece"]) {
    await t.test(`${rarity} backfill and raw snapshots ignore odds cutoffs and preserve known items`, async () => {
      const db = client.db(`${rarity}-reveals`);
      await db.collection<{ _id: string; rarity: string }>("artworks").insertOne({
        _id: "rare-art", rarity,
      });
      const artworkItem = { artwork_id: "rare-art", drop_chance_coefficient: 0.5 };
      const items = db.collection<GameItem>("items");
      await items.insertMany([
        item("pending-item", artworkItem),
        item("known-item", { ...artworkItem, revealed: true }),
        item("legacy-collection", { ...artworkItem, status: "claimed" }),
        item("sealed-collection", { ...artworkItem, status: "claimed", revealed: false }),
      ]);
      assert.deepEqual(await migrateItemRevealStates(db), { updated: 2 });
      assert.deepEqual(await migrateItemRevealStates(db), { updated: 0 });
      const disabled = { level1: 0, level2: 0, level3: 0 };
      const normalized = await ensureItemRevealStates(db, await items.find({}).toArray(), disabled);
      assert.equal(normalized.find((entry) => entry._id === "pending-item")?.revealed, false);
      assert.equal(normalized.find((entry) => entry._id === "known-item")?.revealed, true);
      assert.equal(normalized.find((entry) => entry._id === "legacy-collection")?.revealed, true);
      assert.equal(normalized.find((entry) => entry._id === "sealed-collection")?.revealed, false);
      await items.insertOne(item("raw-snapshot", artworkItem));
      const [snapshot] = await ensureItemRevealStates(db, [await items.findOne({ _id: "raw-snapshot" }) as GameItem], disabled);
      assert.equal(snapshot.revealed, false);
      assert.equal((await items.findOne({ _id: "raw-snapshot" }))?.revealed, false);
      assert.equal(Object.hasOwn(snapshot, "artwork"), false);
    });
  }
});
