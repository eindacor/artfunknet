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
import * as bulkSale from "./bulk-sale.ts";
import * as offerReveal from "./offer-reveal.ts";
import * as itemTags from "./item-tags.ts";
import * as gameplay from "./gameplay.ts";
import * as itemReroll from "./item-reroll.ts";
import * as itemLeveling from "./item-leveling.ts";
import * as itemMint from "./item-mint.ts";
import * as masterpieceEffects from "./masterpiece-effects.ts";
import * as forgeryRules from "./forgery-gameplay.ts";
import * as auctionGameplay from "./auction-gameplay.ts";
import * as galleryCore from "./gallery-metadata-core.ts";
import * as showcase from "./public-showcase-core.ts";
import { setupTestDb } from "./test-utils/db-setup.ts";
import * as gallerySelection from "./gallery-selection.ts";
import * as npcGameplay from "./npc-gameplay.ts";
import * as tutorial from "./tutorial.ts";
import * as tutorialElements from "../shared/tutorial.ts";

type Route = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
type Acquisition = { acquireForDisposal: (db: Db, item: GameItem) => Promise<GameItem> };

async function load<T>(path: string, dependencies: Record<string, unknown>): Promise<T> {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(`${code}\nexports`, {
    exports: {}, console, Date, structuredClone,
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

async function routes(db: Db, overrides: Record<string, unknown> = {}) {
  const noop = async () => {};
  const hof = {
    checkItemForHallOfFameStatus: noop, transferIfHallOfFameItem: async () => false,
    restoreTransferredHallOfFameItem: noop, transferHallOfFameItems: async () => new Set<string>(),
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
    "@/server/forgery-gameplay": { ...forgeryRules, transferForgeryLiability: noop, rewardUndetectedForgeryExit: noop },
    "@/server/karma": { ensurePlayerKarma: noop },
    "@/server/artwork-effects": { getDisplayedArtworkEffect: async () => null, getArtworkEffect: async () => null },
    "@/server/masterpiece-effects": masterpieceEffects,
    "@/server/gameplay": gameplay,
    "@/server/item-reroll": itemReroll,
    "@/server/item-leveling": itemLeveling,
    "@/server/item-mint": itemMint,
    "@/server/item-drop-chance": { getItemDropChanceUpdate: async () => ({}) },
    "@/server/auction-gameplay": { ...auctionGameplay, settleExpiredAuctions: noop },
    "@/server/preservationist-gameplay": { settlePlayerItemRepairs: async () => ({ completedItems: 0, karma: 0 }) },
    "@/server/card-renderer-settings": { getCardRendererCatalog: async () => [] },
    "@/components/item-cards/catalog": { getCardStyleInventory: () => ({}), getCardCosmetic: () => undefined },
    "@/server/gallery-metadata": { refreshGalleryMetadata: noop },
    "@/server/item-permissions": permissions,
    "@/server/gallery-selection": gallerySelection,
    "@/server/npc-gameplay": npcGameplay,
    "@/server/tutorial": tutorial,
    "@/shared/tutorial": tutorialElements,
    "@/server/item-tags": itemTags,
    "@/server/bulk-sale": bulkSale,
    "@/server/game-settings": { getGameplaySettings: async () => ({ active: {
      offerRevealThresholds: offerReveal.DEFAULT_OFFER_REVEAL_THRESHOLDS,
    } }) },
    "@/server/offer-reveal": offerReveal,
    "@/server/quest-item-sell": {
      evaluateQuestItemSellBonus: async () => ({ multiplier: 1 }),
      getActiveQuestTargetIds: async () => new Set<string>(),
    },
    "@/server/bulk-acquisition": await import("./bulk-acquisition.ts"),
    "@/server/bulk-claim": await import("./bulk-claim.ts"),
    "@/server/archive-gameplay": archiveGameplay,
    "@/server/archive-storage": {
      ensureArchiveStorage: noop,
      addItemToArchiveRecord: async (_db: Db, item: GameItem) => {
        await db.collection("exit_archive_records").insertOne({ item_id: item._id });
        return true;
      },
    },
    ...overrides,
  };
  const route = async (name: string) =>
    (await load<{ POST: Route }>(`../app/api/play/items/[id]/${name}/route.ts`, dependencies)).POST;
  return {
    acquisition,
    donate: await route("donate"), historian: await route("send-to-historian"),
    archive: await route("archive"), purchase: await route("purchase"),
    setForSale: await route("purchase-and-set-for-sale"),
    claimForSale: await route("claim-and-set-for-sale"),
    sell: await route("sell"), collector: await route("collector-sale"),
    reroll: await route("reroll"), level: await route("level"),
    authenticate: await route("authenticate"), auction: await route("auction"), repair: await route("repair"),
    display: await route("display"), undisplay: await route("undisplay"),
    cardRenderer: await route("card-renderer"),
    setGallery: (await load<{ POST: (request: Request) => Promise<Response> }>("../app/api/play/items/set-gallery/route.ts", dependencies)).POST,
    tags: (await load<{ PATCH: Route }>("../app/api/play/items/[id]/tags/route.ts", dependencies)).PATCH,
    sellAll: (await load<{ POST: (request: Request) => Promise<Response> }>("../app/api/play/items/sell-all/route.ts", dependencies)).POST,
    donateAll: (await load<{ POST: (request: Request) => Promise<Response> }>("../app/api/play/items/donate-all/route.ts", dependencies)).POST,
    acquireMany: (await load<{ POST: (request: Request) => Promise<Response> }>("../app/api/play/items/acquire-many/route.ts", dependencies)).POST,
    claimAll: (await load<{ POST: (request: Request) => Promise<Response> }>("../app/api/play/items/claim-all/route.ts", dependencies)).POST,
  };
}

function invoke(route: Route, questId = "quest") {
  return route(new Request("http://localhost", {
    method: "POST", body: JSON.stringify({ questId }),
  }), { params: Promise.resolve({ id: "offer" }) });
}

async function promotedGallery(db: Db, overrides: Record<string, unknown> = {}) {
  const artwork: gameplay.Artwork = {
    _id: "art", active: true, rarity: "common", value_scale: 0.5,
    title: "Promoted work", artist: "Artist", artist_id: "artist",
    date: 2026, genre: "Abstract", medium: "Oil", width: 80, height: 100,
  };
  const attribute: gameplay.ItemAttribute = {
    _id: "chosen", title: "Chosen", type: "regular", value: 0.6,
    description: "", icon: "fa-user", npc_name: "Visitor", active: true,
  };
  await setupTestDb(db, "player", {
    playerProfile: { bankBalance: 100_000 }, artworks: [artwork],
    attributes: [attribute, { ...attribute, _id: "replacement", title: "Replacement" }],
  });
  await db.collection("players").updateOne({ _id: "player" }, {
    $set: { screen_name: "Player", "profile.karma": 50_000, "profile.display_cap": 5, "profile.auction_cap": 5 },
  });
  const work = {
    ...offer("displayed"), revealed: true, roll_count: 0, tags: ["favorite"],
    time_displayed: new Date(Date.now() - 60_000).toISOString(),
    authenticity: { ...offer().authenticity, fee: 100 },
    attributes: { locked: [], unlocked: [attribute], special: [] },
  };
  const loot = await db.collection<{ _id: string; loot_data: gameplay.LootData }>("metadata").findOne({ _id: "loot-data" });
  work.values = gameplay.calculateItemValues(work, artwork, loot!.loot_data);
  await db.collection<GameItem>("items").insertOne(work);
  await db.collection<{ _id: string }>("quests").insertOne({
    _id: "quest", owner_id: "player", target: ["art"], fulfilled_targets: [], reward: { money: 100 },
  });
  const metadata = await load<typeof import("./gallery-metadata.ts")>("./gallery-metadata.ts", {
    "server-only": {}, "./gallery-metadata-core": galleryCore,
    "./masterpiece-effects.ts": masterpieceEffects, "./public-showcase-core.ts": showcase,
  });
  await metadata.refreshGalleryMetadata(db, "player");
  return { work, api: await routes(db, { "@/server/gallery-metadata": metadata, ...overrides }) };
}

test("item actions preserve acquisition limits, Original protections and promoted gallery metadata", async (t) => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  t.after(async () => { await client.close(); await server.stop(); });
  await client.connect();

  for (const action of ["display", "setGallery"] as const) {
    await t.test(`${action} preserves existing Collector offerings when promoting artwork`, async () => {
      const db = client.db(`promote-for-sale-${action}`);
      const { api, work } = await promotedGallery(db);
      await db.collection<GameItem>("items").updateOne({ _id: work._id }, {
        $set: { status: "claimed", tags: ["favorite", "for sale"] }, $unset: { time_displayed: "" },
      });
      const request = new Request("http://localhost", { method: "POST", body: JSON.stringify({ itemIds: [work._id] }) });
      const response = action === "display"
        ? await api.display(request, { params: Promise.resolve({ id: work._id }) })
        : await api.setGallery(request);
      assert.equal(response.status, 200);
      assert.deepEqual((await db.collection<GameItem>("items").findOne({ _id: work._id }))?.tags, ["favorite", "for sale"]);
      assert.equal((await db.collection("galleries").findOne({ owner_id: "player" }))?.display_count, 1);
    });
  }
  await t.test("art style changes refresh promoted Mint values in gallery metadata", async () => {
    const db = client.db("promoted-art-style");
    const { api, work } = await promotedGallery(db, {
      "@/components/item-cards/catalog": { getCardCosmetic: () => ({ id: "zine" }), getCardStyleInventory: () => ({}) },
      "@/server/item-mint": { getDemintUpdate: async () => ({
        mint: false, mint_value_multiplier: 1, values: { ...offer().values, actual: 321 },
      }) },
    });
    await db.collection<GameItem>("items").updateOne({ _id: work._id }, {
      $set: { mint: true, mint_value_multiplier: 2, card_renderer: "zine" },
    });
    const response = await api.cardRenderer(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ removeStyle: true }),
    }), { params: Promise.resolve({ id: work._id }) });
    assert.equal(response.status, 200);
    const saved = await db.collection<GameItem>("items").findOne({ _id: work._id });
    assert.equal(saved?.status, "displayed");
    assert.equal(saved?.mint, false);
    assert.equal(saved?.card_renderer, undefined);
    assert.equal((await db.collection("galleries").findOne({ owner_id: "player" }))?.value, 321);
  });

  await t.test("claim shortcuts and bulk claims count as collecting offers, but dealer purchases do not", async () => {
    const { TutorialElement: Step } = tutorialElements;
    for (const kind of ["claimForSale", "claimAll", "acquireMany", "dealer"] as const) {
      const db = client.db(`walkthrough-acquire-${kind}`);
      await seed(db, offer(kind === "dealer" ? "for_sale" : "unclaimed"));
      await db.collection("players").updateOne({ _id: "player" }, {
        $set: { "profile.inventory_cap": 3, tutorial: { step: Step.TUTORIAL_CLAIM_ITEM, revision: 6 } },
      });
      const api = await routes(db);
      const response = kind === "claimForSale" ? await invoke(api.claimForSale)
        : kind === "claimAll" ? await api.claimAll(new Request("http://localhost", { method: "POST" }))
          : await api.acquireMany(new Request("http://localhost", {
            method: "POST", body: JSON.stringify({ mode: "selected", itemIds: ["offer"] }),
          }));
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      const saved = await db.collection<{ _id: string; tutorial: tutorialElements.TutorialProgress }>("players")
        .findOne({ _id: "player" });
      assert.equal(saved?.tutorial.step, kind === "dealer" ? Step.TUTORIAL_CLAIM_ITEM : Step.TUTORIAL_DAILY_CRATE);
      if (kind !== "dealer") assert.equal(result.tutorial.step, Step.TUTORIAL_DAILY_CRATE);
    }
  });

  await t.test("reroll tutorial steps advance only for the active successful mode", async () => {
    const db = client.db("walkthrough-reroll");
    const { api, work } = await promotedGallery(db);
    const { TutorialElement: Step } = tutorialElements;
    await db.collection("players").updateOne({ _id: "player" }, {
      $set: { tutorial: { step: Step.TUTORIAL_REROLL_ATTRIBUTE, revision: 10 } },
    });
    const reroll = (mode: string, attributeId: string) => api.reroll(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ mode, attributeId }),
    }), { params: Promise.resolve({ id: work._id }) });
    assert.equal((await (await reroll("value", "chosen")).json()).tutorial.step, Step.TUTORIAL_REROLL_ATTRIBUTE);
    assert.equal((await reroll("attribute", "missing")).status, 409);
    assert.equal((await (await reroll("attribute", "chosen")).json()).tutorial.step, Step.TUTORIAL_REROLL_VALUE);
    assert.equal((await (await reroll("value", "replacement")).json()).tutorial.step, Step.TUTORIAL_SEE_ACTION_INFO);
    assert.equal((await (await reroll("value", "replacement")).json()).tutorial.step, Step.TUTORIAL_SEE_ACTION_INFO);
  });

  for (const action of ["sell", "donate", "historian", "archive", "collector", "authenticate", "reroll", "level", "auction", "repair"] as const) {
    await t.test(`promoted artwork enforces ${action} permissions without stale gallery metadata`, async () => {
      const db = client.db(`promoted-${action}`);
      const { api, work } = await promotedGallery(db);
      const body = action === "reroll" ? { mode: "attribute", attributeId: "chosen" }
        : action === "auction" ? { startingBid: work.values.auction_min, buyNow: null, durationMinutes: 60 }
          : { questId: "quest" };
      const response = await api[action](new Request("http://localhost", {
        method: "POST", body: JSON.stringify(body),
      }), { params: Promise.resolve({ id: work._id }) });
      const disposalAction = action === "collector" ? "collector-sale" : action;
      const restricted = ["sell", "donate", "historian", "collector", "auction", "repair"].includes(action);
      assert.equal(response.status, restricted ? 409 : 200, JSON.stringify(await response.clone().json()));
      if (restricted && disposalAction !== "repair") {
        assert.equal((await response.json()).error, permissions.getItemDisposalPermission(
          work, disposalAction as permissions.ItemDisposalAction,
        ).reason);
      }
      const saved = await db.collection<GameItem>("items").findOne({ _id: work._id });
      const gallery = await db.collection("galleries").findOne({ owner_id: "player" });
      if (action === "archive") {
        assert.equal(saved?.status ?? null, null);
        assert.equal(gallery?.item_count, 0);
        assert.equal(gallery?.value, 0);
        assert.equal(gallery?.score, 0);
        assert.equal(gallery?.featured_item_id, null);
      } else {
        assert.ok(saved);
        assert.equal(saved.status, "displayed");
        assert.equal(saved.time_displayed, work.time_displayed);
        assert.equal(saved.repairing, false);
        assert.equal(gallery?.item_count, 1);
        assert.equal(gallery?.value, saved.values.actual);
        assert.equal(gallery?.featured_value, saved.values.actual);
        if (action === "reroll") {
          assert.equal(saved.attributes.unlocked[0]._id, "replacement");
          assert.equal(gallery?.attributes[0].id, "replacement");
          assert.equal(gallery?.score, Math.floor(Number(saved.attributes.unlocked[0].value!.toFixed(6)) * 100));
        }
        if (action === "level") assert.equal(saved.level, 2);
        if (action === "authenticate") assert.equal(saved.authenticity.identified, true);
        if (action === "collector") assert.equal(saved.tags.includes("for sale"), false);
        if (action === "auction") assert.equal(await db.collection("auctions").countDocuments({ item_id: work._id }), 0);
      }
    });
  }
  await t.test("eligible auctions still restore inventory and sale tags when creation fails", async () => {
    const db = client.db("eligible-auction-failure");
    const { api, work } = await promotedGallery(db, {
      "@/server/auction-gameplay": {
        ...auctionGameplay, settleExpiredAuctions: async () => {},
        createAuction: async () => { throw new Error("Auction creation failed"); },
      },
    });
    assert.equal((await invoke(api.undisplay)).status, 200);
    await db.collection<GameItem>("items").updateOne({ _id: work._id }, { $addToSet: { tags: "for sale" } });
    const response = await api.auction(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ startingBid: work.values.auction_min, durationMinutes: 60 }),
    }), { params: Promise.resolve({ id: work._id }) });
    assert.equal(response.status, 500);
    const saved = await db.collection<GameItem>("items").findOne({ _id: work._id });
    assert.equal(saved?.status, "claimed");
    assert.equal(saved?.time_displayed, undefined);
    assert.deepEqual(saved?.tags, ["favorite", "for sale"]);
    const gallery = await db.collection("galleries").findOne({ owner_id: "player" });
    assert.equal(gallery?.item_count, 0);
    assert.equal(gallery?.value, 0);
  });

  await t.test("promoted and permanent works reject every destructive endpoint and custom sale tag without side effects", async () => {
    for (const flags of [
      { status: "displayed", permanent: false },
      { status: "claimed", permanent: true },
      { status: "displayed", permanent: true },
    ] as const) {
      const db = client.db(`protected-actions-${flags.status}-${flags.permanent}`);
      const work = { ...offer(flags.status), ...flags, tags: [] };
      await seed(db, work);
      const api = await routes(db);
      const playerBefore = await db.collection("players").findOne({ _id: "player" });
      for (const action of ["sell", "donate", "historian", "auction", "collector"] as const) {
        const body = action === "auction"
          ? { startingBid: work.values.auction_min, durationMinutes: 60 }
          : { questId: "quest", offered: true };
        const response = await api[action](new Request("http://localhost", {
          method: "POST", body: JSON.stringify(body),
        }), { params: Promise.resolve({ id: work._id }) });
        assert.equal(response.status, 409, action);
        assert.equal((await response.json()).error, permissions.getItemDisposalPermission(
          work, action === "collector" ? "collector-sale" : action,
        ).reason, action);
      }
      const tagResponse = await api.tags(new Request("http://localhost", {
        method: "PATCH", body: JSON.stringify({ tags: ["for sale"] }),
      }), { params: Promise.resolve({ id: work._id }) });
      assert.equal(tagResponse.status, 409);
      assert.equal((await tagResponse.json()).error, permissions.getItemDisposalPermission(work, "collector-sale").reason);
      assert.deepEqual(await db.collection<GameItem>("items").findOne({ _id: work._id }), work);
      assert.deepEqual(await db.collection("players").findOne({ _id: "player" }), playerBefore);
      assert.equal(await db.collection("auctions").countDocuments(), 0);
      assert.deepEqual((await db.collection("quests").findOne({ _id: "quest" }))?.fulfilled_targets, []);
      await db.collection<GameItem>("items").updateOne({ _id: work._id }, { $set: { tags: ["for sale"] } });
      assert.equal((await invoke(api.collector)).status, 200);
      assert.deepEqual((await db.collection<GameItem>("items").findOne({ _id: work._id }))?.tags, []);
    }
  });

  await t.test("stopping promotion restores ordinary disposal and sale actions", async () => {
    for (const action of ["sell", "donate", "historian", "auction", "collector"] as const) {
      const db = client.db(`unprotected-${action}`);
      const { api, work } = await promotedGallery(db);
      assert.equal((await invoke(api.undisplay)).status, 200);
      const response = await api[action](new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify(action === "auction"
          ? { startingBid: work.values.auction_min, durationMinutes: 60 }
          : { questId: "quest" }),
      }), { params: Promise.resolve({ id: work._id }) });
      assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    }
  });

  await t.test("Originals cannot be quick sold or donated, including unclaimed loot and dealer offers", async () => {
    for (const status of ["claimed", "displayed", "unclaimed", "for_sale"] as const) {
      const db = client.db(`original-disposal-${status}`);
      const original = { ...offer(status), original: true };
      await seed(db, original);
      const api = await routes(db);
      const playerBefore = await db.collection("players").findOne({ _id: "player" });
      assert.equal((await invoke(api.sell)).status, 409);
      assert.equal((await invoke(api.donate)).status, 409);
      assert.deepEqual(await db.collection<GameItem>("items").findOne({ _id: original._id }), original);
      assert.deepEqual(await db.collection("players").findOne({ _id: "player" }), playerBefore);
      if (status === "claimed") {
        assert.equal((await api.sell(new Request("http://localhost", { method: "POST" }), {
          params: Promise.resolve({ id: "keeper" }),
        })).status, 200);
        assert.equal(await db.collection<GameItem>("items").findOne({ _id: "keeper" }), null);
      }
    }
  });
  await t.test("quick sale and donation recheck Original and gallery protections before removing an item", async () => {
    for (const action of ["sell", "donate"] as const) {
      for (const protection of [{ original: true }, { permanent: true }, { status: "displayed" }] as const) {
        const db = client.db(`protected-before-removal-${action}-${Object.keys(protection)[0]}`);
        const item = offer("claimed");
        await seed(db, item);
        const playerBefore = await db.collection("players").findOne({ _id: "player" });
        const api = await routes(db, {
          "@/server/item-artwork": {
            hydrateGameItems: async (_db: Db, items: GameItem[]) => {
              await db.collection<GameItem>("items").updateOne({ _id: item._id }, { $set: protection });
              return items.map((item) => ({ ...item, artwork: { title: "Test", rarity: "common" } }));
            },
          },
        });
        assert.equal((await invoke(api[action])).status, 409);
        assert.deepEqual(await db.collection<GameItem>("items").findOne({ _id: item._id }), { ...item, ...protection });
        assert.deepEqual(await db.collection("players").findOne({ _id: "player" }), playerBefore);
      }
    }
  });
  await t.test("Originals cannot be offered through Collector toggles or custom tags, but existing offerings can be removed", async () => {
    const db = client.db("original-collector-offerings");
    const original = { ...offer("claimed"), original: true, tags: [] };
    await seed(db, original);
    const api = await routes(db);
    assert.equal((await invoke(api.collector)).status, 409);
    const tags = (value: string[]) => api.tags(new Request("http://localhost", {
      method: "PATCH", body: JSON.stringify({ tags: value }),
    }), { params: Promise.resolve({ id: "offer" }) });
    assert.equal((await tags([" for SALE "])).status, 409);
    assert.equal((await tags(["favorite"])).status, 200);
    await db.collection<GameItem>("items").updateOne({ _id: "offer" }, { $addToSet: { tags: "for sale" } });
    assert.equal((await invoke(api.collector)).status, 200);
    assert.deepEqual((await db.collection<GameItem>("items").findOne({ _id: "offer" }))?.tags, ["favorite"]);
  });
  await t.test("claim and purchase Collector shortcuts reject Originals without charging, while ordinary purchase remains available", async () => {
    for (const status of ["unclaimed", "for_sale"] as const) {
      const db = client.db(`original-collector-acquisition-${status}`);
      const original = { ...offer(status), original: true, tags: [] };
      await seed(db, original);
      const api = await routes(db);
      const playerBefore = await db.collection("players").findOne({ _id: "player" });
      assert.equal((await invoke(status === "unclaimed" ? api.claimForSale : api.setForSale)).status, 409);
      assert.equal((await api.acquireMany(new Request("http://localhost", {
        method: "POST", body: JSON.stringify({ mode: "selected", itemIds: ["offer"], setForSale: true }),
      }))).status, 409);
      assert.deepEqual(await db.collection<GameItem>("items").findOne({ _id: "offer" }), original);
      assert.deepEqual(await db.collection("players").findOne({ _id: "player" }), playerBefore);
      if (status === "for_sale") {
        assert.equal((await invoke(api.purchase)).status, 200);
      } else {
        assert.equal((await api.acquireMany(new Request("http://localhost", {
          method: "POST", body: JSON.stringify({ mode: "selected", itemIds: ["offer"], setForSale: false }),
        }))).status, 200);
      }
      assert.equal((await db.collection<GameItem>("items").findOne({ _id: "offer" }))?.status, "claimed");
    }
  });
  for (const action of ["sellAll", "donateAll"] as const) {
    await t.test(`${action} preserves Originals even with every optional protection disabled`, async () => {
      const db = client.db(`original-${action}`);
      const original = { ...offer("unclaimed"), original: true, tags: [] };
      await seed(db, original);
      await db.collection<GameItem>("items").insertOne({ ...offer("unclaimed"), _id: "ordinary", artwork_id: "ordinary-art" });
      await db.collection<{ _id: string }>("artworks").insertMany([
        { _id: "art", rarity: "common", active: true },
        { _id: "ordinary-art", rarity: "common", active: true },
      ]);
      const api = await routes(db);
      const request = () => new Request("http://localhost", { method: "POST", body: "{}" });
      const response = await api[action](request());
      assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
      assert.deepEqual(await db.collection<GameItem>("items").findOne({ _id: "offer" }), original);
      assert.equal(await db.collection<GameItem>("items").findOne({ _id: "ordinary" }), null);
      const player = await db.collection("players").findOne({ _id: "player" });
      assert.equal(player?.profile.bank_balance, action === "sellAll" ? 550 : 500);
      assert.equal(player?.profile.karma, action === "donateAll" ? 7 : 0);
      assert.equal((await api[action](request())).status, 409);
      assert.deepEqual(await db.collection<GameItem>("items").findOne({ _id: "offer" }), original);
    });
  }

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
