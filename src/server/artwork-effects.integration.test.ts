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

    await db.collection("items").updateOne(
      { _id: "claimed-effect" },
      { $set: { status: "displayed" } },
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
  } finally {
    await client.close();
    await server.stop();
  }
});
