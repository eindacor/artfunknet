import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { Collection, MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import ts from "typescript";

import * as collectionGameplay from "./collection-gameplay.ts";
import * as communityCleanup from "./community-reaction-cleanup.ts";
import * as settingsCore from "./game-settings.ts";
import * as gameplay from "./gameplay.ts";
import * as itemDropChance from "./item-drop-chance.ts";
import * as playerAccount from "./player-account.ts";
import * as snapshots from "./playthrough-snapshots.ts";
import * as startingInventory from "./starting-inventory.ts";
import * as supporterStatus from "./supporter-status.ts";
import * as vintage from "./vintage-gameplay.ts";
import { setupTestDb, STARTING_INVENTORY_TEST_OPTIONS } from "./test-utils/db-setup.ts";

const require = createRequire(import.meta.url);
const { NextResponse } = require("next/server");
type Route = { POST: (request: Request) => Promise<Response> };

async function loadRoute(relative: string, dependencies: Record<string, unknown>) {
  const source = await readFile(new URL(relative, import.meta.url), "utf8");
  return runInNewContext(`${ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText}\nexports`, {
    exports: {}, Date, console: { error() {} },
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }) as Route;
}

async function assertStartingInventory(database: Db, playerId: string) {
  const items = await database.collection<gameplay.GameItem>("items")
    .find({ owner: playerId, source: "starting inventory" }).toArray();
  assert.equal(items.length, 6);
  const artworks = await database.collection<gameplay.Artwork>("artworks").find({}).toArray();
  const rarityById = new Map(artworks.map(artwork => [artwork._id, artwork.rarity]));
  assert.deepEqual(Object.fromEntries(["common", "uncommon", "rare"].map(rarity => [
    rarity, items.filter(item => rarityById.get(item.artwork_id) === rarity).length,
  ])), { common: 4, uncommon: 2, rare: 0 });
  for (const item of items) {
    assert.equal(item.status, "claimed");
    assert.equal(item.level, 1);
    assert.equal(item.vintage, false);
    assert.equal(item.original, false);
    assert.equal(item.expires_at, undefined);
    assert.ok(item.serial_number! > 0);
    assert.ok(item.drop_chance_coefficient! > 0);
    assert.equal(item.original_drop_chance_coefficient, item.drop_chance_coefficient);
    assert.equal(item.transaction_history[0].to_owner, playerId);
  }
  return { items, rarityById };
}

async function vintageRoute(
  database: Db,
  transferIfHallOfFameItem: (database: Db, item: gameplay.GameItem) => Promise<boolean> = async () => false,
) {
  return loadRoute("../app/api/play/vintage/route.ts", {
    "node:crypto": crypto, "next/server": { NextResponse },
    "@/server/collection-gameplay": collectionGameplay,
    "@/server/community-reaction-cleanup": communityCleanup,
    "@/server/gameplay": gameplay, "@/server/game-settings": settingsCore,
    "@/server/item-drop-chance": itemDropChance,
    "@/server/gallery-metadata": { refreshGalleryMetadata: async () => null },
    "@/server/hall-of-fame": { transferIfHallOfFameItem },
    "@/server/mongodb": { getDatabase: async () => database },
    "@/server/player-api": { requirePlayerApi: async () => ({ ok: true, session: { playerId: "owner" } }) },
    "@/server/playthrough-snapshots": snapshots,
    "@/server/starting-inventory": startingInventory,
    "@/server/supporter-status": supporterStatus,
    "@/server/vintage-gameplay": vintage,
  });
}

async function seedEra(database: Db) {
  await setupTestDb(database, "owner", {
    ...STARTING_INVENTORY_TEST_OPTIONS, playerProfile: { level: 50, bankBalance: 987654, xp: 123 },
  });
  const items = await gameplay.generateDailyDrop(database, "owner", 50, {
    source: "previous era", status: "claimed", itemCount: 12,
    generationMap: {
      rarity: { common: 1, uncommon: 0, rare: 0, legendary: 0, masterpiece: 0 },
      foil: 0, mint: 0, unlocked: 0, cardStyle: 0, misprint: 0,
    },
  });
  await database.collection<gameplay.GameItem>("items").updateOne({ _id: items[0]._id }, { $set: { original: true } });
  await database.collection<gameplay.GameItem>("items").updateOne({ _id: items[1]._id }, { $set: { vintage: true } });
  await database.collection<{ _id: string }>("quests").insertOne({ _id: "old-quest", owner_id: "owner" });
  return items;
}

const eraRequest = (items: gameplay.GameItem[]) => new Request("http://localhost/api/play/vintage", {
  method: "POST", body: JSON.stringify({ itemIds: items.slice(2).map(item => item._id) }),
});

test("new players and new eras receive the same randomized six-item starting collection", async t => {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  t.after(async () => { await client.close(); await server.stop(); });

  await t.test("password registration persists the full starting inventory before returning success", async () => {
    const database = client.db("starter-password");
    await setupTestDb(database, null, STARTING_INVENTORY_TEST_OPTIONS);
    const route = await loadRoute("../app/api/auth/player/register/route.ts", {
      "next/server": { NextResponse }, "@/server/mongodb": { getDatabase: async () => database },
      "@/server/password": { validatePassword: () => null, hashPassword: async () => ({ salt: "test", hash: "test" }) },
      "@/server/oauth-identity": { findPlayerByAuthEmail: async () => null },
      "@/server/player-account": playerAccount,
      "@/server/operational-logging": { createOperationId: () => "test", logOperationalError() {}, logOperationalInfo() {} },
      "@/server/session": { createPlayerSessionToken: async () => "test", PLAYER_SESSION_COOKIE: "test", playerSessionCookieOptions: {} },
    });
    const response = await route.POST(new Request("http://localhost/api/auth/player/register", {
      method: "POST", body: JSON.stringify({ email: "new@example.com", screenName: "New-Player", password: "example" }),
    }));
    assert.equal(response.status, 201);
    const player = await database.collection<playerAccount.PlayerAccountRecord>("players").findOne({ email: "new@example.com" });
    assert.equal(player?.profile.level, 0);
    await assertStartingInventory(database, player!._id);
  });

  for (const enabled of [false, true]) {
    await t.test(`starter properties follow normal configured probabilities (${enabled ? "enabled" : "disabled"})`, async t => {
      t.mock.method(Math, "random", () => 0.5);
      const database = client.db(`starter-properties-${enabled}`);
      await setupTestDb(database, null, STARTING_INVENTORY_TEST_OPTIONS);
      const config = {
        ...settingsCore.DEFAULT_ACTUAL_GAMEPLAY_CONFIG,
        foilProbability: Number(enabled), mintProbability: Number(enabled),
        unlockedProbability: Number(enabled), cardRendererProbability: Number(enabled), mintValueMultiplier: 3,
      };
      await database.collection<{ _id: string }>("metadata").insertMany([
        { _id: "gameplay-settings", gameplay: { configs: { actual: settingsCore.toStoredGameplayConfig(config) } } },
        { _id: "card-renderer-settings", active_renderer_ids: ["museum", "postcard"] },
      ]);
      await database.collection<{ _id: string }>("metadata").updateOne({ _id: "loot-data" }, {
        $set: { "loot_data.global_misprint_chance": Number(enabled), "loot_data.seasonal_items.common": ["starter-common"] },
      });
      const player = playerAccount.createPlayerAccountRecord({
        playerId: "owner", email: "new@example.com", screenName: "New-Player", passwordSalt: "", passwordHash: "",
      });
      await playerAccount.insertPlayerAccountRecord(database, player);
      const { items, rarityById } = await assertStartingInventory(database, player._id);
      for (const item of items) {
        const rarity = rarityById.get(item.artwork_id)!;
        const counts = rarity === "common" ? { locked: 0, unlocked: 1 }
          : enabled ? { locked: 0, unlocked: 2 } : { locked: 1, unlocked: 1 };
        assert.equal(item.foil, enabled);
        assert.equal(item.mint, enabled);
        assert.equal(item.mint_value_multiplier, enabled ? 3 : 1);
        assert.equal(item.condition, enabled ? 1 : 0.5);
        assert.equal(item.unlocked, enabled && rarity !== "common");
        assert.equal(item.card_renderer, enabled ? "postcard" : undefined);
        assert.equal(item.misprint, enabled);
        assert.equal(Boolean(item.artwork_overrides?.title), enabled);
        assert.equal(item.seasonal, rarity === "common");
        assert.equal(item.attributes.locked.length, counts.locked);
        assert.equal(item.attributes.unlocked.length, counts.unlocked);
        assert.equal(item.attributes.special.length, rarity === "rare" ? 1 : 0);
        assert.ok(item.attributes.unlocked.every(attribute => attribute.value === 0.5));
      }
    });
  }

  await t.test("a missing rarity rolls back partial starting items and failed account creation", async () => {
    const database = client.db("starter-missing-rarity");
    await setupTestDb(database, null, STARTING_INVENTORY_TEST_OPTIONS);
    await database.collection<gameplay.Artwork>("artworks").updateOne({ _id: "starter-uncommon" }, { $set: { active: false } });
    const player = playerAccount.createPlayerAccountRecord({
      playerId: "failed", email: "failed@example.com", screenName: "Failed-Player", passwordSalt: "", passwordHash: "",
    });
    await assert.rejects(playerAccount.insertPlayerAccountRecord(database, player), /No active artwork/);
    assert.equal(await database.collection("players").countDocuments(), 0);
    assert.equal(await database.collection("items").countDocuments(), 0);
  });

  await t.test("a new era adds six fresh items while retaining originals and vintage works, without repeat grants", async () => {
    const database = client.db("starter-era-success");
    const previous = await seedEra(database);
    const route = await vintageRoute(database);
    const response = await route.POST(eraRequest(previous));
    assert.equal(response.status, 200);
    await assertStartingInventory(database, "owner");
    const retained = await database.collection<gameplay.GameItem>("items")
      .find({ _id: { $in: previous.map(item => item._id) } }).toArray();
    assert.equal(retained.length, 3);
    assert.equal(retained.filter(item => item.original).length, 1);
    assert.equal(retained.filter(item => item.vintage).length, 2);
    const player = await database.collection<{ _id: string; profile: Record<string, unknown> }>("players").findOne({ _id: "owner" });
    assert.equal(player?.profile.level, 0);
    assert.equal(player?.profile.bank_balance, vintage.VINTAGE_STARTING_BALANCE);
    assert.equal(await database.collection("quests").countDocuments(), 0);
    assert.equal(await database.collection("playthrough_snapshots").countDocuments(), 1);
    assert.equal((await route.POST(eraRequest(previous))).status, 409);
    assert.equal(await database.collection("items").countDocuments(), 9);
  });

  for (const failure of ["generation", "profile reset"]) {
    await t.test(`an era ${failure} failure restores the old collection and removes new starting items`, async t => {
      const database = client.db(`starter-era-failure-${failure.replaceAll(" ", "-")}`);
      const previous = await seedEra(database);
      const before = await database.collection<gameplay.GameItem>("items").find({}).sort({ _id: 1 }).toArray();
      if (failure === "generation") {
        await database.collection<gameplay.Artwork>("artworks").updateOne({ _id: "starter-uncommon" }, { $set: { active: false } });
      } else {
        const updateOne = Collection.prototype.updateOne;
        t.mock.method(Collection.prototype, "updateOne", function (this: Collection, ...args: Parameters<Collection["updateOne"]>) {
          if (this.collectionName === "players" && args[1].$set?.["profile.level"] === 0) {
            return Promise.reject(new Error("Injected profile reset failure"));
          }
          return updateOne.apply(this, args);
        });
      }
      const transfer = t.mock.fn(async () => false);
      assert.equal((await (await vintageRoute(database, transfer)).POST(eraRequest(previous))).status, 500);
      if (failure === "generation") assert.equal(transfer.mock.callCount(), 0, "Generation must succeed before removing or transferring the old collection");
      assert.deepEqual(await database.collection<gameplay.GameItem>("items").find({}).sort({ _id: 1 }).toArray(), before);
      const player = await database.collection<{ _id: string; profile: Record<string, unknown> }>("players").findOne({ _id: "owner" });
      assert.equal(player?.profile.level, 50);
      assert.equal(player?.profile.bank_balance, 987654);
      assert.equal(player?.profile.vintage_operation, undefined);
      assert.equal(await database.collection("quests").countDocuments(), 1);
      assert.equal(await database.collection("playthrough_snapshots").countDocuments(), 0);
    });
  }
});
