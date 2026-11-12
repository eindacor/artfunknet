import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import { returnAuctionForgery } from "./auction-forgery-return.ts";
import { createAuction, createCollectorResaleAuction } from "./auction-gameplay.ts";
import { getBulkDisposalPermission, processBulkForgeries } from "./bulk-sale.ts";
import { settleGalleryEarnings } from "./collection-gameplay.ts";
import {
  DEFAULT_ACTUAL_GAMEPLAY_CONFIG as config,
  getGameplaySettings,
  toStoredGameplayConfig,
} from "./game-settings.ts";
import type { GameItem } from "./gameplay.ts";
import type { HydratedGameItem } from "./item-artwork.ts";
import type { PlayerNotification } from "./player-notifications.ts";
import { setupTestDb } from "./test-utils/db-setup.ts";
import * as forgeryRules from "./forgery-gameplay.ts";
import * as itemPermissions from "./item-permissions.ts";

const now = new Date("2026-09-04T12:05:00.000Z");

function forgery(): GameItem {
  return {
    _id: "forgery", artwork_id: "art", owner: "buyer", status: "claimed",
    tags: ["keep"], date_received: "2026-09-04T12:00:00.000Z",
    authenticity: {
      forgery: true, identified: true, liable: "seller", original_owner: "forger",
      forgery_quality: 0.5, liability_pending: true, fee: 1_000,
    },
    transaction_history: [{
      type: "auction", from_owner: "seller", to_owner: "buyer",
      occurred_at: "2026-09-04T12:00:00.000Z", source: "auction house", amount: 1_000,
    }],
  } as GameItem;
}

async function seed(db: Db, item = forgery()) {
  await db.collection<GameItem>("items").insertOne(item);
  await db.collection<{ _id: string }>("players").insertMany([
    { _id: "buyer", active: true, profile: { bank_balance: 100, xp: 20 } },
    { _id: "seller", active: true, profile: { bank_balance: 50, xp: 30 } },
  ]);
}

async function itemRoute(action: string, db: Db) {
  const source = await readFile(new URL(`../app/api/play/items/[id]/${action}/route.ts`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/server/player-api": { requirePlayerApi: async () => ({ ok: true, session: { playerId: "buyer" } }) },
    "@/server/mongodb": { getDatabase: async () => db },
    "@/server/forgery-gameplay": { ...forgeryRules, rollForgeryDetected: () => true },
    "@/server/item-permissions": itemPermissions,
    "@/server/bulk-sale": { getBulkDisposalPermission },
    "@/server/economy-metrics": { recordEconomyMetricsSafely: async () => {} },
    "@/server/game-settings": { getGameplaySettings },
    "@/server/item-artwork": { hydrateGameItems: async (_db: Db, items: GameItem[]) => items.map((item) => ({
      ...item, artwork: { rarity: "common", title: "Test forgery" },
    })) },
    "@/server/offer-reveal": { canQuickSellItem: () => true },
    "@/server/item-expiration": { removeExpiredTransientItems: async () => {} },
    "@/server/community-reaction-cleanup": {},
    "@/server/hall-of-fame": {},
    "@/server/legendary-attributes": {},
    "@/server/quest-item-sell": {},
    "@/server/gallery-metadata": { refreshGalleryMetadata: async () => {} },
  };
  return runInNewContext(`${code}\nexports.POST`, {
    exports: {}, console, Date,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected route dependency: ${name}`);
      return dependencies[name];
    },
  }) as (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
}

async function settlementWithPermission(permission: unknown) {
  const source = await readFile(new URL("./auction-forgery-return.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dependencies: Record<string, unknown> = {
    "node:crypto": { randomUUID: () => "test-return-operation" },
    "./forgery-gameplay.ts": { ...forgeryRules, getForgeryReturnPermission: () => permission },
    "./economy-metrics.ts": { recordEconomyMetricsSafely: async () => {} },
    "./player-notifications.ts": { createPlayerNotification: async () => {} },
  };
  return runInNewContext(`${code}\nexports.returnAuctionForgery`, {
    exports: {}, console, Date,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected settlement dependency: ${name}`);
      return dependencies[name];
    },
  }) as typeof returnAuctionForgery;
}

async function adminBalanceRoute(db: Db) {
  const source = await readFile(new URL("../app/api/admin/test-accounts/[id]/balance/route.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/server/admin-api": { requireAdminApi: async () => ({ ok: true, session: { email: "test-admin" } }) },
    "@/server/mongodb": { getDatabase: async () => db },
  };
  return runInNewContext(`${code}\nexports.PATCH`, {
    exports: {}, Date,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected balance route dependency: ${name}`);
      return dependencies[name];
    },
  }) as (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
}

test("auction forgery returns settle once, compensate failures, and preserve provenance", async (t) => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  t.after(async () => { await client.close(); await server.stop(); });
  await client.connect();

  await t.test("promoted forgeries can be returned without transferring their promotion state", async () => {
    const db = client.db("return-promoted");
    await seed(db, { ...forgery(), status: "displayed", time_displayed: now.toISOString() });
    const result = await returnAuctionForgery(db, "buyer", "forgery", config, now);
    assert.ok(result.ok);
    const saved = await db.collection<GameItem>("items").findOne({ _id: "forgery" });
    assert.equal(saved?.owner, "seller");
    assert.equal(saved?.status, "claimed");
    assert.equal(saved?.time_displayed, undefined);
  });

  await t.test("a stale permission contract cannot corrupt a balance or strand an item", async (t) => {
    const db = client.db("return-stale-permission");
    await seed(db);
    t.mock.method(console, "error", () => {});
    const settle = await settlementWithPermission({ allowed: true });
    const result = await settle(db, "buyer", "forgery", config, now);
    assert.equal(result.ok, false);
    assert.equal((await db.collection("players").findOne({ _id: "seller" }))?.profile.bank_balance, 50);
    assert.equal((await db.collection("players").findOne({ _id: "buyer" }))?.profile.bank_balance, 100);
    const saved = await db.collection<GameItem>("items").findOne({ _id: "forgery" });
    assert.equal(saved?.status, "claimed");
    assert.equal(saved?.forgery_return_operation, undefined);
  });

  await t.test("invalid or inconsistent monetary quotes are rejected before reserving or charging", async () => {
    const invalid = [
      { purchasePrice: undefined }, { purchasePrice: Number.NaN }, { purchasePrice: -1 },
      { purchasePrice: 999 }, { refund: undefined }, { refund: Number.NaN },
      { refund: Number.POSITIVE_INFINITY }, { refund: -1 }, { refund: 1_001 }, { refund: 500 },
    ];
    for (const [index, change] of invalid.entries()) {
      const db = client.db(`return-invalid-quote-${index}`);
      await seed(db);
      const settle = await settlementWithPermission({ allowed: true, purchasePrice: 1_000, refund: 900, ...change });
      assert.equal((await settle(db, "buyer", "forgery", config, now)).ok, false);
      assert.equal((await db.collection("players").findOne({ _id: "seller" }))?.profile.bank_balance, 50);
      assert.equal((await db.collection("players").findOne({ _id: "buyer" }))?.profile.bank_balance, 100);
      const saved = await db.collection<GameItem>("items").findOne({ _id: "forgery" });
      assert.equal(saved?.status, "claimed");
      assert.equal(saved?.forgery_return_operation, undefined);
    }
  });

  await t.test("non-finite, missing, and nonnumeric balances do not propagate through settlement", async (t) => {
    t.mock.method(console, "error", () => {});
    for (const account of ["seller", "buyer"]) {
      for (const [index, value] of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, null, "100", undefined].entries()) {
        const db = client.db(`return-invalid-balance-${account}-${index}`);
        await seed(db);
        const players = db.collection("players");
        await players.updateOne({ _id: account }, value === undefined
          ? { $unset: { "profile.bank_balance": "" } }
          : { $set: { "profile.bank_balance": value } });
        const before = await players.find({}, { projection: { _id: 1, "profile.bank_balance": 1 } }).sort({ _id: 1 }).toArray();
        assert.equal((await returnAuctionForgery(db, "buyer", "forgery", config, now)).ok, false);
        assert.deepEqual(await players.find({}, { projection: { _id: 1, "profile.bank_balance": 1 } }).sort({ _id: 1 }).toArray(), before);
        const saved = await db.collection<GameItem>("items").findOne({ _id: "forgery" });
        assert.equal(saved?.owner, "buyer");
        assert.equal(saved?.status, "claimed");
        assert.equal(saved?.forgery_return_operation, undefined);
      }
    }
  });

  await t.test("refunds and liability charges preserve finite negative balances", async () => {
    const db = client.db("return-negative-balances");
    await seed(db);
    await db.collection("players").updateOne({ _id: "seller" }, { $set: { "profile.bank_balance": -500 } });
    await db.collection("players").updateOne({ _id: "buyer" }, { $set: { "profile.bank_balance": -2_000 } });
    assert.equal((await returnAuctionForgery(db, "buyer", "forgery", config, now)).ok, true);
    assert.equal((await db.collection("players").findOne({ _id: "seller" }))?.profile.bank_balance, -1_500);
    assert.equal((await db.collection("players").findOne({ _id: "buyer" }))?.profile.bank_balance, -1_100);
  });

  await t.test("admin test-account balances accept debt but reject invalid monetary values", async () => {
    const db = client.db("return-admin-negative-balance");
    await seed(db);
    await db.collection("players").updateOne({ _id: "seller" }, { $set: { test_account: true } });
    const patch = await adminBalanceRoute(db);
    for (const balance of [-300_000, 0, 300_000]) {
      const response = await patch(new Request("http://localhost", {
        method: "PATCH", body: JSON.stringify({ balance }),
      }), { params: Promise.resolve({ id: "seller" }) });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).bankBalance, balance);
      assert.equal((await db.collection("players").findOne({ _id: "seller" }))?.profile.bank_balance, balance);
    }
    for (const balance of [Number.MAX_SAFE_INTEGER + 1, 0.5, "-100", null]) {
      const response = await patch(new Request("http://localhost", {
        method: "PATCH", body: JSON.stringify({ balance }),
      }), { params: Promise.resolve({ id: "seller" }) });
      assert.equal(response.status, 400);
      assert.equal((await db.collection("players").findOne({ _id: "seller" }))?.profile.bank_balance, 300_000);
    }
  });

  for (const caught of [false, true]) {
    await t.test(caught ? "caught forgeries still return to the original liable auction seller" : "authenticated forgeries refund 90% and charge the seller 100%", async () => {
      const db = client.db(caught ? "return-caught" : "return-authenticated");
      const item = forgery();
      item.authenticity.identified = false;
      await seed(db, item);
      await db.collection("players").updateOne({ _id: "buyer" }, { $set: { "profile.bank_balance": 1_000 } });
      const identify = await itemRoute(caught ? "sell" : "authenticate", db);
      const response = await identify(new Request("http://localhost"), { params: Promise.resolve({ id: item._id }) });
      assert.equal(response.status, 200);
      assert.equal((await db.collection<GameItem>("items").findOne({ _id: item._id }))?.authenticity.identified, true);
      const notifications = db.collection<PlayerNotification>("player_notifications");
      const detection = await notifications.findOne({ user_id: "buyer", kind: "warning" });
      assert.ok(detection);
      assert.equal(detection.read, false);
      assert.match(detection.message, caught ? /detected the forgery/ : /Authentication confirmed a forgery/);
      assert.deepEqual(await returnAuctionForgery(db, "buyer", item._id, config, now), {
        ok: true, refund: 900, purchasePrice: 1_000,
      });
      const buyer = await db.collection("players").findOne({ _id: "buyer" });
      const seller = await db.collection("players").findOne({ _id: "seller" });
      assert.equal(buyer?.profile.bank_balance, caught ? 1_900 : 1_700);
      assert.equal(seller?.profile.bank_balance, -950);
      assert.equal(buyer?.profile.xp, 20);
      assert.equal(seller?.profile.xp, 30);
      const saved = await db.collection<GameItem>("items").findOne({ _id: item._id });
      assert.equal(saved?.owner, "seller");
      assert.equal(saved?.status, "claimed");
      assert.equal(saved?.authenticity.identified, true);
      assert.equal(saved?.authenticity.liable, "seller");
      assert.equal(saved?.authenticity.liability_pending, false);
      assert.equal(saved?.authenticity.fee, 0);
      assert.equal(saved?.authenticity.forgery_quality, caught ? 0.3 : 0.4);
      assert.deepEqual(saved?.tags, []);
      assert.equal(saved?.transaction_history.at(-1)?.source, "forgery return");
      assert.equal(saved?.transaction_history.at(-1)?.amount, 900);
      assert.equal(saved?.forgery_return_operation, undefined);
      assert.equal((await returnAuctionForgery(db, "buyer", item._id, config, now)).ok, false);
      assert.equal((await returnAuctionForgery(db, "seller", item._id, config, now)).ok, false);
      assert.equal((await db.collection("players").findOne({ _id: "buyer" }))?.profile.bank_balance, caught ? 1_900 : 1_700);
      const returned = await notifications.findOne({ user_id: "buyer", kind: "success" });
      assert.ok(returned);
      assert.match(returned.message, /\$900.*\$1,000/);
      const liable = await notifications.findOne({ user_id: "seller", kind: "warning" });
      assert.ok(liable);
      assert.match(liable.message, /returned to your inventory.*full \$1,000/);
      assert.equal(await notifications.countDocuments(), 3);
    });
  }

  await t.test("genuine authentication and rejected authentication do not emit forgery notices", async () => {
    for (const genuine of [true, false]) {
      const db = client.db(`detection-auth-${genuine ? "genuine" : "unaffordable"}`);
      const item = forgery();
      item.authenticity.identified = false;
      item.authenticity.forgery = !genuine;
      await seed(db, item);
      if (genuine) {
        await db.collection("players").updateOne({ _id: "buyer" }, { $set: { "profile.bank_balance": 1_000 } });
      }
      const authenticate = await itemRoute("authenticate", db);
      const response = await authenticate(new Request("http://localhost"), { params: Promise.resolve({ id: item._id }) });
      assert.equal(response.status, genuine ? 200 : 409);
      assert.equal(await db.collection("player_notifications").countDocuments(), 0);
    }
  });

  for (const action of ["authenticate", "sell"]) {
    await t.test(`a stale ${action} cannot emit a detection notice`, async (t) => {
      const db = client.db(`detection-stale-${action}`);
      const item = forgery();
      item.authenticity.identified = false;
      await seed(db, item);
      await db.collection("players").updateOne({ _id: "buyer" }, { $set: { "profile.bank_balance": 1_000 } });
      const collection = db.collection.bind(db);
      const items = db.collection<GameItem>("items");
      const update = items.updateOne.bind(items);
      t.mock.method(db, "collection", ((name: string) => name === "items" ? items : collection(name)) as Db["collection"]);
      t.mock.method(items, "updateOne", (async (filter, change, options) => {
        if (change.$set?.["authenticity.identified"] === true) {
          await update({ _id: item._id }, { $set: { owner: "another-player" } });
        }
        return update(filter, change, options);
      }) as typeof items.updateOne);
      const identify = await itemRoute(action, db);
      const response = await identify(new Request("http://localhost"), { params: Promise.resolve({ id: item._id }) });
      assert.equal(response.status, 409);
      assert.equal(await db.collection("player_notifications").countDocuments(), 0);
      assert.equal((await collection("players").findOne({ _id: "buyer" }))?.profile.bank_balance, 1_000);
    });
  }

  await t.test("a notification failure cannot undo a successful authentication", async (t) => {
    const db = client.db("detection-notification-failure");
    const item = forgery();
    item.authenticity.identified = false;
    await seed(db, item);
    await db.collection("players").updateOne({ _id: "buyer" }, { $set: { "profile.bank_balance": 1_000 } });
    t.mock.method(console, "error", () => {});
    const collection = db.collection.bind(db);
    const notifications = db.collection("player_notifications");
    t.mock.method(notifications, "insertOne", () => { throw new Error("Injected notification failure"); });
    t.mock.method(db, "collection", ((name: string) => name === "player_notifications" ? notifications : collection(name)) as Db["collection"]);
    const authenticate = await itemRoute("authenticate", db);
    const context = { params: Promise.resolve({ id: item._id }) };
    assert.equal((await authenticate(new Request("http://localhost"), context)).status, 200);
    assert.equal((await collection("items").findOne({ _id: item._id }))?.authenticity.identified, true);
    assert.equal((await authenticate(new Request("http://localhost"), context)).status, 409);
    assert.equal((await collection("players").findOne({ _id: "buyer" }))?.profile.bank_balance, 800);
  });

  for (const context of ["sell", "donate"] as const) {
    await t.test(`bulk ${context} notifies for unknown and destroyed known forgeries, not genuine works`, async (t) => {
      const db = client.db(`detection-bulk-${context}`);
      const unknown = forgery();
      unknown.status = "unclaimed";
      unknown.authenticity.identified = false;
      const known = { ...forgery(), _id: "known", status: "unclaimed" as const };
      const genuine = { ...forgery(), _id: "genuine", status: "unclaimed" as const, authenticity: {
        ...forgery().authenticity, forgery: false,
      } };
      await seed(db, unknown);
      await db.collection<GameItem>("items").insertMany([known, genuine]);
      const items = [unknown, known, genuine];
      const hydrated = items.map((item) => ({
        ...item, artwork: { rarity: "common", title: item._id },
      })) as HydratedGameItem[];
      t.mock.method(Math, "random", () => 0);
      const result = await processBulkForgeries(db, "buyer", items, hydrated, context);
      assert.deepEqual(result.validItems.map((item) => item._id), ["genuine"]);
      const notifications = await db.collection<PlayerNotification>("player_notifications").find({ user_id: "buyer" }).toArray();
      assert.equal(notifications.length, 2);
      assert.ok(notifications.every((notice) => notice.kind === "warning" && !notice.read));
      assert.ok(notifications.some((notice) => /^known:/.test(notice.message) && /destroyed/.test(notice.message)));
      assert.ok(notifications.some((notice) => /^forgery:/.test(notice.message) && /returned to your inventory/.test(notice.message)));
    });
  }

  await t.test("gallery detection notifies the owner once when a forgery is taken off display", async (t) => {
    const db = client.db("detection-gallery");
    await setupTestDb(db, "buyer", {
      artworks: [{ _id: "art", active: true, rarity: "common", value_scale: 0.5, title: "Gallery forgery" }],
    });
    await db.collection("players").updateOne({ _id: "buyer" }, {
      $set: { "profile.last_gallery_payout": new Date(now.getTime() - config.galleryPayoutIntervalMinutes * 60_000).toISOString() },
    });
    const item = {
      ...forgery(), status: "displayed" as const, level: 1, condition: 0.9,
      values: { actual: 1_000, sell: 800, display: 1_000 },
    };
    item.authenticity.identified = false;
    await db.collection<GameItem>("items").insertOne(item);
    t.mock.method(Math, "random", () => 0);
    await settleGalleryEarnings(db, "buyer", config, now);
    await settleGalleryEarnings(db, "buyer", config, now);
    const notice = await db.collection<PlayerNotification>("player_notifications").findOne({ user_id: "buyer" });
    assert.ok(notice);
    assert.equal(notice.kind, "warning");
    assert.match(notice.message, /Gallery visitors detected Gallery forgery.*taken off display/);
    assert.equal(await db.collection("player_notifications").countDocuments(), 1);
    assert.equal((await db.collection<GameItem>("items").findOne({ _id: item._id }))?.status, "claimed");
  });

  await t.test("concurrent returns cannot refund or charge twice", async () => {
    const db = client.db("return-concurrent");
    await seed(db);
    const results = await Promise.all(Array.from({ length: 5 }, () =>
      returnAuctionForgery(db, "buyer", "forgery", config, now),
    ));
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal((await db.collection("players").findOne({ _id: "buyer" }))?.profile.bank_balance, 1_000);
    assert.equal((await db.collection("players").findOne({ _id: "seller" }))?.profile.bank_balance, -950);
    assert.deepEqual(
      (await db.collection<PlayerNotification>("player_notifications").find().toArray()).map((notice) => notice.user_id).sort(),
      ["buyer", "seller"],
    );
  });

  for (const coefficient of [0, 0.5, 1]) {
    await t.test(`configured refund coefficient ${coefficient} is honored`, async () => {
      const db = client.db(`return-coefficient-${coefficient * 100}`);
      await seed(db);
      const result = await returnAuctionForgery(db, "buyer", "forgery", {
        ...config, forgeryReturnRefundCoefficient: coefficient,
      }, now);
      assert.ok(result.ok);
      assert.equal(result.refund, Math.floor(1_000 * coefficient));
      assert.equal((await db.collection("players").findOne({ _id: "seller" }))?.profile.bank_balance, -950);
    });
  }

  await t.test("rejected returns do not move funds or ownership", async () => {
    const db = client.db("return-rejected");
    await seed(db);
    assert.equal((await returnAuctionForgery(db, "stranger", "forgery", config, now)).ok, false);
    assert.equal((await returnAuctionForgery(db, "buyer", "forgery", config, new Date("2026-09-04T12:10:00.000Z"))).ok, false);
    await db.collection<GameItem>("items").updateOne({ _id: "forgery" }, { $set: { "authenticity.identified": false } });
    assert.equal((await returnAuctionForgery(db, "buyer", "forgery", config, now)).ok, false);
    assert.equal((await db.collection("players").findOne({ _id: "buyer" }))?.profile.bank_balance, 100);
    assert.equal((await db.collection("players").findOne({ _id: "seller" }))?.profile.bank_balance, 50);
    assert.equal((await db.collection<GameItem>("items").findOne({ _id: "forgery" }))?.owner, "buyer");
    assert.equal(await db.collection("player_notifications").countDocuments(), 0);
  });

  for (const failure of ["missing-seller", "inactive-buyer", "transfer"]) {
    await t.test(`${failure} failure restores balances and the buyer's item`, async (t) => {
      const db = client.db(`return-failure-${failure}`);
      await seed(db);
      t.mock.method(console, "error", () => {});
      if (failure === "missing-seller") await db.collection("players").deleteOne({ _id: "seller" });
      if (failure === "inactive-buyer") await db.collection("players").updateOne({ _id: "buyer" }, { $set: { active: false } });
      if (failure === "transfer") {
        const collection = db.collection.bind(db);
        const items = db.collection<GameItem>("items");
        const update = items.updateOne.bind(items);
        t.mock.method(db, "collection", ((name: string) => name === "items" ? items : collection(name)) as Db["collection"]);
        t.mock.method(items, "updateOne", ((filter, change, options) => {
          if (change.$set?.owner === "seller") throw new Error("Injected transfer failure");
          return update(filter, change, options);
        }) as typeof items.updateOne);
      }
      const result = await returnAuctionForgery(db, "buyer", "forgery", config, now);
      assert.equal(result.ok, false);
      assert.equal((await db.collection("players").findOne({ _id: "buyer" }))?.profile.bank_balance, 100);
      if (failure !== "missing-seller") {
        assert.equal((await db.collection("players").findOne({ _id: "seller" }))?.profile.bank_balance, 50);
      }
      const saved = await db.collection<GameItem>("items").findOne({ _id: "forgery" });
      assert.equal(saved?.owner, "buyer");
      assert.equal(saved?.status, "claimed");
      assert.equal(saved?.forgery_return_operation, undefined);
      assert.equal(saved?.transaction_history.length, 1);
      assert.equal(await db.collection("player_notifications").countDocuments(), 0);
    });
  }

  await t.test("a stale purchase snapshot cannot reserve an item after ownership changes", async (t) => {
    const db = client.db("return-stale");
    await seed(db);
    const collection = db.collection.bind(db);
    const items = db.collection<GameItem>("items");
    const update = items.updateOne.bind(items);
    t.mock.method(db, "collection", ((name: string) => name === "items" ? items : collection(name)) as Db["collection"]);
    t.mock.method(items, "updateOne", (async (filter, change, options) => {
      if (change.$set?.status === "forgery_return_pending") {
        await update({ _id: "forgery" }, { $set: { owner: "another-player" } });
      }
      return update(filter, change, options);
    }) as typeof items.updateOne);
    const result = await returnAuctionForgery(db, "buyer", "forgery", config, now);
    assert.equal(result.ok, false);
    assert.equal((await db.collection("players").findOne({ _id: "buyer" }))?.profile.bank_balance, 100);
    assert.equal((await db.collection("players").findOne({ _id: "seller" }))?.profile.bank_balance, 50);
  });

  for (const failedRecipient of ["buyer", "seller"]) {
    await t.test(`${failedRecipient} notification failure does not suppress the other notice or undo a return`, async (t) => {
      const db = client.db(`return-notification-failure-${failedRecipient}`);
      await seed(db);
      t.mock.method(console, "error", () => {});
      const collection = db.collection.bind(db);
      const notifications = db.collection("player_notifications");
      const insert = notifications.insertOne.bind(notifications);
      t.mock.method(notifications, "insertOne", ((document, options) => {
        if (document.user_id === failedRecipient) throw new Error("Injected notification failure");
        return insert(document, options);
      }) as typeof notifications.insertOne);
      t.mock.method(db, "collection", ((name: string) => name === "player_notifications" ? notifications : collection(name)) as Db["collection"]);
      assert.equal((await returnAuctionForgery(db, "buyer", "forgery", config, now)).ok, true);
      assert.equal((await returnAuctionForgery(db, "buyer", "forgery", config, now)).ok, false);
      assert.equal((await db.collection("players").findOne({ _id: "buyer" }))?.profile.bank_balance, 1_000);
      const saved = await collection("player_notifications").find().toArray();
      assert.equal(saved.length, 1);
      assert.equal(saved[0]?.user_id, failedRecipient === "buyer" ? "seller" : "buyer");
    });
  }

  await t.test("existing settings receive defaults, and actual/debug overrides remain independent", async () => {
    const db = client.db("return-settings");
    const defaults = await getGameplaySettings(db);
    assert.equal(defaults.actual.forgeryReturnWindowMinutes, 10);
    assert.equal(defaults.actual.forgeryReturnRefundCoefficient, 0.9);
    assert.equal(defaults.debug.forgeryReturnWindowMinutes, 10);
    assert.equal(defaults.debug.forgeryReturnRefundCoefficient, 0.9);
    await db.collection<{ _id: string }>("metadata").insertOne({
      _id: "gameplay-settings",
      gameplay: { debug_enabled: true, configs: {
        actual: toStoredGameplayConfig({ ...config, forgeryReturnWindowMinutes: 20 }),
        debug: toStoredGameplayConfig({ ...config, forgeryReturnRefundCoefficient: 0.5 }),
      } },
    });
    const saved = await getGameplaySettings(db);
    assert.equal(saved.actual.forgeryReturnWindowMinutes, 20);
    assert.equal(saved.active.forgeryReturnWindowMinutes, 10);
    assert.equal(saved.active.forgeryReturnRefundCoefficient, 0.5);
  });

  await t.test("player/admin forgeries cannot enter system auctions or collector resales", async () => {
    const db = client.db("return-system-forgeries");
    const item = { ...forgery(), status: "collector_pending" as const, artwork: { rarity: "common" } } as HydratedGameItem;
    await seed(db, item);
    await assert.rejects(createAuction(db, item, {
      sellerId: null, sellerName: "Auction House", startingBid: 100,
      buyNow: null, durationMinutes: 60,
    }), /System auctions cannot sell forgeries/);
    await assert.rejects(createCollectorResaleAuction(db, item, {
      playerId: "buyer", collectorReward: 100, commissionCoefficient: 0.1,
    }), /Collectors cannot consign forgeries/);
    assert.equal((await db.collection<GameItem>("items").findOne({ _id: "forgery" }))?.owner, "buyer");
    assert.equal(await db.collection("auctions").countDocuments(), 0);
  });
});
