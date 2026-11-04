import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import ts from "typescript";

import type { GameItem } from "./gameplay.ts";
import type * as GalleryMetadataModule from "./gallery-metadata.ts";
import * as galleryCore from "./gallery-metadata-core.ts";
import * as permissions from "./item-permissions.ts";
import * as permanentCollection from "./permanent-collection.ts";
import * as masterpieceEffects from "./masterpiece-effects.ts";
import * as showcase from "./public-showcase-core.ts";
import * as itemTags from "./item-tags.ts";
import * as gallerySelection from "./gallery-selection.ts";
import * as npcGameplay from "./npc-gameplay.ts";
import * as tutorial from "./tutorial.ts";
import * as tutorialElements from "../shared/tutorial.ts";

type ItemRoute = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

async function loadModule<T>(path: string, dependencies: Record<string, unknown>): Promise<T> {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(`${code}\nexports`, {
    exports: {}, console, Date, URL,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }) as T;
}

function item(id: string, overrides: Partial<GameItem> = {}): GameItem {
  return {
    _id: id, artwork_id: `art-${id}`, owner: "player", status: "claimed",
    permanent: false, mint: true, repairing: false,
    tags: ["keep", "for sale"], attributes: { locked: [], unlocked: [], special: [] },
    values: { actual: 100, sell: 100, purchase: 100, auction_min: 100, collector: 100, dealer: 100 },
    ...overrides,
  } as GameItem;
}

async function seed(db: Db, items: GameItem[], cap = 12) {
  await db.collection<{ _id: string }>("players").insertOne({
    _id: "player", active: true, screen_name: "Test gallery",
    profile: { display_cap: 5, pc_cap: cap, bank_balance: 500, xp: 20 },
  });
  await db.collection<GameItem>("items").insertMany(items);
  const artworkIds = [...new Set(items.map((entry) => entry.artwork_id))];
  await db.collection<{ _id: string }>("artworks").insertMany(artworkIds.map((_id) => ({
    _id, rarity: "common",
  })));
}

async function routes(db: Db, permissionModule: unknown = permissions) {
  const metadata = await loadModule<typeof GalleryMetadataModule>("./gallery-metadata.ts", {
    "server-only": {},
    "./gallery-metadata-core": galleryCore,
    "./masterpiece-effects.ts": masterpieceEffects,
    "./public-showcase-core.ts": showcase,
  });
  const dependencies = {
    "node:crypto": { randomUUID },
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/server/player-api": { requirePlayerApi: async () => ({ ok: true, session: { playerId: "player" } }) },
    "@/server/mongodb": { getDatabase: async () => db },
    "@/server/gallery-metadata": metadata,
    "@/server/item-permissions": permissionModule,
    "@/server/permanent-collection": permanentCollection,
    "@/server/item-tags": itemTags,
    "@/server/item-mint": { getDemintUpdate: async () => ({ mint: false }) },
    "@/server/gallery-selection": gallerySelection,
    "@/server/npc-gameplay": npcGameplay,
    "@/server/tutorial": tutorial,
    "@/shared/tutorial": tutorialElements,
    "@/server/community-reactions": { getCommunityReactionSummaries: async () => new Map() },
    "@/server/contributing-artists": { getFeaturedArtistGalleries: async () => [] },
  };
  const permanent = await loadModule<{ POST: ItemRoute }>("../app/api/play/items/[id]/permanent/route.ts", dependencies);
  const collector = await loadModule<{ POST: ItemRoute }>("../app/api/play/items/[id]/collector-sale/route.ts", dependencies);
  const display = await loadModule<{ POST: ItemRoute }>("../app/api/play/items/[id]/display/route.ts", dependencies);
  const undisplay = await loadModule<{ POST: ItemRoute }>("../app/api/play/items/[id]/undisplay/route.ts", dependencies);
  const setGallery = await loadModule<{ POST: (request: Request) => Promise<Response> }>("../app/api/play/items/set-gallery/route.ts", dependencies);
  const tags = await loadModule<{ PATCH: ItemRoute }>("../app/api/play/items/[id]/tags/route.ts", dependencies);
  const directory = await loadModule<{ GET: (request: Request) => Promise<Response> }>("../app/api/play/galleries/route.ts", dependencies);
  return { metadata, directory, permanent, collector, display, undisplay, setGallery, tags };
}

function invoke(route: ItemRoute, id: string, body?: unknown) {
  return route(new Request("http://localhost", {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { params: Promise.resolve({ id }) });
}

test("permanent collection actions refresh shared galleries without promoting artwork", async (t) => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  t.after(async () => { await client.close(); await server.stop(); });
  await client.connect();

  await t.test("concurrent first-page and directory refreshes create exactly one empty gallery", async (t) => {
    const db = client.db("concurrent-first-gallery");
    await seed(db, [item("starter")]);
    const { metadata } = await routes(db);
    const galleries = db.collection<GalleryMetadataModule.GalleryMetadata>("galleries");
    const collection = db.collection.bind(db);
    const findOne = galleries.findOne.bind(galleries);
    let lookupCount = 0;
    let releaseLookups!: () => void;
    const lookupsReady = new Promise<void>(resolve => { releaseLookups = resolve; });
    t.mock.method(galleries, "findOne", (async (...args: Parameters<typeof galleries.findOne>) => {
      const existing = await findOne(...args);
      assert.equal(existing, null);
      if (++lookupCount === 3) releaseLookups();
      await lookupsReady;
      return existing;
    }) as typeof galleries.findOne);
    t.mock.method(db, "collection", ((name: string) =>
      name === "galleries" ? galleries : collection(name)) as Db["collection"]);
    const [first, second] = await Promise.all([
      metadata.refreshGalleryMetadata(db, "player"),
      metadata.refreshGalleryMetadata(db, "player"),
      metadata.ensureGalleryMetadata(db),
    ]);
    assert.equal(lookupCount, 3);
    assert.equal(first?._id, "player");
    assert.equal(second?._id, "player");
    assert.equal(await galleries.countDocuments(), 1);
    const saved = await findOne({ _id: "player" });
    assert.equal(saved?.owner_id, "player");
    assert.equal(saved?.active, true);
    assert.equal(saved?.schema_version, 4);
    assert.equal(saved?.item_count, 0);
    assert.equal(saved?.display_capacity, 5);
  });

  await t.test("permanent actions do not depend on newly added exports in a cached permissions module", async () => {
    const db = client.db("permanent-cached-permissions");
    await seed(db, [item("favorite")]);
    const { permanent } = await routes(db, {
      getArchivePermission: permissions.getArchivePermission,
      getDisplayPermission: permissions.getDisplayPermission,
      getPlayerFacingArchivePermission: permissions.getPlayerFacingArchivePermission,
    });
    const response = await invoke(permanent.POST, "favorite");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).permanent, true);
    assert.equal((await db.collection<GameItem>("items").findOne({ _id: "favorite" }))?.permanent, true);
  });

  await t.test("setting and unsetting preserve artwork, clear sale tags, and update permanent-only directory cards", async () => {
    const db = client.db("permanent-toggle");
    const original = item("favorite");
    await seed(db, [original]);
    await db.collection<{ _id: string }>("galleries").insertOne({
      _id: "legacy-gallery-id", owner_id: "player", schema_version: 3,
    });
    const { permanent, directory } = await routes(db);
    assert.equal((await invoke(permanent.POST, original._id)).status, 200);
    const saved = await db.collection<GameItem>("items").findOne({ _id: original._id });
    assert.deepEqual(saved, { ...original, permanent: true, tags: ["keep"] });
    const response = await directory.GET(new Request("http://localhost/api/play/galleries"));
    const result = await response.json();
    assert.equal(result.total, 1);
    assert.equal(result.galleries[0]._id, "legacy-gallery-id");
    assert.equal(result.galleries[0].schema_version, 4);
    assert.equal(result.galleries[0].display_count, 0);
    assert.equal(result.galleries[0].permanent_count, 1);
    assert.equal(result.galleries[0].item_count, 1);
    assert.equal(result.galleries[0].value, 0);
    assert.equal(result.galleries[0].featured_artwork_id, original.artwork_id);
    const shared = await db.collection<GameItem>("items").find(showcase.getPublicGalleryItemFilter("player")).toArray();
    assert.deepEqual(shared.map((entry) => entry._id), ["favorite"]);
    assert.equal((await invoke(permanent.POST, original._id, { permanent: true })).status, 200);
    assert.equal((await invoke(permanent.POST, original._id)).status, 200);
    assert.equal((await db.collection<GameItem>("items").findOne({ _id: original._id }))?.permanent, false);
    const empty = await directory.GET(new Request("http://localhost/api/play/galleries"));
    assert.equal((await empty.json()).total, 0);
    const player = await db.collection("players").findOne({ _id: "player" });
    assert.equal(player?.profile.bank_balance, 500);
    assert.equal(player?.profile.xp, 20);
    assert.equal(player?.profile.permanent_collection_operation, undefined);
  });

  await t.test("directory cards read current existing artwork crops without extra stored settings or list payloads", async () => {
    const db = client.db("directory-feature-crops");
    const featured = item("featured", { status: "displayed" });
    await seed(db, [featured]);
    const { directory, metadata } = await routes(db);
    await metadata.refreshGalleryMetadata(db, "player");
    const artwork = db.collection<{ _id: string }>("artworks");
    const featureCrop = { x: 40, y: -20, scale: 2 };
    const thumbnailCrop = { x: -25, y: 30, scale: 1.5 };
    await artwork.updateOne({ _id: featured.artwork_id }, { $set: {
      feature_card_adjustment: featureCrop, thumbnail_adjustment: thumbnailCrop, title: "Not needed for directory crops",
    } });
    const savedMetadata = await db.collection("galleries").findOne({ owner_id: "player" });
    const get = async (view = "expanded") => {
      const response = await directory.GET(new Request(`http://localhost/api/play/galleries?view=${view}`));
      assert.equal(response.status, 200);
      return (await response.json()).galleries[0];
    };
    assert.deepEqual((await get()).featured_artwork, {
      _id: featured.artwork_id, feature_card_adjustment: featureCrop, thumbnail_adjustment: thumbnailCrop,
    });
    const updatedCrop = { x: 10, y: 50, scale: 1.2 };
    await artwork.updateOne({ _id: featured.artwork_id }, { $set: { feature_card_adjustment: updatedCrop } });
    assert.deepEqual((await get()).featured_artwork.feature_card_adjustment, updatedCrop,
      "Editing the existing artwork crop must not require refreshing stored gallery metadata");
    await artwork.updateOne({ _id: featured.artwork_id }, { $unset: { feature_card_adjustment: "" } });
    assert.deepEqual((await get()).featured_artwork, {
      _id: featured.artwork_id, thumbnail_adjustment: thumbnailCrop,
    }, "The thumbnail crop remains available for the existing Feature card fallback");
    assert.equal(Object.hasOwn(await get("list"), "featured_artwork"), false);
    await artwork.deleteOne({ _id: featured.artwork_id });
    assert.equal((await get()).featured_artwork, null, "Missing artwork metadata falls back safely");
    assert.deepEqual(await db.collection("galleries").findOne({ owner_id: "player" }), savedMetadata);
  });

  await t.test("permanent previews take priority and revert to promoted previews when removed", async () => {
    const db = client.db("permanent-preview");
    await seed(db, [
      item("favorite"),
      item("promoted", { status: "displayed", values: { ...item("x").values, actual: 1_000 } }),
    ]);
    const { permanent } = await routes(db);
    assert.equal((await invoke(permanent.POST, "favorite")).status, 200);
    let gallery = await db.collection("galleries").findOne({ owner_id: "player" });
    assert.equal(gallery?.featured_item_id, "favorite");
    assert.equal(gallery?.value, 1_000);
    assert.equal(gallery?.item_count, 2);
    assert.equal((await invoke(permanent.POST, "favorite")).status, 200);
    gallery = await db.collection("galleries").findOne({ owner_id: "player" });
    assert.equal(gallery?.featured_item_id, "promoted");
    assert.equal(gallery?.item_count, 1);
  });

  await t.test("ownership, acquisition state, promoted copies and permanent copies are enforced", async () => {
    const db = client.db("permanent-permissions");
    await seed(db, [
      item("eligible"),
      item("foreign", { owner: "other-player" }),
      ...(["unclaimed", "for_sale", "auctioned", "displayed"] as const).map((status) => item(status, { status })),
      item("duplicate-promoted", { artwork_id: "art-displayed" }),
      item("permanent", { permanent: true }),
      item("duplicate-permanent", { artwork_id: "art-permanent" }),
    ]);
    const { permanent } = await routes(db);
    for (const id of ["foreign", "unclaimed", "for_sale", "auctioned", "duplicate-promoted", "duplicate-permanent"]) {
      assert.equal((await invoke(permanent.POST, id)).status, 409, id);
    }
    assert.equal((await invoke(permanent.POST, "eligible")).status, 200);
  });

  await t.test("permanent membership preserves promotion and promotion can stop and restart independently", async () => {
    const db = client.db("promoted-to-permanent");
    const promoted = item("promoted", { status: "displayed", time_displayed: "2026-11-02T00:00:00.000Z" });
    await seed(db, [promoted]);
    const { permanent, metadata, display, undisplay } = await routes(db);
    await metadata.refreshGalleryMetadata(db, "player");
    const response = await invoke(permanent.POST, promoted._id);
    assert.equal(response.status, 200);
    assert.match((await response.json()).message, /featuring remains active/i);
    let saved = await db.collection<GameItem>("items").findOne({ _id: promoted._id });
    assert.equal(saved?.status, "displayed");
    assert.equal(saved?.permanent, true);
    assert.equal(saved?.time_displayed, promoted.time_displayed);
    assert.deepEqual(saved?.tags, ["keep"]);
    let gallery = await db.collection("galleries").findOne({ owner_id: "player" });
    assert.equal(gallery?.display_count, 1);
    assert.equal(gallery?.permanent_count, 1);
    assert.equal(gallery?.item_count, 1);
    assert.equal(gallery?.value, promoted.values.actual);
    assert.equal(gallery?.featured_item_id, promoted._id);

    const removed = await invoke(permanent.POST, promoted._id, { permanent: false });
    assert.equal(removed.status, 200);
    assert.match((await removed.json()).message, /remains featured/i);
    saved = await db.collection<GameItem>("items").findOne({ _id: promoted._id });
    assert.equal(saved?.status, "displayed");
    assert.equal(saved?.permanent, false);
    assert.equal(saved?.time_displayed, promoted.time_displayed);
    gallery = await db.collection("galleries").findOne({ owner_id: "player" });
    assert.equal(gallery?.display_count, 1);
    assert.equal(gallery?.permanent_count, 0);
    assert.equal(gallery?.item_count, 1);
    assert.equal(gallery?.value, promoted.values.actual);

    assert.equal((await invoke(permanent.POST, promoted._id, { permanent: true })).status, 200);
    assert.equal((await invoke(undisplay.POST, promoted._id)).status, 200);
    saved = await db.collection<GameItem>("items").findOne({ _id: promoted._id });
    assert.equal(saved?.status, "claimed");
    assert.equal(saved?.permanent, true);
    assert.equal(saved?.time_displayed, undefined);
    gallery = await db.collection("galleries").findOne({ owner_id: "player" });
    assert.equal(gallery?.display_count, 0);
    assert.equal(gallery?.permanent_count, 1);
    assert.equal(gallery?.item_count, 1);
    assert.equal(gallery?.value, 0);
    assert.equal(await db.collection("items").countDocuments(showcase.getPublicGalleryItemFilter("player")), 1);
    assert.equal((await invoke(display.POST, promoted._id)).status, 200);
    saved = await db.collection<GameItem>("items").findOne({ _id: promoted._id });
    assert.equal(saved?.status, "displayed");
    assert.equal(saved?.permanent, true);
    assert.ok(saved?.time_displayed);
    gallery = await db.collection("galleries").findOne({ owner_id: "player" });
    assert.equal(gallery?.display_count, 1);
    assert.equal(gallery?.permanent_count, 1);
    assert.equal(gallery?.item_count, 1);
    assert.equal(gallery?.value, promoted.values.actual);
  });

  await t.test("promoted permanent works consume promotion capacity and Set Gallery preserves permanent membership", async () => {
    const db = client.db("permanent-promotion-capacity");
    await seed(db, [
      item("first", { permanent: true }),
      item("second", { permanent: true }),
      item("duplicate", { artwork_id: "art-first" }),
    ]);
    await db.collection("players").updateOne({ _id: "player" }, { $set: { "profile.display_cap": 1 } });
    const { display, setGallery } = await routes(db);
    assert.equal((await invoke(display.POST, "duplicate")).status, 409);
    assert.equal((await invoke(display.POST, "first")).status, 200);
    assert.equal((await invoke(display.POST, "second")).status, 409);
    const response = await setGallery.POST(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ itemIds: ["second"] }),
    }));
    assert.equal(response.status, 200);
    const first = await db.collection<GameItem>("items").findOne({ _id: "first" });
    const second = await db.collection<GameItem>("items").findOne({ _id: "second" });
    assert.equal(first?.status, "claimed");
    assert.equal(first?.permanent, true);
    assert.equal(first?.time_displayed, undefined);
    assert.equal(second?.status, "displayed");
    assert.equal(second?.permanent, true);
    const gallery = await db.collection("galleries").findOne({ owner_id: "player" });
    assert.equal(gallery?.display_count, 1);
    assert.equal(gallery?.permanent_count, 2);
    assert.equal(gallery?.item_count, 2);
    assert.equal(gallery?.value, second?.values.actual);
  });

  await t.test("promoted permanent Masterpieces activate common substitution only while promoted", async () => {
    const db = client.db("permanent-common-substitution");
    const attribute = {
      _id: "attraction", title: "Attraction", type: "regular", description: "",
      icon: "fa-user", npc_name: "Visitor", active: true, value: 0.4,
    };
    await seed(db, [
      item("source", { permanent: true, status: "displayed",
        attributes: { locked: [], unlocked: [attribute], special: [] } }),
      item("common", { status: "displayed",
        attributes: { locked: [], unlocked: [{ ...attribute, value: 0.9 }], special: [] } }),
    ]);
    await db.collection("artworks").updateOne({ _id: "art-source" }, {
      $set: { rarity: "masterpiece", effect_id: "substitution" },
    });
    await db.collection<{ _id: string }>("artwork_effects").insertOne({
      _id: "substitution", active: true, code: masterpieceEffects.MASTERPIECE_EFFECT_CODES.commonSubstitution,
    });
    const { metadata, undisplay } = await routes(db);
    const active = await metadata.refreshGalleryMetadata(db, "player");
    assert.equal(active?.score, 80);
    assert.equal(active?.attributes[0].totalRating, 0.8);
    assert.deepEqual(active?.active_unique_attributes, ["substitution"]);
    assert.equal(active?.item_count, 2);
    assert.equal((await invoke(undisplay.POST, "source")).status, 200);
    const inactive = await db.collection("galleries").findOne({ owner_id: "player" });
    assert.equal(inactive?.score, 90);
    assert.equal(inactive?.attributes[0].totalRating, 0.9);
    assert.deepEqual(inactive?.active_unique_attributes, []);
    assert.equal(inactive?.item_count, 2);
  });

  await t.test("concurrent last-slot requests cannot exceed capacity and removal still works over capacity", async () => {
    const db = client.db("permanent-capacity");
    await seed(db, [item("first"), item("second")], 1);
    const { permanent } = await routes(db);
    const responses = await Promise.all(["first", "second"].map((id) => invoke(permanent.POST, id)));
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    assert.equal(await db.collection("items").countDocuments({ permanent: true }), 1);
    const favorite = await db.collection<GameItem>("items").findOne({ permanent: true });
    const otherId = favorite?._id === "first" ? "second" : "first";
    assert.equal((await invoke(permanent.POST, otherId)).status, 409);
    await db.collection("players").updateOne({ _id: "player" }, { $set: { "profile.pc_cap": 0 } });
    assert.equal((await invoke(permanent.POST, favorite!._id)).status, 200);
    assert.equal(await db.collection("items").countDocuments({ permanent: true }), 0);
    assert.equal((await db.collection("players").findOne({ _id: "player" }))?.profile.permanent_collection_operation, undefined);
  });

  await t.test("permanent works can be promoted but cannot be offered for sale through either state control", async () => {
    const db = client.db("permanent-protection");
    await seed(db, [item("favorite", { permanent: true, tags: ["keep"] })]);
    const { collector, display, tags } = await routes(db);
    assert.equal((await invoke(collector.POST, "favorite")).status, 409);
    assert.equal((await invoke(display.POST, "favorite")).status, 200);
    assert.equal((await invoke(tags.PATCH, "favorite", { tags: ["keep", "for sale"] })).status, 409);
    assert.equal((await invoke(tags.PATCH, "favorite", { tags: ["keep", "landscape"] })).status, 200);
    assert.equal((await db.collection<GameItem>("items").findOne({ _id: "favorite" }))?.permanent, true);
  });

  await t.test("schema refresh shares only collected permanent works and promotes no additional state", async () => {
    const db = client.db("permanent-metadata-upgrade");
    await seed(db, [
      item("favorite", { permanent: true }),
      item("unclaimed", { permanent: true, status: "unclaimed" }),
      item("auctioned", { permanent: true, status: "auctioned" }),
      item("private", { permanent: false }),
      item("foreign", { permanent: true, owner: "other-player" }),
    ]);
    await db.collection<{ _id: string }>("galleries").insertOne({
      _id: "old-gallery", owner_id: "player", schema_version: 3,
    });
    const { directory } = await routes(db);
    const response = await directory.GET(new Request("http://localhost/api/play/galleries"));
    const { galleries } = await response.json();
    assert.equal(galleries.length, 1);
    assert.equal(galleries[0].item_count, 1);
    assert.deepEqual(galleries[0].permanent_item_ids, ["favorite"]);
    assert.equal(galleries[0].featured_item_id, "favorite");
  });

  await t.test("unexpected failures return JSON and release the operation without hiding committed item state", async (t) => {
    const db = client.db("permanent-error-response");
    await seed(db, [item("favorite")]);
    const { permanent } = await routes(db);
    const collection = db.collection.bind(db);
    t.mock.method(console, "error", () => {});
    t.mock.method(db, "collection", ((name: string) => {
      if (name === "galleries") throw new Error("Synthetic metadata failure");
      return collection(name);
    }) as Db["collection"]);
    const response = await invoke(permanent.POST, "favorite");
    assert.equal(response.status, 500);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    assert.match((await response.json()).error, /refresh/i);
    assert.equal((await db.collection<GameItem>("items").findOne({ _id: "favorite" }))?.permanent, true);
    assert.equal((await db.collection("players").findOne({ _id: "player" }))?.profile.permanent_collection_operation, undefined);
  });
});
