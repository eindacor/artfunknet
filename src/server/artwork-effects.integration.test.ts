import assert from "node:assert/strict";
import test from "node:test";

import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";

import {
  getDisplayedArtworkEffect,
  getDisplayedArtworkEffects,
  type ArtworkEffect,
} from "./artwork-effects.ts";
import { settleDailyMasterpieceInterest } from "./masterpiece-effects.ts";
import {
  migrateArtworkEffects,
  migrateMasterpieceFlavorTexts,
} from "../../scripts/database-migrations.mjs";

test("displayed duplicate effect references do not stack and daily interest is idempotent", async () => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  try {
    await client.connect();
    const db = client.db("effects");
    const effect: ArtworkEffect = {
      _id: "interest",
      effect_type: "masterpiece",
      title: "Interest",
      description: "Interest",
      flavor_text: "Interest",
      code: "MP_BANK_INTEREST",
      active: true,
      linked_attributes: ["benefactor"],
      parameters: { rate: 0.03 },
    };
    await db.collection<ArtworkEffect>("artwork_effects").insertOne(effect);
    await db.collection("artworks").insertMany([
      { _id: "art-a", rarity: "masterpiece", effect_id: effect._id },
      { _id: "art-b", rarity: "masterpiece", effect_id: effect._id },
    ]);
    await db.collection("items").insertMany([
      { _id: "item-a", artwork_id: "art-a", owner: "player", status: "displayed" },
      { _id: "item-b", artwork_id: "art-b", owner: "player", status: "displayed" },
    ]);
    await db.collection("players").insertOne({
      _id: "player",
      active: true,
      profile: { bank_balance: 1000 },
    });

    const displayed = await getDisplayedArtworkEffects(db, "player");
    assert.deepEqual(displayed.map((entry) => entry._id), ["interest"]);
    const now = new Date("2026-10-01T12:00:00Z");
    assert.deepEqual(await settleDailyMasterpieceInterest(db, now), {
      settlements: 1,
      awarded: 30,
    });
    await db.collection("artwork_effect_settlements").deleteMany({});
    assert.deepEqual(await settleDailyMasterpieceInterest(db, now), {
      settlements: 0,
      awarded: 0,
    });
    const player = await db.collection("players").findOne({ _id: "player" });
    assert.equal(player?.profile.bank_balance, 1030);
    assert.deepEqual(
      player?.profile.artwork_effect_settlements.MP_BANK_INTEREST,
      {
        date: "2026-10-01",
        effect_id: effect._id,
        base: 1000,
        rate: 0.03,
        amount: 30,
      },
    );
    assert.equal(
      await db.collection("artwork_effect_settlements").countDocuments({
        _id: "2026-10-01:player:MP_BANK_INTEREST",
        status: "completed",
        amount: 30,
      }),
      1,
    );
  } finally {
    await client.close();
    await server.stop();
  }
});

test("masterpiece flavor backfill generates distinct short praise and preserves authored quotes", async () => {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  try {
    const db = client.db("masterpiece-flavor");
    const effects = db.collection<ArtworkEffect>("artwork_effects");
    const base = {
      effect_type: "masterpiece",
      title: "Effect title",
      description: "A gameplay effect description.",
      code: "MP_TEST",
      active: true,
      linked_attributes: ["attribute"],
      parameters: { chance: 0.5 },
    };
    const authored = "A stillness that speaks with extraordinary force.";
    await db.collection<{ _id: string }>("artwork_effects").insertMany([
      { ...base, _id: "missing" },
      { ...base, _id: "null", flavor_text: null },
      { ...base, _id: "invalid", flavor_text: { $eq: "not a quote" } },
      { ...base, _id: "blank", flavor_text: "" },
      { ...base, _id: "whitespace", flavor_text: "   " },
      { ...base, _id: "placeholder", flavor_text: base.description },
      { ...base, _id: "legacy", flavor_text: "Reserved definition for transferable private auctions and public commission." },
      { ...base, _id: "inactive", active: false },
      { ...base, _id: "authored", flavor_text: authored },
      { ...base, _id: "legendary", effect_type: "legendary", flavor_text: base.description },
    ]);
    assert.deepEqual(await migrateMasterpieceFlavorTexts(db), { updated: 8 });
    const saved = await effects.find({ effect_type: "masterpiece" }).toArray();
    assert.equal(new Set(saved.map((effect) => effect.flavor_text)).size, saved.length);
    for (const effect of saved.filter((effect) => effect._id !== "authored")) {
      assert.ok(effect.flavor_text.length <= 120);
      assert.ok(effect.flavor_text.split(/\s+/).length <= 20);
      assert.notEqual(effect.flavor_text, base.description);
      assert.deepEqual(effect.parameters, base.parameters);
      assert.deepEqual(effect.linked_attributes, base.linked_attributes);
      assert.equal(effect.description, base.description);
      assert.equal(effect.code, base.code);
    }
    assert.equal((await effects.findOne({ _id: "authored" }))?.flavor_text, authored);
    assert.equal((await effects.findOne({ _id: "inactive" }))?.active, false);
    assert.equal((await effects.findOne({ _id: "legendary" }))?.flavor_text, base.description);
    assert.deepEqual(await migrateMasterpieceFlavorTexts(db), { updated: 0 });
    assert.deepEqual(await effects.find({ effect_type: "masterpiece" }).toArray(), saved);
  } finally {
    await client.close();
    await server.stop();
  }
});

test("effect registry and flavor migration preserve quotes across reruns and legacy description updates", async () => {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  try {
    const db = client.db("masterpiece-flavor-registry");
    const authored = "The surface sings; the silence answers.";
    await db.collection<{ _id: string }>("artwork_effects").insertOne({
      _id: "masterpiece-auctioneer-transferable",
      effect_type: "masterpiece",
      code: "MASTERPIECE_TRANSFERABLE_AUCTION",
      title: "Public Commission",
      description: "Reserved definition for transferable private auctions and public commission.",
      flavor_text: authored,
      linked_attributes: ["auctioneer"],
      active: true,
      parameters: { commission_rate: 0.1 },
    });
    await migrateArtworkEffects(db);
    const count = await db.collection("artwork_effects").countDocuments({ effect_type: "masterpiece" });
    assert.deepEqual(await migrateMasterpieceFlavorTexts(db), { updated: count - 1 });
    const quotes = await db.collection<ArtworkEffect>("artwork_effects")
      .find({ effect_type: "masterpiece" }).sort({ _id: 1 }).toArray();
    assert.equal(quotes.find((effect) => effect._id === "masterpiece-auctioneer-transferable")?.flavor_text, authored);
    assert.equal(new Set(quotes.map((effect) => effect.flavor_text)).size, quotes.length);
    await migrateArtworkEffects(db);
    assert.deepEqual(await migrateMasterpieceFlavorTexts(db), { updated: 0 });
    assert.deepEqual(await db.collection<ArtworkEffect>("artwork_effects")
      .find({ effect_type: "masterpiece" }).sort({ _id: 1 }).toArray(), quotes);
  } finally {
    await client.close();
    await server.stop();
  }
});

test("effects activate only while an effect-bearing item is displayed", async () => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  try {
    await client.connect();
    const db = client.db("displayed-effects");
    const effect: ArtworkEffect = {
      _id: "display-required",
      effect_type: "legendary",
      title: "Display Required",
      description: "Display Required",
      flavor_text: "Display Required",
      code: "DISPLAY_REQUIRED",
      active: true,
      linked_attributes: ["benefactor", "collector"],
      parameters: {},
    };
    await db.collection<ArtworkEffect>("artwork_effects").insertOne(effect);
    await db.collection("artworks").insertOne({
      _id: "effect-art",
      rarity: "legendary",
      effect_id: effect._id,
    });
    await db.collection("items").insertMany([
      {
        _id: "claimed-effect",
        artwork_id: "effect-art",
        owner: "player",
        status: "claimed",
      },
      {
        _id: "auctioned-effect",
        artwork_id: "effect-art",
        owner: "player",
        status: "auctioned",
      },
    ]);

    assert.equal(
      await getDisplayedArtworkEffect(db, "player", effect.code),
      null,
    );

    for (const permanent of [false, true]) {
      await db.collection("items").updateOne(
        { _id: "claimed-effect" },
        { $set: { status: "displayed", permanent } },
      );
      assert.equal(
        (await getDisplayedArtworkEffect(db, "player", effect.code))?._id,
        effect._id,
      );

      await db.collection("items").updateOne(
        { _id: "claimed-effect" },
        { $set: { status: "claimed" } },
      );
      assert.equal(
        await getDisplayedArtworkEffect(db, "player", effect.code),
        null,
      );
    }
  } finally {
    await client.close();
    await server.stop();
  }
});
