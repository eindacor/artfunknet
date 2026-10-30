import assert from "node:assert/strict";
import test from "node:test";

import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import {
  migrateItemDropChances,
  migrateOriginalItemDropChances,
} from "../../scripts/database-migrations.mjs";
import type { ArtworkEffect } from "./artwork-effects.ts";
import {
  DEFAULT_ACTUAL_GAMEPLAY_CONFIG,
  toStoredGameplayConfig,
} from "./game-settings.ts";
import { generateDailyDrop, type Artwork, type GameItem, type LootData } from "./gameplay.ts";
import { getItemDropChanceContext, getItemDropChanceUpdate } from "./item-drop-chance.ts";
import { getDemintUpdate } from "./item-mint.ts";
import { MASTERPIECE_EFFECT_CODES } from "./masterpiece-effects.ts";

const config = {
  ...DEFAULT_ACTUAL_GAMEPLAY_CONFIG,
  rarityWeights: {
    common: 714, uncommon: 200, rare: 70, legendary: 15, masterpiece: 1,
  },
  foilProbability: 0.1,
  unlockedProbability: 0.2,
  cardRendererProbability: 0.25,
  mintProbability: 0.02,
  cardStyleWeights: {
    ...DEFAULT_ACTUAL_GAMEPLAY_CONFIG.cardStyleWeights,
    legacy: 3, postcard: 1,
  },
};

async function seed(database: Db) {
  const lootData: LootData = {
    basic_crate_cost: 1,
    items_per_basic_crate: 1,
    crate_expense_per_masterpiece: 1,
    rarity_values: {
      common: { min: 1, max: 10 },
      uncommon: { min: 10, max: 20 },
      rare: { min: 20, max: 30 },
      legendary: { min: 30, max: 40 },
      masterpiece: { min: 40, max: 50 },
    },
    seasonal_items: { common: [], uncommon: [], rare: [], legendary: [], masterpiece: [] },
    global_foil_chance: 0.9,
    global_patreon_chance: 0,
    global_unlocked_chance: 0.9,
    global_misprint_chance: 0,
  };
  await database.collection<{ _id: string }>("metadata").insertMany([
    { _id: "loot-data", loot_data: lootData },
    { _id: "gameplay-settings", gameplay: { configs: { actual: toStoredGameplayConfig(config) } } },
    { _id: "card-renderer-settings", active_renderer_ids: ["legacy", "postcard", "museum"] },
  ]);
  const artwork: Artwork = {
    _id: "art", active: true, rarity: "common", artist_id: "artist",
    artist: "Artist", title: "Test", date: 2000, genre: "Test",
    medium: "Test", value_scale: 0.5, height: 10, width: 10,
  };
  await database.collection<Artwork>("artworks").insertMany([
    artwork,
    { ...artwork, _id: "second-art" },
    { ...artwork, _id: "inactive-art", active: false },
  ]);
  await database.collection<{ _id: string }>("attributes").insertMany(
    Array.from({ length: 10 }, (_, index) => ({
      _id: `attr-${index}`, active: true, type: "test", title: "Attribute",
      description: "Test", icon: "fa-star", npc_name: "Test",
    })),
  );
  return artwork;
}

test("stored drop odds follow live configuration, generation, mutations and production backfill", async (t) => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  t.after(async () => {
    await client.close();
    await server.stop();
  });
  await client.connect();

  await t.test("configuration and active catalog changes invalidate derived probabilities", async () => {
    const database = client.db("live-drop-config");
    await seed(database);
    const before = await getItemDropChanceContext(database);
    assert.equal(before.rarity.common, 0.714);
    assert.equal(before.artworkCounts.common, 2);
    assert.deepEqual(before.styles, { legacy: 0.75, postcard: 0.25 });
    await database.collection("metadata").updateOne({ _id: "gameplay-settings" }, {
      $set: { "gameplay.configs.actual.card_style_weights.postcard": 3 },
    });
    assert.deepEqual((await getItemDropChanceContext(database)).styles, {
      legacy: 0.5, postcard: 0.5,
    });
    await database.collection<Artwork>("artworks").updateOne(
      { _id: "inactive-art" }, { $set: { active: true } },
    );
    assert.equal((await getItemDropChanceContext(database)).artworkCounts.common, 3);
  });

  await t.test("generation saves baseline odds rather than boosted source or low-level odds, and deminting refreshes them", async () => {
    const database = client.db("generated-drop-odds");
    await seed(database);
    const [item] = await generateDailyDrop(database, "player", 0, {
      itemCount: 1,
      generationMap: {
        rarity: { common: 1, uncommon: 0, rare: 0, legendary: 0, masterpiece: 0 },
        foil: 1, mint: 1, cardStyle: 1, cardStyles: { legacy: 1, postcard: 0 },
      },
    });
    assert.equal(item.mint, true);
    assert.equal(item.foil, true);
    assert.equal(item.card_renderer, "legacy");
    assert.ok(Math.abs(item.drop_chance_coefficient! - 0.00026775) < 1e-18);
    assert.equal(item.odds, "1 in 3,735");
    const stored = await database.collection<GameItem>("items").findOne({ _id: item._id });
    assert.equal(stored?.drop_chance_coefficient, item.drop_chance_coefficient);
    assert.equal(item.original_drop_chance_coefficient, item.drop_chance_coefficient);
    assert.equal(stored?.original_drop_chance_coefficient, item.drop_chance_coefficient);
    const deminted = await getDemintUpdate(database, item, { card_renderer: "postcard" });
    assert.equal(deminted?.mint, false);
    assert.ok(Math.abs(deminted!.drop_chance_coefficient! - 0.01785) < 1e-18);
    assert.equal(deminted?.odds, "1 in 56");
    assert.equal(Object.hasOwn(deminted!, "original_drop_chance_coefficient"), false);
    const items = database.collection<GameItem>("items");
    await items.updateOne({ _id: item._id }, { $set: deminted! });
    await database.collection("metadata").updateOne({ _id: "gameplay-settings" }, {
      $set: { "gameplay.configs.actual.foil_probability": 0.2 },
    });
    assert.deepEqual(await migrateItemDropChances(database), { updated: 1 });
    const recalculated = await items.findOne({ _id: item._id });
    assert.ok(Math.abs(recalculated!.drop_chance_coefficient! - 0.0357) < 1e-18);
    assert.equal(recalculated?.original_drop_chance_coefficient, item.drop_chance_coefficient);
    assert.deepEqual(await migrateItemDropChances(database), { updated: 0 });
  });

  await t.test("guaranteed-Mint effect odds include styles only until de-minted, preserving original odds during migration", async () => {
    const database = client.db("guaranteed-mint-drop-odds");
    const original = await seed(database);
    const artwork: Artwork = {
      ...original, _id: "masterpiece", rarity: "masterpiece", effect_id: "always-mint",
    };
    await database.collection<Artwork>("artworks").insertOne(artwork);
    await database.collection<ArtworkEffect>("artwork_effects").insertOne({
      _id: "always-mint",
      effect_type: "masterpiece",
      code: MASTERPIECE_EFFECT_CODES.preservationMint,
      active: true,
      title: "Preserved Mint",
      description: "Always generated Mint.",
      flavor_text: "",
      linked_attributes: ["attr-0"],
      parameters: {},
    });
    await database.collection("metadata").updateOne({ _id: "gameplay-settings" }, {
      $set: { "gameplay.configs.actual.mint_probability": 0 },
    });
    const [item] = await generateDailyDrop(database, "player", 0, {
      itemCount: 1,
      targetArtworkId: artwork._id,
      generationMap: {
        rarity: { common: 1, uncommon: 0, rare: 0, legendary: 0, masterpiece: 0 },
        foil: 0, mint: 0, unlocked: 0, misprint: 0,
        cardStyle: 1, cardStyles: { legacy: 1, postcard: 0 },
      },
    });
    assert.equal(item.mint, true);
    assert.equal(item.card_renderer, "legacy");
    assert.ok(Math.abs(item.drop_chance_coefficient! - 0.0001875) < 1e-18);
    assert.equal(item.odds, "1 in 5,333");
    const chance = await getItemDropChanceUpdate(database, item, artwork);
    assert.equal(chance.drop_chance_coefficient, item.drop_chance_coefficient);
    assert.equal(chance.odds, item.odds);
    const deminted = await getDemintUpdate(database, item, { card_renderer: "postcard" });
    assert.equal(deminted?.mint, false);
    assert.equal(deminted?.drop_chance_coefficient, 0.001);
    assert.equal(deminted?.odds, "1 in 1,000");
    const items = database.collection<GameItem>("items");
    await items.updateOne({ _id: item._id }, {
      $set: { drop_chance_coefficient: 0, odds: "Not currently droppable" },
    });
    assert.deepEqual(await migrateItemDropChances(database), { updated: 1 });
    const backfilled = await items.findOne({ _id: item._id });
    assert.equal(backfilled?.mint, true);
    assert.equal(backfilled?.drop_chance_coefficient, item.drop_chance_coefficient);
    assert.equal(backfilled?.odds, item.odds);
    assert.deepEqual(await migrateItemDropChances(database), { updated: 0 });
    await items.updateOne({ _id: item._id }, {
      $set: {
        ...deminted!,
        card_renderer: "postcard",
        drop_chance_coefficient: 0.00025,
        odds: "1 in 4,000",
      },
    });
    assert.deepEqual(await migrateItemDropChances(database), { updated: 1 });
    const updatedDeminted = await items.findOne({ _id: item._id });
    assert.equal(updatedDeminted?.drop_chance_coefficient, 0.001);
    assert.equal(updatedDeminted?.odds, "1 in 1,000");
    assert.equal(updatedDeminted?.original_drop_chance_coefficient, item.original_drop_chance_coefficient);
    assert.deepEqual(await migrateItemDropChances(database), { updated: 0 });
    assert.deepEqual(await migrateOriginalItemDropChances(database), { updated: 0 });
    await database.collection<ArtworkEffect>("artwork_effects").updateOne(
      { _id: artwork.effect_id }, { $set: { active: false } },
    );
    assert.equal((await getItemDropChanceUpdate(database, item, artwork))
      .drop_chance_coefficient, 0);
  });

  await t.test("production migration updates every item including untouched Mint, in batches, idempotently", async () => {
    const database = client.db("backfilled-drop-odds");
    await seed(database);
    const items = database.collection<{
      _id: string; artwork_id: string; mint: boolean; odds: string;
      drop_chance_coefficient?: number;
      original_drop_chance_coefficient?: number;
    }>("items");
    const originals = Array.from({ length: 502 }, (_, index) => ({
      _id: `item-${index}`, artwork_id: "art", mint: true,
      condition: 1, mint_value_multiplier: 2, foil: false,
      unlocked: false, seasonal: false, status: "claimed",
      owner: "player", odds: "old odds", values: { actual: 123 },
    }));
    await items.insertMany(originals);
    await items.updateOne({ _id: "item-1" }, {
      $set: { original_drop_chance_coefficient: 0 },
    });
    await items.updateOne({ _id: "item-2" }, {
      $set: { original_drop_chance_coefficient: 0.123 },
    });
    await items.insertMany([
      { ...originals[0], _id: "seasonal", mint: false, seasonal: true },
      { ...originals[0], _id: "forged", odds: "forged" },
      {
        ...originals[0], _id: "transferred-style", mint: false,
        card_renderer: "postcard", drop_chance_coefficient: 0.044625,
        odds: "1 in 22",
      },
      {
        ...originals[0], _id: "rounded-one", mint: false,
        drop_chance_coefficient: 0.714, odds: "1 in 1",
      },
    ]);
    assert.deepEqual(await migrateItemDropChances(database), { updated: 506 });
    const updated = await items.findOne({ _id: "item-0" });
    assert.deepEqual(updated, {
      ...originals[0], drop_chance_coefficient: 0.01428, odds: "1 in 70",
    });
    assert.equal((await items.findOne({ _id: "seasonal" }))?.drop_chance_coefficient, 0.357);
    assert.equal((await items.findOne({ _id: "forged" }))?.odds, "forged");
    const styled = await items.findOne({ _id: "transferred-style" });
    assert.equal(styled?.drop_chance_coefficient, 0.1785);
    assert.equal(styled?.odds, "1 in 6");
    const roundedOne = await items.findOne({ _id: "rounded-one" });
    assert.equal(roundedOne?.drop_chance_coefficient, 0.714);
    assert.equal(roundedOne?.odds, "71.4%");
    assert.deepEqual(await migrateItemDropChances(database), { updated: 0 });
    await database.collection("metadata").updateOne({ _id: "gameplay-settings" }, {
      $set: { "gameplay.configs.actual.mint_probability": 0.01 },
    });
    assert.deepEqual(await migrateItemDropChances(database), { updated: 503 });
    assert.equal((await items.findOne({ _id: "item-501" }))?.drop_chance_coefficient, 0.00714);
    assert.equal((await items.findOne({ _id: "item-1" }))?.original_drop_chance_coefficient, 0);
    assert.equal((await items.findOne({ _id: "item-2" }))?.original_drop_chance_coefficient, 0.123);
    assert.equal(Object.hasOwn((await items.findOne({ _id: "item-0" }))!,
      "original_drop_chance_coefficient"), false);
  });

  await t.test("original-odds migration initializes only missing snapshots from refreshed coefficients once", async () => {
    const database = client.db("legacy-original-drop-odds");
    await seed(database);
    const items = database.collection<{
      _id: string;
      artwork_id: string;
      mint: boolean;
      odds: string;
      drop_chance_coefficient: number;
      original_drop_chance_coefficient?: number;
    }>("items");
    const legacy = {
      _id: "legacy-mint", artwork_id: "art", mint: true, foil: false,
      unlocked: false, seasonal: false, odds: "Admin created",
      drop_chance_coefficient: 0.99, condition: 1, values: { actual: 123 },
    };
    await items.insertMany([
      legacy,
      { ...legacy, _id: "seasonal", mint: false, seasonal: true },
      { ...legacy, _id: "forged", mint: false, odds: "forged" },
      { ...legacy, _id: "zero-chance", card_renderer: "inactive" },
      { ...legacy, _id: "existing-zero", original_drop_chance_coefficient: 0 },
      { ...legacy, _id: "existing-original", original_drop_chance_coefficient: 0.123 },
    ]);
    assert.deepEqual(await migrateItemDropChances(database), { updated: 6 });
    const refreshed = await items.find({}).toArray();
    assert.deepEqual(await migrateOriginalItemDropChances(database), { updated: 4 });
    for (const before of refreshed) {
      assert.deepEqual(await items.findOne({ _id: before._id }), {
        ...before,
        original_drop_chance_coefficient:
          before.original_drop_chance_coefficient ?? before.drop_chance_coefficient,
      });
    }
    assert.equal((await items.findOne({ _id: "legacy-mint" }))?.original_drop_chance_coefficient, 0.01428);
    assert.equal((await items.findOne({ _id: "seasonal" }))?.original_drop_chance_coefficient, 0.357);
    assert.equal((await items.findOne({ _id: "forged" }))?.original_drop_chance_coefficient, 0.714);
    assert.equal((await items.findOne({ _id: "zero-chance" }))?.original_drop_chance_coefficient, 0);
    assert.deepEqual(await migrateOriginalItemDropChances(database), { updated: 0 });

    await database.collection("metadata").updateOne({ _id: "gameplay-settings" }, {
      $set: { "gameplay.configs.actual.mint_probability": 0.01 },
    });
    assert.deepEqual(await migrateItemDropChances(database), { updated: 3 });
    assert.deepEqual(await migrateOriginalItemDropChances(database), { updated: 0 });
    const migrated = await items.findOne({ _id: "legacy-mint" });
    assert.equal(migrated?.drop_chance_coefficient, 0.00714);
    assert.equal(migrated?.original_drop_chance_coefficient, 0.01428);
    assert.equal((await items.findOne({ _id: "existing-zero" }))?.original_drop_chance_coefficient, 0);
    assert.equal((await items.findOne({ _id: "existing-original" }))?.original_drop_chance_coefficient, 0.123);
    assert.equal((await items.findOne({ _id: "forged" }))?.odds, "forged");

    const invalid = [
      { _id: "missing-current" },
      { _id: "null-current", drop_chance_coefficient: null },
      { _id: "string-current", drop_chance_coefficient: "0.5" },
      { _id: "negative-current", drop_chance_coefficient: -0.1 },
      { _id: "large-current", drop_chance_coefficient: 1.1 },
    ];
    await database.collection("items").insertMany(invalid);
    assert.deepEqual(await migrateOriginalItemDropChances(database), { updated: 0 });
    for (const item of invalid) {
      assert.deepEqual(await database.collection("items").findOne({ _id: item._id }), item);
    }
  });
});
