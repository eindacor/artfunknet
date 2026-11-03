import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import ts from "typescript";

import {
  calculateCollectorReward,
  getCollectorAuctionCommissionCoefficient,
  getCollectorForgeryHeat,
  getHighestAvailableCollectorQuality,
} from "./collector-gameplay.ts";
import type { LegendaryAttribute } from "./legendary-attributes.ts";
import { getLegendaryNumberParameter } from "./legendary-attributes-core.ts";
import * as galleryCore from "./gallery-metadata-core.ts";
import * as masterpieceEffects from "./masterpiece-effects.ts";
import * as showcase from "./public-showcase-core.ts";
import { getItemDisposalFilter } from "./item-permissions.ts";

const item = {
  condition: 0.9,
  level: 5,
  roll_count: 0,
  values: {
    actual: 10_000,
    sell: 0,
    purchase: 0,
    auction_min: 0,
    collector: 0,
    dealer: 0,
  },
};

test("Collector selections and reservations ignore tagged Originals, promoted works and permanent works", async t => {
  const source = ts.createSourceFile("route.ts",
    await readFile(new URL("../app/api/play/npcs/[id]/meet/route.ts", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest, true,
  );
  const filters: ts.ObjectLiteralExpression[] = [];
  function visit(node: ts.Node) {
    if (ts.isObjectLiteralExpression(node) && node.properties.some(property =>
      ts.isPropertyAssignment(property) && property.name.getText(source) === "tags" &&
      ts.isStringLiteral(property.initializer) && property.initializer.text === "for sale",
    )) filters.push(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(filters.length, 4);
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  t.after(async () => { await client.close(); await server.stop(); });
  for (const status of ["claimed", "displayed"] as const) {
    const items = client.db(`original-collector-filters-${status}`).collection<{ _id: string }>("items");
    await items.insertMany([
      { _id: "original", owner: "player", status, tags: ["for sale"], original: true, permanent: false },
      { _id: "ordinary", owner: "player", status, tags: ["for sale"], original: false, permanent: false },
      { _id: "permanent", owner: "player", status, tags: ["for sale"], original: false, permanent: true },
    ]);
    for (const expression of filters) {
      const filterFor = (id: string) => runInNewContext(`(${expression.getText(source)})`, {
        getItemDisposalFilter,
        player: { _id: "player" }, candidate: { _id: id, status }, target: { _id: id, status },
      });
      const filter = filterFor("original");
      if ("_id" in filter) {
        assert.equal((await items.updateOne(filter, { $set: { status: "collector_pending" } })).modifiedCount, 0);
        assert.equal((await items.updateOne(filterFor("permanent"), { $set: { status: "collector_pending" } })).modifiedCount, 0);
        assert.equal((await items.updateOne(filterFor("ordinary"), { $set: { status: "collector_pending" } })).modifiedCount, status === "claimed" ? 1 : 0);
        await items.updateOne({ _id: "ordinary" }, { $set: { status } });
      } else {
        assert.deepEqual((await items.find(filter).toArray()).map(candidate => candidate._id), status === "claimed" ? ["ordinary"] : []);
      }
    }
    assert.equal((await items.findOne({ _id: "original" }))?.status, status);
  }
});

test("Collector outcomes preserve eligible inventory behavior and never consume protected works", async t => {
  const source = ts.createSourceFile("route.ts",
    await readFile(new URL("../app/api/play/npcs/[id]/meet/route.ts", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest, true,
  );
  let collector: ts.IfStatement | undefined;
  function visit(node: ts.Node) {
    if (ts.isIfStatement(node) && node.expression.getText(source) === "npc.attribute_id === ART_COLLECTOR_ATTRIBUTE_ID") {
      collector = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(collector);
  const code = ts.transpileModule(`async function meetCollector() { ${collector.getText(source)} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const metadataCode = ts.transpileModule(await readFile(new URL("./gallery-metadata.ts", import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const dependencies: Record<string, unknown> = {
    "server-only": {}, "./gallery-metadata-core": galleryCore,
    "./masterpiece-effects.ts": masterpieceEffects, "./public-showcase-core.ts": showcase,
  };
  const metadata = runInNewContext(`${metadataCode}\nexports`, {
    exports: {}, Date, require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected metadata dependency: ${name}`);
      return dependencies[name];
    },
  }) as typeof import("./gallery-metadata.ts");
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  t.after(async () => { await client.close(); await server.stop(); });
  for (const outcome of ["sale", "keep", "buyout", "missing-artwork", "buyout-missing-artwork", "buyout-hydration-failure", "forgery", "known-forgery",
    "promoted", "permanent", "promoted-buyout", "permanent-buyout"]) {
    await t.test(outcome, async () => {
      const database = client.db(`promoted-collector-${outcome}`);
      const player = { _id: "player", active: true, screen_name: "Player",
        profile: { bank_balance: 1_000, level: 1, xp: 0, display_cap: 5 } };
      const protectedWork = outcome.startsWith("promoted") || outcome.startsWith("permanent");
      const promoted = {
        ...item, _id: "work", artwork_id: "art", owner: player._id,
        status: outcome.startsWith("promoted") ? "displayed" : "claimed",
        original: false, permanent: outcome.startsWith("permanent"), tags: ["for sale"],
        attributes: { locked: [], unlocked: [], special: [] },
        authenticity: { forgery: outcome.includes("forgery"), identified: outcome === "known-forgery", forgery_quality: 0.5 },
      };
      await database.collection<{ _id: string }>("players").insertOne(player);
      await database.collection<{ _id: string }>("items").insertOne(promoted);
      await database.collection<{ _id: string }>("artworks").insertOne({ _id: "art", rarity: "common" });
      await metadata.refreshGalleryMetadata(database, player._id);
      const galleryBefore = await database.collection("galleries").findOne({ owner_id: player._id });
      const noop = async () => {};
      const math = Object.create(Math);
      math.random = () => 0;
      const meet = runInNewContext(`${code}\nmeetCollector`, {
        database, player, ownGallery: true, now: new Date(), Math: math,
        npc: { _id: "collector", attribute_id: "collector", npc_name: "Collector", quality: "platinum" },
        ART_COLLECTOR_ATTRIBUTE_ID: "collector",
        NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
        console: { error: noop },
        MASTERPIECE_EFFECT_CODES: masterpieceEffects.MASTERPIECE_EFFECT_CODES,
        getDisplayedLegendaryEffect: async (_db: unknown, _id: unknown, code: string) =>
          outcome === "keep" && code === "COLLECTOR_DOES_NOT_COLLECT" ? { parameters: { keep_chance: 1 } } : null,
        getDisplayedArtworkEffect: async () => outcome.includes("buyout") ? { parameters: { chance: 1 } } : null,
        getLegendaryNumberParameter, rollEffectChance: Boolean,
        getItemDisposalFilter,
        calculateCollectorReward, getCollectorAuctionCommissionCoefficient,
        getCollectorForgeryHeat: () => 1,
        shouldDestroyDetectedForgery: (work: typeof promoted) => work.authenticity.identified,
        punishForgeryQuality: (quality: number) => quality * 0.5,
        hydrateGameItems: async (_db: unknown, items: typeof promoted[]) => {
          if (outcome === "buyout-hydration-failure") throw new Error("Hydration failed");
          return outcome.includes("missing-artwork") ? [] :
            items.map(work => ({ ...work, artwork: { title: "Work", rarity: "common" } }));
        },
        transferIfHallOfFameItem: async () => false,
        sanitizePlayerFacingAuthenticity: (work: unknown) => work,
        deleteCommunityReactions: noop, rewardUndetectedForgeryExit: noop,
        notifyForgeryDetection: noop, recordEconomyMetricsSafely: noop,
        getXpChunk: () => 100,
        getNpcInteractionRollbackUpdate: () => ({ $inc: { "profile.social_battery": 0 } }),
        socialBatteryCost: 1,
        refreshGalleryMetadata: metadata.refreshGalleryMetadata,
      }) as () => Promise<Response>;
      const response = await meet();
      assert.equal(response.status, ["missing-artwork", "buyout-hydration-failure"].includes(outcome) ? 500 : 200);
      const kept = protectedWork ||
        ["keep", "missing-artwork", "buyout-missing-artwork", "buyout-hydration-failure", "forgery"].includes(outcome);
      const saved = await database.collection("items").findOne({ _id: "work" });
      assert.equal(saved?.status ?? null, kept ? promoted.status : null);
      if (protectedWork) {
        assert.deepEqual(saved, promoted);
        assert.equal((await database.collection("players").findOne({ _id: player._id }))?.profile.bank_balance, 1_000);
      }
      const gallery = await database.collection("galleries").findOne({ owner_id: player._id });
      assert.equal(gallery?.item_count, protectedWork ? 1 : 0);
      assert.deepEqual(gallery, galleryBefore);
    });
  }
});

test("collector rewards preserve quality, own-gallery, and additive bonuses", () => {
  assert.deepEqual(
    calculateCollectorReward({
      item,
      quality: "bronze",
      ownGallery: false,
      goodConditionBonus: false,
      rollCountBonus: false,
      xpOffer: false,
      xpChunk: 100,
    }),
    { amount: 14_000, type: "money", multiplier: 1.4 },
  );
  const ownGallery = calculateCollectorReward({
    item,
    quality: "platinum",
    ownGallery: true,
    goodConditionBonus: true,
    rollCountBonus: true,
    xpOffer: false,
    xpChunk: 100,
  });
  assert.equal(ownGallery.multiplier, 3.27);
  assert.equal(ownGallery.amount, 32_700);
});

test("collector XP rewards use the legacy level-based chunk percentage", () => {
  const reward = calculateCollectorReward({
    item,
    quality: "bronze",
    ownGallery: false,
    goodConditionBonus: false,
    rollCountBonus: false,
    xpOffer: true,
    xpChunk: 1_000,
  });
  assert.equal(reward.amount, 279);
});

test("collector quest target multipliers apply to the complete reward", () => {
  const reward = calculateCollectorReward({
    item,
    quality: "bronze",
    ownGallery: false,
    goodConditionBonus: true,
    rollCountBonus: true,
    rewardMultiplier: 2,
    xpOffer: false,
    xpChunk: 100,
  });
  assert.equal(reward.amount, 36_000);
  assert.equal(reward.type, "money");
  assert.ok(Math.abs(reward.multiplier - 3.6) < Number.EPSILON * 4);
});

test("collector auction behavior uses configurable chance and commission", () => {
  const effect = {
    active: true,
    code: "ART_COLLECTOR_AUCTION",
    parameters: {
      chance: 0.2,
      commission_coefficient: 0.15,
    },
  } as LegendaryAttribute;
  assert.equal(
    getCollectorAuctionCommissionCoefficient(effect, () => 0.19),
    0.15,
  );
  assert.equal(
    getCollectorAuctionCommissionCoefficient(effect, () => 0.2),
    null,
  );
  assert.equal(getCollectorAuctionCommissionCoefficient(null), null);
});

test("collector forgery heat preserves the legendary reduction", () => {
  const forgedItem = {
    mint: false,
    foil: false,
    unlocked: false,
    seasonal: false,
    vintage: false,
    lottery: 0,
    level: 1,
    authenticity: { forgery_quality: 0.5, identified: false },
    artwork: { rarity: "common" as const },
  };
  assert.equal(getCollectorForgeryHeat(forgedItem, false), 0.118);
  assert.equal(getCollectorForgeryHeat(forgedItem, true), 0.095);
});

test("maximum Collector quality steps down as meeting caps are exhausted", () => {
  assert.equal(getHighestAvailableCollectorQuality({}), "platinum");
  assert.equal(
    getHighestAvailableCollectorQuality({ platinum: 60 }),
    "gold",
  );
  assert.equal(
    getHighestAvailableCollectorQuality({
      platinum: 60,
      gold: 80,
      silver: 100,
    }),
    "bronze",
  );
  assert.equal(
    getHighestAvailableCollectorQuality({
      platinum: 60,
      gold: 80,
      silver: 100,
      bronze: 120,
    }),
    null,
  );
});

test("maximum Collector quality accepts configured meeting caps", () => {
  assert.equal(
    getHighestAvailableCollectorQuality(
      { platinum: 2 },
      { bronze: 4, silver: 3, gold: 2, platinum: 2 },
    ),
    "gold",
  );
});
