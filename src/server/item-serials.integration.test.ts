import assert from "node:assert/strict";
import test from "node:test";

import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import { migrateItemSerialNumbers } from "../../scripts/database-migrations.mjs";
import { calculateItemValues, type Artwork, type GameItem, type LootData } from "./gameplay.ts";
import { buildAdminCreatedItem } from "./admin-item-creator.ts";
import { sanitizePlayerFacingAuthenticity } from "./forgery-gameplay.ts";
import { hydrateGameItems } from "./item-artwork.ts";
import {
  allocateArtworkSerialNumbers,
  assignItemSerialNumbers,
  isOriginalItemConflict,
} from "./item-serials.ts";
import { getArtworkSerialPrefix } from "./item-serial-format.ts";

const first = "00000002e916001122334455";
const second = "00000002e917001122334455";
const unused = "00000002e918001122334455";

function item(id: string, artworkId: string, forgery = false): GameItem {
  return {
    _id: id,
    artwork_id: artworkId,
    authenticity: { forgery, identified: false },
    date_created: "2026-10-30T00:00:00.000Z",
  } as GameItem;
}

test("item serial allocation and chronological migration", async (t) => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  t.after(async () => {
    await client.close();
    await server.stop();
  });
  await client.connect();

  await t.test("concurrent batch reservations never reuse an artwork sequence", async () => {
    const database = client.db("serial-concurrency");
    await database.collection("artworks").insertOne({ _id: first });
    const reservations = await Promise.all(
      Array.from({ length: 20 }, () => allocateArtworkSerialNumbers(database, first, 3)),
    );
    const numbers = reservations.flat().sort((a, b) => a - b);
    assert.deepEqual(numbers, Array.from({ length: 60 }, (_, index) => index + 1));
    assert.equal((await database.collection("artworks").findOne({ _id: first }))?.serial_counter, 60);
    assert.deepEqual(await allocateArtworkSerialNumbers(database, first, 1), [61]);
    await assert.rejects(allocateArtworkSerialNumbers(database, first, 0), /positive whole/);
    await assert.rejects(allocateArtworkSerialNumbers(database, "missing", 1), /missing/);
  });

  await t.test("genuine creation reserves numbers, while forged defaults and overrides do not consume them", async () => {
    const database = client.db("serial-creation");
    await database.collection("artworks").insertOne({ _id: first, serial_counter: 0 });
    const genuine = item("genuine", first);
    const randomForgery = item("random", first, true);
    const editedForgery = {
      ...item("edited", first, true), serial_prefix: 123, serial_number: 1,
    };
    await assignItemSerialNumbers(database, [genuine, randomForgery, editedForgery]);
    assert.equal(genuine.serial_number, 1);
    assert.equal(Object.hasOwn(genuine, "serial_prefix"), false);
    assert.equal(randomForgery.serial_prefix, getArtworkSerialPrefix(first));
    assert.ok(randomForgery.serial_number! >= 1 && randomForgery.serial_number! <= 999999);
    assert.equal(editedForgery.serial_prefix, 123);
    assert.equal(editedForgery.serial_number, 1);
    assert.equal((await database.collection("artworks").findOne({ _id: first }))?.serial_counter, 1);
    assert.equal(sanitizePlayerFacingAuthenticity(genuine).serial_prefix, getArtworkSerialPrefix(first));
    assert.equal(sanitizePlayerFacingAuthenticity(editedForgery).serial_prefix, 123);
    assert.deepEqual(sanitizePlayerFacingAuthenticity(editedForgery).authenticity, { identified: false });
    const [hydrated] = await hydrateGameItems(database, [genuine]);
    assert.equal(Object.hasOwn(hydrated.artwork, "serial_counter"), false);
  });

  await t.test("Originals reserve zero without consuming regular numbers and only one can remain active", async () => {
    const database = client.db("serial-original-creation");
    await database.collection("artworks").insertOne({ _id: first, serial_counter: 0 });
    const original = { ...item("original", first), original: true };
    await assignItemSerialNumbers(database, [original]);
    await database.collection<GameItem>("items").insertOne(original);
    assert.equal(original.serial_number, 0);
    assert.equal((await database.collection("artworks").findOne({ _id: first }))?.serial_counter, 0);
    const regular = { ...item("regular", first), original: false };
    await assignItemSerialNumbers(database, [regular]);
    assert.equal(regular.serial_number, 1);
    const duplicate = { ...item("duplicate-original", first, true), original: true };
    await assignItemSerialNumbers(database, [duplicate]);
    await assert.rejects(
      database.collection<GameItem>("items").insertOne(duplicate),
      isOriginalItemConflict,
    );
    await assert.rejects(assignItemSerialNumbers(database, [{
      ...item("forged-zero", first, true), original: false, serial_number: 0,
    }]), /positive serial/);
    await database.collection<GameItem>("items").deleteOne({ _id: original._id });
    await database.collection<GameItem>("items").insertOne(duplicate);
    assert.equal(duplicate.serial_number, 0);
    assert.equal((await database.collection("artworks").findOne({ _id: first }))?.serial_counter, 1);
  });

  await t.test("backfill follows creation dates across batches, maintains independent artwork counters and is idempotent", async () => {
    const database = client.db("serial-backfill");
    await database.collection("artworks").insertMany([{ _id: first }, { _id: second }, { _id: unused }]);
    const originals = Array.from({ length: 503 }, (_, index) => ({
      ...item(`a-${index}`, first),
      date_created: new Date(Date.UTC(2026, 9, 1) + index * 1000).toISOString(),
      original_drop_chance_coefficient: 0.123,
    }));
    await database.collection("items").insertMany([
      ...[...originals].reverse(),
      { ...item("b-later", second), date_created: "2026-10-02T00:00:00.000Z" },
      { ...item("b-earlier", second), date_created: "2026-09-01T00:00:00.000Z" },
      { ...item("forged", first, true), date_created: "2026-08-01T00:00:00.000Z" },
    ]);
    assert.deepEqual(await migrateItemSerialNumbers(database), {
      artworksInitialized: 3, itemsUpdated: 506, originalsDemoted: 0,
    });
    const items = database.collection<GameItem>("items");
    for (const [id, number] of [["a-0", 1], ["a-502", 503], ["b-earlier", 1], ["b-later", 2]] as const) {
      assert.equal((await items.findOne({ _id: id }))?.serial_number, number);
    }
    assert.deepEqual(await items.findOne({ _id: "a-0" }), { ...originals[0], serial_number: 1 });
    assert.equal((await database.collection("artworks").findOne({ _id: first }))?.serial_counter, 503);
    assert.equal((await database.collection("artworks").findOne({ _id: second }))?.serial_counter, 2);
    assert.equal((await database.collection("artworks").findOne({ _id: unused }))?.serial_counter, 0);
    assert.deepEqual(await migrateItemSerialNumbers(database), { artworksInitialized: 0, itemsUpdated: 0, originalsDemoted: 0 });
    await assert.rejects(items.insertOne({ ...item("duplicate", first), serial_number: 1 }), /duplicate key/i);
    await items.insertOne({ ...item("forged-duplicate", first, true), serial_number: 1, serial_prefix: 190742 });
  });

  await t.test("resume reconciles existing genuine serials without resetting counters or counting forged values", async () => {
    const database = client.db("serial-resume");
    await database.collection("artworks").insertMany([
      { _id: first, serial_counter: 0 }, { _id: unused, serial_counter: 99 },
    ]);
    await database.collection("items").insertMany([
      { ...item("existing", first), serial_number: 12 },
      { _id: "z-pending", artwork_id: first, date_created: "2026-10-30T00:00:00.000Z" },
      item("a-pending", first),
      { ...item("forged", first, true), serial_number: 999999, serial_prefix: 42 },
    ]);
    assert.deepEqual(await migrateItemSerialNumbers(database), { artworksInitialized: 0, itemsUpdated: 2, originalsDemoted: 0 });
    assert.equal((await database.collection("items").findOne({ _id: "a-pending" }))?.serial_number, 13);
    assert.equal((await database.collection("items").findOne({ _id: "z-pending" }))?.serial_number, 14);
    assert.equal((await database.collection("items").findOne({ _id: "existing" }))?.serial_number, 12);
    assert.equal((await database.collection("artworks").findOne({ _id: unused }))?.serial_counter, 99);
    await assert.rejects(database.collection("items").insertOne({
      ...item("duplicate-legacy", first), serial_number: 14,
    }), /duplicate key/i);
    assert.deepEqual(await allocateArtworkSerialNumbers(database, first, 1), [15]);
  });

  await t.test("migration retains the oldest Original, reprices extras, repairs zero serials and starts regulars at one", async () => {
    const database = client.db("serial-original-backfill");
    const artwork: Artwork = {
      _id: first, artist_id: "artist", artist: "Artist", title: "Artwork", date: 2000,
      genre: "Test", medium: "Test", rarity: "common", value_scale: 0.5,
      height: 50, width: 40, active: true,
    };
    const lootData: LootData = {
      basic_crate_cost: 1, items_per_basic_crate: 1, crate_expense_per_masterpiece: 1,
      rarity_values: {
        common: { min: 10, max: 20 }, uncommon: { min: 20, max: 30 },
        rare: { min: 30, max: 40 }, legendary: { min: 40, max: 50 }, masterpiece: { min: 50, max: 60 },
      },
      seasonal_items: { common: [], uncommon: [], rare: [], legendary: [], masterpiece: [] },
      global_foil_chance: 0, global_patreon_chance: 0, global_unlocked_chance: 0, global_misprint_chance: 0,
    };
    const base = buildAdminCreatedItem({
      artwork, lootData, owner: "player", mintValueMultiplier: 2,
      attributes: [{ _id: "attr", active: true, title: "Attribute", type: "test", description: "Test", icon: "fa-star", npc_name: "Test" }],
      customization: {
        condition: 0.5, mint: false, level: 1, rollCount: 0, rerollSpent: 0,
        foil: false, unlocked: false, seasonal: false, lottery: 0, original: false, patreon: false,
        vintage: false, permanent: false, debug: false, cardRenderer: "museum", source: "fixture",
        tags: [], misprint: false, forgery: false, forgeryQuality: 0.5, forgeryIdentified: false,
        attributes: { locked: [], unlocked: [{ attributeId: "attr", value: 0.5 }], special: [] },
      },
    });
    function card(id: string, original: boolean, date: string) {
      const card = {
        ...structuredClone(base), _id: id, original, date_created: date,
        original_drop_chance_coefficient: 0.123,
      };
      card.values = calculateItemValues(card, artwork, lootData);
      return card;
    }
    const oldest = card("a-original", true, "2026-10-02T00:00:00.000Z");
    const duplicate = card("z-duplicate", true, oldest.date_created);
    const regular = { ...card("regular-first", false, "2026-10-01T00:00:00.000Z"), serial_number: 0 };
    const forgedOriginal = {
      ...card("forged-duplicate", true, "2026-10-04T00:00:00.000Z"),
      authenticity: { ...base.authenticity, forgery: true }, serial_number: 0, serial_prefix: 123,
    };
    const forgedZero = {
      ...card("forged-zero", false, "2026-10-01T00:00:00.000Z"),
      authenticity: { ...base.authenticity, forgery: true }, serial_number: 0, serial_prefix: 456,
    };
    await database.collection<Artwork>("artworks").insertOne(artwork);
    await database.collection("metadata").insertOne({ _id: "loot-data", loot_data: lootData });
    await database.collection<GameItem>("items").insertMany([
      duplicate, forgedOriginal, forgedZero, oldest, regular,
      card("regular-last", false, "2026-10-03T00:00:00.000Z"),
    ]);
    assert.deepEqual(await migrateItemSerialNumbers(database), {
      artworksInitialized: 1, itemsUpdated: 6, originalsDemoted: 2,
    });
    const items = database.collection<GameItem>("items");
    assert.deepEqual(await items.findOne({ _id: oldest._id }), { ...oldest, serial_number: 0 });
    assert.deepEqual(await items.findOne({ _id: duplicate._id }), {
      ...duplicate, original: false, serial_number: 2, values: base.values,
    });
    assert.ok(duplicate.values.actual > base.values.actual);
    assert.equal((await items.findOne({ _id: regular._id }))?.serial_number, 1);
    assert.equal((await items.findOne({ _id: "regular-last" }))?.serial_number, 3);
    const repairedForgery = await items.findOne({ _id: forgedZero._id });
    assert.equal(repairedForgery?.serial_prefix, 456);
    assert.ok(repairedForgery!.serial_number! > 0);
    const demotedForgery = await items.findOne({ _id: forgedOriginal._id });
    assert.equal(demotedForgery?.original, false);
    assert.equal(demotedForgery?.serial_prefix, 123);
    assert.ok(demotedForgery!.serial_number! > 0);
    assert.deepEqual(demotedForgery?.values, base.values);
    assert.equal(await items.countDocuments({ original: true }), 1);
    assert.equal(await items.countDocuments({ original: { $ne: true }, serial_number: 0 }), 0);
    assert.equal((await database.collection<Artwork>("artworks").findOne({ _id: first }))?.serial_counter, 3);
    assert.deepEqual(await migrateItemSerialNumbers(database), {
      artworksInitialized: 0, itemsUpdated: 0, originalsDemoted: 0,
    });
  });

  await t.test("an already-numbered Original does not consume one or get rejected on migration reruns", async () => {
    const database = client.db("serial-original-zero");
    await database.collection("artworks").insertOne({ _id: first });
    await database.collection<GameItem>("items").insertOne({
      ...item("original", first), original: true, serial_number: 0,
    });
    assert.deepEqual(await migrateItemSerialNumbers(database), {
      artworksInitialized: 1, itemsUpdated: 0, originalsDemoted: 0,
    });
    assert.deepEqual(await allocateArtworkSerialNumbers(database, first, 1), [1]);
  });

  await t.test("old positive Original serials become zero without resetting regular serials or counter high-water marks", async () => {
    const database = client.db("serial-original-correction");
    await database.collection("artworks").insertOne({ _id: first, serial_counter: 20 });
    const original = {
      ...item("original", first), original: true, serial_number: 17,
      original_drop_chance_coefficient: 0.125,
    };
    const regular = { ...item("regular", first), original: false, serial_number: 7 };
    await database.collection<GameItem>("items").insertMany([original, regular]);
    assert.deepEqual(await migrateItemSerialNumbers(database), {
      artworksInitialized: 0, itemsUpdated: 1, originalsDemoted: 0,
    });
    assert.deepEqual(await database.collection<GameItem>("items").findOne({ _id: original._id }), {
      ...original, serial_number: 0,
    });
    assert.deepEqual(await database.collection<GameItem>("items").findOne({ _id: regular._id }), regular);
    assert.deepEqual(await allocateArtworkSerialNumbers(database, first, 1), [21]);
  });

  await t.test("prefix collisions and exhausted counters fail rather than issuing ambiguous or unsafe numbers", async () => {
    const database = client.db("serial-collisions");
    await database.collection("artworks").insertMany([
      { _id: first }, { _id: "00000002e916ffffffffffff" },
    ]);
    await assert.rejects(migrateItemSerialNumbers(database), /prefix collision/);
    await database.collection("artworks").deleteOne({ _id: "00000002e916ffffffffffff" });
    await database.collection("artworks").updateOne({ _id: first }, { $set: { serial_counter: Number.MAX_SAFE_INTEGER } });
    await assert.rejects(allocateArtworkSerialNumbers(database, first, 1), /exhausted/);
  });
});
