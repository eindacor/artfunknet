import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import ts from "typescript";

import type { GameItem } from "./gameplay.ts";
import * as archiveGameplay from "./archive-gameplay.ts";
import * as permissions from "./item-permissions.ts";
import * as inventoryCapacity from "./inventory-capacity.ts";

type Route = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
type Acquisition = { acquireForDisposal: (db: Db, item: GameItem) => Promise<GameItem> };

async function load<T>(path: string, dependencies: Record<string, unknown>): Promise<T> {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(`${code}\nexports`, {
    exports: {}, console, Date,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }) as T;
}

function offer(status: GameItem["status"] = "for_sale"): GameItem {
  return {
    _id: "offer", artwork_id: "art", owner: "player", status,
    condition: 1, mint: false, mint_value_multiplier: 1,
    foil: true, unlocked: false, seasonal: false, lottery: 0,
    vintage: false, original: false, permanent: false, repairing: false,
    level: 1, attributes: { locked: [], unlocked: [], special: [] },
    authenticity: { forgery: false, identified: false },
    values: { actual: 200, dealer: 100, sell: 50, purchase: 100, auction_min: 100, collector: 100 },
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  } as GameItem;
}

async function seed(db: Db, item = offer(), bankBalance = 500) {
  await db.collection<{ _id: string }>("players").insertOne({
    _id: "player", active: true, screen_name: "Test", profile: {
      inventory_cap: 1, expansion_slots: 0, bank_balance: bankBalance, karma: 0,
      playthrough_stats: { items_collected: 0, money_spent: 0 },
    },
  });
  await db.collection<GameItem>("items").insertMany([
    { ...offer("claimed"), _id: "keeper", artwork_id: "kept" }, item,
  ]);
  await db.collection<{ _id: string }>("quests").insertOne({
    _id: "quest", owner_id: "player", target: ["art"], fulfilled_targets: [],
    reward: { money: 100 },
  });
}

async function routes(db: Db) {
  const noop = async () => {};
  const hof = {
    checkItemForHallOfFameStatus: noop, transferIfHallOfFameItem: async () => false,
    restoreTransferredHallOfFameItem: noop,
  };
  const expiry = await load<{
    getUnexpiredItemFilter: (now: Date) => unknown;
  }>("./item-expiration.ts", { "./hall-of-fame.ts": hof });
  const effects = {
    getDisplayedLegendaryEffect: async (_db: Db, _id: string, code: string) =>
      code === "DEALER_DISCOUNT" ? { parameters: { cost_multiplier: 0.5 } }
        : code === "DEALER_PURCHASE_ROLL_COUNT_SET" ? { parameters: { roll_count: -20 } } : null,
    getLegendaryNumberParameter: (effect: { parameters: Record<string, number> } | null, key: string, fallback: number) =>
      effect?.parameters[key] ?? fallback,
  };
  const metrics = { recordEconomyMetricsSafely: noop };
  const acquisition = await load<Acquisition>("./acquire-for-disposal.ts", {
    "./item-expiration.ts": expiry, "./legendary-attributes.ts": effects,
    "./economy-metrics.ts": metrics, "./hall-of-fame.ts": hof,
  });
  const dependencies = {
    "node:crypto": { randomUUID },
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/server/player-api": { requirePlayerApi: async () => ({ ok: true, session: { playerId: "player" } }) },
    "@/server/mongodb": { getDatabase: async () => db },
    "@/server/acquire-for-disposal": acquisition,
    "@/server/inventory-capacity": inventoryCapacity,
    "@/server/legendary-attributes": effects,
    "@/server/economy-metrics": metrics,
    "@/server/hall-of-fame": hof,
    "@/server/item-expiration": { ...expiry, removeExpiredTransientItems: noop },
    "@/server/community-reaction-cleanup": { deleteCommunityReactions: noop },
    "@/server/item-artwork": { hydrateGameItems: async (_db: Db, items: GameItem[]) =>
      items.map((item) => ({ ...item, artwork: { title: "Test", rarity: "common" } })) },
    "@/server/art-expert-gameplay": { calculateDonationKarma: () => 7, getItemKarmaValue: () => 0 },
    "@/server/art-historian-gameplay": { isHistorianSpecialItem: () => false },
    "@/server/forgery-gameplay": { transferForgeryLiability: noop, rewardUndetectedForgeryExit: noop },
    "@/server/karma": { ensurePlayerKarma: noop },
    "@/server/artwork-effects": { getDisplayedArtworkEffect: async () => null },
    "@/server/masterpiece-effects": { MASTERPIECE_EFFECT_CODES: { historianArchive: "archive" } },
    "@/server/card-renderer-settings": { getCardRendererCatalog: async () => [] },
    "@/components/item-cards/catalog": { getCardStyleInventory: () => ({}) },
    "@/server/gallery-metadata": { refreshGalleryMetadata: noop },
    "@/server/item-permissions": permissions,
    "@/server/archive-gameplay": archiveGameplay,
    "@/server/archive-storage": {
      ensureArchiveStorage: noop,
      addItemToArchiveRecord: async (_db: Db, item: GameItem) => {
        await db.collection("exit_archive_records").insertOne({ item_id: item._id });
        return true;
      },
    },
  };
  const route = async (name: string) =>
    (await load<{ POST: Route }>(`../app/api/play/items/[id]/${name}/route.ts`, dependencies)).POST;
  return {
    acquisition,
    donate: await route("donate"), historian: await route("send-to-historian"),
    archive: await route("archive"), purchase: await route("purchase"),
    setForSale: await route("purchase-and-set-for-sale"),
  };
}

function invoke(route: Route, questId = "quest") {
  return route(new Request("http://localhost", {
    method: "POST", body: JSON.stringify({ questId }),
  }), { params: Promise.resolve({ id: "offer" }) });
}

test("direct disposal can acquire offers with a full inventory without bypassing ordinary purchase limits", async (t) => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  t.after(async () => { await client.close(); await server.stop(); });
  await client.connect();

  for (const action of ["donate", "historian", "archive"] as const) {
    await t.test(`purchase and ${action} succeeds with no free slots`, async () => {
      const db = client.db(`full-${action}`);
      await seed(db);
      const api = await routes(db);
      const response = await invoke(api[action]);
      assert.equal(response.status, 200, JSON.stringify(await response.json()));
      assert.equal(await db.collection<GameItem>("items").findOne({ _id: "offer" }), null);
      assert.equal(await db.collection("items").countDocuments({ status: "claimed" }), 1);
      const player = await db.collection<{ _id: string; profile: {
        bank_balance: number; karma: number; playthrough_stats: { items_collected: number; money_spent: number };
      } }>("players").findOne({ _id: "player" });
      assert.equal(player?.profile.bank_balance, 450);
      assert.equal(player?.profile.playthrough_stats.items_collected, 1);
      assert.equal(player?.profile.playthrough_stats.money_spent, 50);
      if (action === "donate") assert.equal(player?.profile.karma, 7);
      if (action === "historian") {
        const quest = await db.collection<{ _id: string; fulfilled_targets: { item_snapshot: GameItem }[] }>("quests")
          .findOne({ _id: "quest" });
        assert.equal(quest?.fulfilled_targets[0].item_snapshot.roll_count, -20);
      }
    });
  }
  await t.test("ordinary purchase and purchase/set-for-sale still reject full inventory", async () => {
    const db = client.db("ordinary-capacity");
    await seed(db);
    const api = await routes(db);
    assert.equal((await invoke(api.purchase)).status, 409);
    assert.equal((await invoke(api.setForSale)).status, 409);
    assert.equal((await db.collection<GameItem>("items").findOne({ _id: "offer" }))?.status, "for_sale");
  });
  await t.test("unclaimed Historian targets require neither space nor money", async () => {
    const db = client.db("unclaimed-historian");
    await seed(db, offer("unclaimed"), -10);
    const api = await routes(db);
    assert.equal((await invoke(api.historian)).status, 200);
    assert.equal(await db.collection<GameItem>("items").findOne({ _id: "offer" }), null);
  });
  await t.test("invalid quests and unaffordable donations do not acquire an offer", async () => {
    const db = client.db("invalid-disposal");
    await seed(db, offer(), 49);
    const api = await routes(db);
    assert.equal((await invoke(api.historian, "missing")).status, 409);
    assert.equal((await invoke(api.donate)).status, 409);
    assert.equal((await db.collection<GameItem>("items").findOne({ _id: "offer" }))?.status, "for_sale");
    const player = await db.collection<{ _id: string; profile: { bank_balance: number } }>("players")
      .findOne({ _id: "player" });
    assert.equal(player?.profile.bank_balance, 49);
  });
  await t.test("expired and competing acquisitions refund unsuccessful charges", async () => {
    const db = client.db("disposal-races");
    const expired = { ...offer(), expires_at: new Date(0).toISOString() };
    await seed(db, expired);
    const { acquisition } = await routes(db);
    await assert.rejects(acquisition.acquireForDisposal(db, expired), /expired/);
    await db.collection<GameItem>("items").replaceOne({ _id: "offer" }, offer());
    const results = await Promise.allSettled([
      acquisition.acquireForDisposal(db, offer()), acquisition.acquireForDisposal(db, offer()),
    ]);
    assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
    const player = await db.collection<{ _id: string; profile: {
      bank_balance: number; playthrough_stats: { items_collected: number; money_spent: number };
    } }>("players").findOne({ _id: "player" });
    assert.equal(player?.profile.bank_balance, 450);
    assert.equal(player?.profile.playthrough_stats.items_collected, 1);
    assert.equal(player?.profile.playthrough_stats.money_spent, 50);
  });
});
