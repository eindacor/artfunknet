import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import ts from "typescript";

import { DROPPABLE_CARD_RENDERER_IDS } from "../components/item-cards/catalog.ts";
import {
  DEFAULT_AUCTION_FILTER_SETTINGS,
  DEFAULT_PLAYER_VIEW_SETTINGS,
  getPlayerViewSettings,
} from "./player-view-settings.ts";

test("player view settings use stable defaults", () => {
  assert.deepEqual(getPlayerViewSettings(undefined), DEFAULT_PLAYER_VIEW_SETTINGS);
});

test("player view settings preserve valid saved choices", () => {
  assert.deepEqual(
    getPlayerViewSettings({
      gallerySort: "name",
      galleryView: "list",
      inventorySort: "condition",
      offersSort: "drop-chance",
      offersSortDirection: "asc",
      cratePurchaseCount: 7,
      enableReveals: false,
      showGalleryVisitors: false,
      auctionFilters: {
        ...DEFAULT_AUCTION_FILTER_SETTINGS,
        search: "Monet",
        sort: "dropChance",
        order: "desc",
        exclusivity: "public",
        quest: "quest",
        rarities: ["rare", "legendary"],
        artStyle: "archive",
        properties: {
          ...DEFAULT_AUCTION_FILTER_SETTINGS.properties,
          foil: "only",
          mint: "exclude",
        },
        attributeIds: ["attribute-1", "attribute-2"],
        attributeMinimum: 2,
        specialAttributeIds: ["special-1"],
      },
      auctionView: "expanded",
      bulkSaleProtections: {
        keptArtStyleIds: ["arcade", "zine"],
        keepRares: true,
        keepLegendaries: true,
        keepMasterpieces: true,
        keepUnfoundQuestTargets: true,
        keepUnarchived: true,
      },
    }),
    {
      gallerySort: "name",
      galleryView: "list",
      inventorySort: "condition",
      offersSort: "drop-chance",
      offersSortDirection: "asc",
      cratePurchaseCount: 7,
      enableReveals: false,
      showGalleryVisitors: false,
      auctionFilters: {
        ...DEFAULT_AUCTION_FILTER_SETTINGS,
        search: "Monet",
        sort: "dropChance",
        order: "desc",
        exclusivity: "public",
        quest: "quest",
        rarities: ["rare", "legendary"],
        artStyle: "archive",
        properties: {
          ...DEFAULT_AUCTION_FILTER_SETTINGS.properties,
          foil: "only",
          mint: "exclude",
        },
        attributeIds: ["attribute-1", "attribute-2"],
        attributeMinimum: 2,
        specialAttributeIds: ["special-1"],
      },
      auctionView: "expanded",
      bulkSaleProtections: {
        keptArtStyleIds: ["arcade", "zine"],
        keepRares: true,
        keepLegendaries: true,
        keepMasterpieces: true,
        keepUnfoundQuestTargets: true,
        keepUnarchived: true,
      },
    },
  );
});

test("player view settings replace invalid values with safe defaults", () => {
  assert.deepEqual(
    getPlayerViewSettings({
      gallerySort: "popularity",
      galleryView: "tiles",
      inventorySort: "random",
      offersSort: "title",
      offersSortDirection: "sideways",
      auctionFilters: {
        sort: "acquired",
        rarities: [],
        properties: { foil: "sometimes" },
      },
      auctionView: "cards",
      bulkSaleProtections: {
        keptArtStyleIds: ["museum", "unknown", "zine", "zine"],
        keepLegendaries: 1,
      },
    }),
    {
      ...DEFAULT_PLAYER_VIEW_SETTINGS,
      bulkSaleProtections: {
        ...DEFAULT_PLAYER_VIEW_SETTINGS.bulkSaleProtections,
        keptArtStyleIds: ["zine"],
      },
    },
  );
});

test("player view settings restore both Inventory drop-chance sort directions", () => {
  for (const inventorySort of ["drop-chance-high", "drop-chance-low"]) {
    assert.deepEqual(getPlayerViewSettings({ inventorySort }), {
      ...DEFAULT_PLAYER_VIEW_SETTINGS,
      inventorySort,
    });
  }
});

test("legacy view settings receive Offers defaults without losing saved bulk choices", () => {
  const settings = getPlayerViewSettings({
    inventorySort: "value-low",
    bulkSaleProtections: { keepRares: false, keepArtStyles: false },
  });
  assert.equal(settings.offersSort, "value");
  assert.equal(settings.offersSortDirection, "desc");
  assert.equal(settings.inventorySort, "value-low");
  assert.equal(settings.bulkSaleProtections.keepRares, false);
  assert.deepEqual(settings.bulkSaleProtections.keptArtStyleIds, []);
  assert.equal(settings.cratePurchaseCount, 1);
  assert.deepEqual(settings.auctionFilters, DEFAULT_AUCTION_FILTER_SETTINGS);
  assert.equal(settings.auctionView, "list");
});

test("legacy enabled art-style protection selects every droppable renderer", () => {
  const settings = getPlayerViewSettings({
    bulkSaleProtections: { keepArtStyles: true },
  });

  assert.deepEqual(
    settings.bulkSaleProtections.keptArtStyleIds,
    DROPPABLE_CARD_RENDERER_IDS,
  );
});

test("auction filters restore portable item filters and reject malformed values", () => {
  const valid = getPlayerViewSettings({
    auctionFilters: {
      ...DEFAULT_AUCTION_FILTER_SETTINGS,
      search: "seller",
      properties: {
        ...DEFAULT_AUCTION_FILTER_SETTINGS.properties,
        seasonal: "only",
      },
      attributeIds: ["one", "two"],
      attributeMinimum: 2,
    },
  }).auctionFilters;
  assert.equal(valid.search, "seller");
  assert.equal(valid.properties.seasonal, "only");
  assert.deepEqual(valid.attributeIds, ["one", "two"]);
  assert.equal(valid.attributeMinimum, 2);

  const invalid = getPlayerViewSettings({
    auctionFilters: {
      ...DEFAULT_AUCTION_FILTER_SETTINGS,
      rarities: [],
      properties: {
        ...DEFAULT_AUCTION_FILTER_SETTINGS.properties,
        seasonal: "sometimes",
      },
      attributeIds: ["one"],
      attributeMinimum: 2,
    },
  }).auctionFilters;
  assert.deepEqual(invalid.rarities, DEFAULT_AUCTION_FILTER_SETTINGS.rarities);
  assert.equal(invalid.properties.seasonal, "any");
  assert.equal(invalid.attributeMinimum, 1);
});

test("preferred crate counts preserve whole-number choices within purchase limits", () => {
  for (const cratePurchaseCount of [1, 7, 20]) {
    assert.equal(
      getPlayerViewSettings({ cratePurchaseCount }).cratePurchaseCount,
      cratePurchaseCount,
    );
  }
});

test("invalid preferred crate counts fall back without resetting other options", () => {
  for (const cratePurchaseCount of [0, -1, 21, 1.5, "7", null, Infinity, NaN]) {
    const settings = getPlayerViewSettings({
      cratePurchaseCount,
      inventorySort: "value-low",
      bulkSaleProtections: { keepRares: false },
    });

    assert.equal(settings.cratePurchaseCount, 1);
    assert.equal(settings.inventorySort, "value-low");
    assert.equal(settings.bulkSaleProtections.keepRares, false);
  }
});

test("reveals remain enabled for legacy or malformed preferences", () => {
  for (const enableReveals of [undefined, null, "false", 0, [], {}]) {
    assert.equal(getPlayerViewSettings({ enableReveals }).enableReveals, true);
  }
});

test("disabling reveals preserves other saved player preferences", () => {
  const settings = getPlayerViewSettings({
    enableReveals: false,
    cratePurchaseCount: 7,
    galleryView: "list",
    bulkSaleProtections: { keepRares: false },
  });
  assert.equal(settings.enableReveals, false);
  assert.equal(settings.cratePurchaseCount, 7);
  assert.equal(settings.galleryView, "list");
  assert.equal(settings.bulkSaleProtections.keepRares, false);
});

test("gallery visitors default to enabled for legacy or malformed preferences", () => {
  for (const showGalleryVisitors of [undefined, null, "false", 0, [], {}]) {
    assert.equal(getPlayerViewSettings({ showGalleryVisitors }).showGalleryVisitors, true);
  }
});

test("visitor visibility is saved on the player profile and restored by independent browser requests", async t => {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  t.after(async () => { await client.close(); await server.stop(); });
  const db = client.db("visitor-display-preference");
  const players = db.collection<{ _id: string; active: boolean; profile: { view_settings: unknown } }>("players");
  await players.insertMany([
    { _id: "player", active: true, profile: { view_settings: { galleryView: "list", enableReveals: false } } },
    { _id: "other", active: true, profile: { view_settings: { showGalleryVisitors: true } } },
  ]);
  const source = await readFile(new URL("../app/api/play/view-settings/route.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/server/mongodb": { getDatabase: async () => db },
    "@/server/player-view-settings": { getPlayerViewSettings },
    "@/server/player-api": { requirePlayerApi: async () => ({ ok: true, session: { playerId: "player" } }) },
  };
  function browser() {
    const route = runInNewContext(`${code}\nexports`, {
      exports: {}, Date, require: (name: string) => {
        assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
        return dependencies[name];
      },
    }) as { PATCH: (request: Request) => Promise<Response> };
    return (settings: Record<string, unknown>) => route.PATCH(new Request("http://localhost/api/play/view-settings", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(settings),
    }));
  }
  const savedSettings = async (id = "player") =>
    getPlayerViewSettings((await players.findOne({ _id: id }))?.profile.view_settings);
  assert.equal((await savedSettings()).showGalleryVisitors, true);
  const firstBrowser = browser();
  assert.equal((await firstBrowser({ showGalleryVisitors: false })).status, 200);
  assert.equal((await savedSettings()).showGalleryVisitors, false);
  assert.equal((await savedSettings()).galleryView, "list");
  assert.equal((await savedSettings()).enableReveals, false);
  assert.equal((await savedSettings("other")).showGalleryVisitors, true);
  const secondBrowser = browser();
  const restored = await secondBrowser({ gallerySort: "name" });
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).settings.showGalleryVisitors, false);
  assert.equal((await secondBrowser({ showGalleryVisitors: true })).status, 200);
  assert.equal((await savedSettings()).showGalleryVisitors, true);
  const refreshed = await firstBrowser({ gallerySort: "score" });
  assert.equal((await refreshed.json()).settings.showGalleryVisitors, true);
  const auctionFilters = {
    ...DEFAULT_AUCTION_FILTER_SETTINGS,
    search: "Kahlo",
    sort: "price" as const,
    order: "desc" as const,
    properties: {
      ...DEFAULT_AUCTION_FILTER_SETTINGS.properties,
      original: "only" as const,
    },
  };
  assert.equal(
    (await firstBrowser({
      auctionFilters,
      auctionView: "expanded",
    })).status,
    200,
  );
  assert.deepEqual((await savedSettings()).auctionFilters, auctionFilters);
  assert.equal((await savedSettings()).auctionView, "expanded");
  assert.equal((await savedSettings()).showGalleryVisitors, true);
  assert.equal(
    (await firstBrowser({
      auctionFilters: { ...auctionFilters, sort: "acquired" },
    })).status,
    400,
  );
  assert.deepEqual((await savedSettings()).auctionFilters, auctionFilters);
  for (const showGalleryVisitors of [null, "false", 0]) {
    assert.equal((await firstBrowser({ showGalleryVisitors })).status, 400);
    assert.equal((await savedSettings()).showGalleryVisitors, true);
  }
});
