import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import ts from "typescript";

import * as artworkEffects from "./artwork-effects.ts";
import { createArtistArtworkPreview } from "./artist-artwork-preview.ts";
import * as forgery from "./forgery-gameplay.ts";
import * as gameplay from "./gameplay.ts";
import * as settings from "./game-settings.ts";
import * as gallerySelection from "./gallery-selection.ts";
import * as itemArtwork from "./item-artwork.ts";
import * as itemMint from "./item-mint.ts";
import * as legendary from "./legendary-attributes.ts";
import * as masterpieceEffects from "./masterpiece-effects.ts";
import * as npcGameplay from "./npc-gameplay.ts";
import * as tutorial from "./tutorial.ts";
import * as tutorialElements from "../shared/tutorial.ts";
import * as socialBattery from "./social-battery.ts";
import { createDefaultPlayerProfile } from "./player-account.ts";
import { setArtistFeatured } from "./contributing-artists.ts";
import { setupTestDb, STARTING_INVENTORY_TEST_OPTIONS } from "./test-utils/db-setup.ts";

type ItemRoute = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
type GalleryRoute = (request: Request, context: { params: Promise<{ playerId: string }> }) => Promise<Response>;
async function load<T>(relative: string, dependencies: Record<string, unknown>): Promise<T> {
  const compiled = ts.transpileModule(await readFile(new URL(relative, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(`${compiled}\nexports`, {
    exports: {}, Date, URL, console: { ...console, error() {} },
    require: (id: string) => {
      assert.ok(id in dependencies, `Unexpected dependency: ${id}`);
      return dependencies[id];
    },
  }) as T;
}

async function seed(db: Db) {
  await setupTestDb(db, "player", {
    ...STARTING_INVENTORY_TEST_OPTIONS, playerProfile: { level: 0 },
  });
  await db.collection<{ _id: string }>("players").updateOne({ _id: "player" }, { $set: {
    screen_name: "Player", "profile.display_cap": 5,
    "profile.social_battery": 6_000, "profile.social_battery_reset_at": "2999-01-01T00:00:00.000Z",
  } });
  await db.collection<{ _id: string }>("players").insertOne({
    _id: "other", active: true, screen_name: "Other",
    profile: { level: 0, display_cap: 5, social_battery: 6_000, social_battery_reset_at: "2999-01-01T00:00:00.000Z" },
  });
  await db.collection<gameplay.GameItem>("items").insertMany(["starter-common", "starter-uncommon"].map((artwork_id, index) => ({
    _id: `item-${index}`, artwork_id, owner: "player", status: "claimed",
    condition: 1, mint: false, level: 1, foil: false, unlocked: false, seasonal: false, lottery: 0,
    original: false, vintage: false, permanent: false, repairing: false,
    attributes: { locked: [], unlocked: [], special: [] },
    values: { actual: 100, sell: 100, purchase: 100, auction_min: 100, collector: 100, dealer: 100 },
  } as gameplay.GameItem)));
}

async function routes(db: Db, overrides: Record<string, unknown> = {}) {
  const state = { viewerId: "player", failGeneration: false, failMetadata: false };
  const dependencies = {
    "node:crypto": { randomUUID },
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/server/player-api": { requirePlayerApi: async () => ({ ok: true, session: { playerId: state.viewerId } }) },
    "@/server/mongodb": { getDatabase: async () => db },
    "@/server/npc-gameplay": npcGameplay,
    "@/server/tutorial": tutorial,
    "@/shared/tutorial": tutorialElements,
    "@/server/item-mint": itemMint,
    "@/server/gallery-selection": gallerySelection,
    "@/server/gallery-metadata": { refreshGalleryMetadata: async () => {
      if (state.failMetadata) throw new Error("Metadata unavailable");
      return null;
    } },
    "@/server/game-settings": settings,
    "@/server/gameplay": { ...gameplay, generateDailyDrop: async (...args: Parameters<typeof gameplay.generateDailyDrop>) => {
      if (state.failGeneration) throw new Error("Generation unavailable");
      return gameplay.generateDailyDrop(...args);
    } },
    "@/server/item-artwork": itemArtwork,
    "@/server/legendary-attributes": legendary,
    "@/server/artwork-effects": artworkEffects,
    "@/server/masterpiece-effects": masterpieceEffects,
    "@/server/forgery-gameplay": forgery,
    "@/server/social-battery": socialBattery,
    "@/server/karma": { ensurePlayerKarma: async () => {} },
    "@/server/item-expiration": { getNpcOfferItemExpiration: (now: Date) => new Date(now.getTime() + 60_000).toISOString(),
      getUnexpiredItemFilter: () => ({}) },
    "@/server/standard-npc-reward-service": { isStandardRewardNpc: () => false },
    "@/server/community-reactions": { getCommunityReactionSummary: async () => ({ counts: [] }) },
    "@/server/player-gallery-finishes": { getPlayerGalleryFinishes: async () => ({}) },
    "@/server/public-showcase": { getPublicGalleryView: async () => ({ items: [], owner: { playerId: "player" } }) },
    "@/server/gallery-exhibition": { getGalleryExhibition: async () => ({ items: [], owner: { playerId: "player" } }) },
    "@/server/public-showcase-core": {},
    "@/server/contributing-artists": { getPublicArtistProfile: async () => null, getArtistWorks: async () => [] },
    "@/server/artist-artwork-preview": { createArtistArtworkPreview },
    "@/server/game-client-item": { serializeGameClientItem: (item: gameplay.GameItem) => ({ id: item._id }) },
    "@/server/economy-metrics": {}, "@/server/item-permissions": {}, "@/server/collector-gameplay": {},
    "@/server/art-expert-gameplay": {}, "@/server/npc-quest-item": {}, "@/server/art-historian-gameplay": {},
    "@/server/auctioneer-gameplay": {}, "@/server/auction-gameplay": {}, "@/server/collection-gameplay": {},
    "@/server/community-reaction-cleanup": {}, "@/server/hall-of-fame": {}, "@/server/item-reroll": {},
    "@/server/quest-item-sell": {}, "@/server/preservationist-gameplay": {}, "@/server/item-leveling": {},
    ...overrides,
  };
  return {
    state,
    display: (await load<{ POST: ItemRoute }>("../app/api/play/items/[id]/display/route.ts", dependencies)).POST,
    setGallery: (await load<{ POST: (request: Request) => Promise<Response> }>("../app/api/play/items/set-gallery/route.ts", dependencies)).POST,
    meet: (await load<{ POST: ItemRoute }>("../app/api/play/npcs/[id]/meet/route.ts", dependencies)).POST,
    visitors: (await load<{ GET: GalleryRoute }>("../app/api/play/galleries/[playerId]/visitors/route.ts", dependencies)).GET,
    gallery: (await load<{ GET: GalleryRoute }>("../app/api/play/galleries/[playerId]/route.ts", dependencies)).GET,
    bootstrap: (await load<{ GET: (request: Request) => Promise<Response> }>("../app/api/game/v1/bootstrap/route.ts", dependencies)).GET,
  };
}

const request = () => new Request("http://localhost", { method: "POST" });
const itemContext = (id: string) => ({ params: Promise.resolve({ id }) });
const galleryContext = { params: Promise.resolve({ playerId: "player" }) };
const selection = (itemIds: string[]) => new Request("http://localhost", { method: "POST", body: JSON.stringify({ itemIds }) });

test("tutorial Donor lifecycle and replay reward limits", async t => {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  t.after(async () => { await client.close(); await server.stop(); });

  await t.test("first-feature Donors respect the unique spawn-key index across accounts", async () => {
    for (const bulk of [false, true]) {
      const db = client.db(`tutorial-indexed-feature-${bulk}`);
      await seed(db);
      await db.collection("npcs").createIndex({ spawn_key: 1 }, { unique: true });
      await db.collection<{ _id: string }>("npcs").insertOne({ _id: "legacy-unkeyed-visitor" });
      await db.collection<{ _id: string }>("players").updateOne({ _id: "player" }, {
        $set: { tutorial: { step: tutorialElements.TutorialElement.TUTORIAL_FEATURE_ITEM, revision: 1 } },
      });
      await db.collection<gameplay.GameItem>("items").updateOne({ _id: "item-0" }, {
        $set: { artwork_id: "starter-rare" },
      });
      const api = await routes(db);
      const response = bulk
        ? await api.setGallery(selection(["item-0"]))
        : await api.display(request(), itemContext("item-0"));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).tutorial.step, tutorialElements.TutorialElement.TUTORIAL_FILL_FEATURES);
      await Promise.all(["player", "other"].map(playerId => npcGameplay.ensureTutorialDonor(db, playerId)));
      const donors = await db.collection<{ _id: string; spawn_key: string }>("npcs")
        .find({ tutorial: true }).toArray();
      assert.equal(donors.length, 2);
      assert.equal(new Set(donors.map(donor => donor.spawn_key)).size, 2);
      assert.ok(donors.every(donor => typeof donor.spawn_key === "string"));
      assert.equal(await db.collection("npcs").countDocuments(), 3);
    }
  });

  await t.test("retrying a committed feature repairs Donor setup and tutorial progress without featuring twice", async () => {
    const db = client.db("tutorial-partial-feature-retry");
    await seed(db);
    await db.collection<{ _id: string }>("players").updateOne({ _id: "player" }, {
      $set: { tutorial: { step: tutorialElements.TutorialElement.TUTORIAL_FEATURE_ITEM, revision: 1 } },
    });
    let fail = true;
    const api = await routes(db, { "@/server/npc-gameplay": {
      ensureTutorialDonor: async (...args: Parameters<typeof npcGameplay.ensureTutorialDonor>) => {
        if (fail) {
          fail = false;
          throw new Error("Injected Donor setup failure");
        }
        return npcGameplay.ensureTutorialDonor(...args);
      },
    } });
    await assert.rejects(api.display(request(), itemContext("item-0")), /Injected Donor setup failure/);
    const committed = await db.collection<gameplay.GameItem>("items").findOne({ _id: "item-0" });
    assert.equal(committed?.status, "displayed");
    const retried = await api.display(request(), itemContext("item-0"));
    assert.equal(retried.status, 200);
    assert.deepEqual((await retried.json()).tutorial, {
      step: tutorialElements.TutorialElement.TUTORIAL_FILL_FEATURES, revision: 2,
    });
    assert.deepEqual(await db.collection<gameplay.GameItem>("items").findOne({ _id: "item-0" }), committed);
    const repeated = await api.display(request(), itemContext("item-0"));
    assert.equal(repeated.status, 200);
    assert.equal((await repeated.json()).tutorial.revision, 2);
    assert.equal(await db.collection("npcs").countDocuments({ tutorial: true }), 1);
    api.state.viewerId = "other";
    assert.equal((await api.display(request(), itemContext("item-0"))).status, 409);
  });

  await t.test("single and bulk featuring each grant exactly one non-expiring Donor, including existing players", async () => {
    for (const bulk of [false, true]) {
      const db = client.db(`tutorial-feature-${bulk}`);
      await seed(db);
      await db.collection<{ _id: string }>("players").updateOne({ _id: "player" }, {
        $set: { tutorial: { step: tutorialElements.TutorialElement.TUTORIAL_FEATURE_ITEM, revision: 1 } },
      });
      const api = await routes(db);
      const response = bulk
        ? await api.setGallery(selection(["item-0", "item-1"]))
        : await api.display(request(), itemContext("item-0"));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).tutorial.step, tutorialElements.TutorialElement.TUTORIAL_FILL_FEATURES);
      await Promise.all(Array.from({ length: 10 }, () => npcGameplay.ensureTutorialDonor(db, "player")));
      const npcs = await db.collection<npcGameplay.GalleryNpc>("npcs").find({ tutorial: true }).toArray();
      assert.equal(npcs.length, 1);
      assert.equal(npcs[0].attribute_id, legendary.ART_DONOR_ATTRIBUTE_ID);
      assert.equal(npcs[0].quality, "bronze");
      assert.equal(npcs[0].npc_name.startsWith("Tutorial "), false);
      assert.equal(npcs[0].owner_id, "player");
      assert.equal(npcs[0].expiration, null);
      assert.equal(npcs[0].npc_name, "Art Donor");
      assert.deepEqual(npcs[0].players_met, []);
      assert.equal((await api.display(request(), itemContext("item-1"))).status, 200);
      assert.equal(await db.collection("npcs").countDocuments({ tutorial: true }), 1);
    }
    const db = client.db("tutorial-concurrent-first-creation");
    await seed(db);
    await Promise.all(Array.from({ length: 10 }, () => npcGameplay.ensureTutorialDonor(db, "player")));
    assert.equal(await db.collection("npcs").countDocuments({ tutorial: true }), 1);
  });

  await t.test("failed featuring and rolled-back bulk changes do not create a tutorial", async () => {
    const db = client.db("tutorial-invalid-feature");
    await seed(db);
    await db.collection<{ _id: string }>("players").updateOne({ _id: "player" }, {
      $set: { tutorial: { step: tutorialElements.TutorialElement.TUTORIAL_FEATURE_ITEM, revision: 1 } },
    });
    const api = await routes(db);
    assert.equal((await api.display(request(), itemContext("missing"))).status, 409);
    await db.collection<{ _id: string }>("players").updateOne({ _id: "player" }, { $set: { "profile.display_cap": 0 } });
    assert.equal((await api.display(request(), itemContext("item-0"))).status, 409);
    assert.equal((await api.setGallery(selection(["item-0"]))).status, 409);
    await db.collection<{ _id: string }>("players").updateOne({ _id: "player" }, { $set: { "profile.display_cap": 5 } });
    api.state.failMetadata = true;
    assert.equal((await api.setGallery(selection(["item-0"]))).status, 409);
    assert.equal((await db.collection<gameplay.GameItem>("items").findOne({ _id: "item-0" }))?.status, "claimed");
    assert.equal(await db.collection("npcs").countDocuments(), 0);
    assert.equal((await db.collection<{ _id: string; tutorial: tutorialElements.TutorialProgress }>("players")
      .findOne({ _id: "player" }))?.tutorial.revision, 1);
  });

  await t.test("tutorial write failures cannot roll back successful featuring or its Donor", async () => {
    const db = client.db("tutorial-write-failure");
    await seed(db);
    const broken = { collection: () => ({ findOneAndUpdate: async () => { throw new Error("Tutorial write failed"); } }) } as unknown as Db;
    const api = await routes(db, { "@/server/tutorial": {
      recordTutorialAction: (_db: Db, playerId: string, element: tutorialElements.TutorialElement) =>
        tutorial.recordTutorialAction(broken, playerId, element),
    } });
    const errors = t.mock.method(console, "error", () => {});
    try {
      assert.equal((await api.display(request(), itemContext("item-0"))).status, 200);
      assert.equal((await db.collection<gameplay.GameItem>("items").findOne({ _id: "item-0" }))?.status, "displayed");
      assert.equal(await db.collection("npcs").countDocuments({ tutorial: true }), 1);
      assert.equal(errors.mock.callCount(), 1);
    } finally { errors.mock.restore(); }
  });

  await t.test("only the owner can list or interact with the tutorial, including featured artist galleries", async () => {
    const db = client.db("tutorial-owner-only");
    await seed(db);
    const api = await routes(db);
    await api.display(request(), itemContext("item-0"));
    const tutorial = (await npcGameplay.getGalleryNpcs(db, "player", new Date(), "player"))[0];
    assert.ok(tutorial);
    assert.deepEqual(await npcGameplay.getGalleryNpcs(db, "player"), []);
    assert.deepEqual(await npcGameplay.getGalleryNpcs(db, "player", new Date(), "other"), []);
    await db.collection<{ _id: string }>("players").updateOne({ _id: "player" }, {
      $set: { artist_id: "artist", artist_featured: true },
    });
    for (const viewerId of ["other", "player"]) {
      api.state.viewerId = viewerId;
      const visitors = await (await api.visitors(new Request("http://localhost"), galleryContext)).json();
      const gallery = await (await api.gallery(new Request("http://localhost"), galleryContext)).json();
      const expected = viewerId === "player";
      assert.equal(visitors.visitors.some((npc: { tutorial?: true }) => npc.tutorial), expected);
      assert.equal(gallery.npcs.some((npc: { tutorial?: true }) => npc.tutorial), expected);
      if (expected) assert.equal(visitors.visitors.find((npc: { tutorial?: true }) => npc.tutorial).expiration, null);
      else assert.equal((await api.meet(request(), itemContext(tutorial._id))).status, 404);
    }
    assert.deepEqual((await db.collection<npcGameplay.GalleryNpc>("npcs").findOne({ _id: tutorial._id }))?.players_met, []);
    assert.equal((await api.bootstrap(new Request("http://localhost"))).status, 200);
    const bootstrap = await (await api.bootstrap(new Request("http://localhost"))).json();
    assert.equal(bootstrap.donorVisitor.id, tutorial._id);
  });

  await t.test("time, visitor refreshes, and artist refreshes preserve the tutorial and its one-time marker", async () => {
    const db = client.db("tutorial-refresh");
    await seed(db);
    await npcGameplay.ensureTutorialDonor(db, "player");
    const tutorial = (await npcGameplay.getGalleryNpcs(db, "player", new Date(), "player"))[0];
    await db.collection<npcGameplay.GalleryNpc>("npcs").insertOne({
      ...tutorial, _id: "ordinary", tutorial: undefined, expiration: new Date(0),
    });
    const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000);
    await npcGameplay.refreshNpcSpawns(db, future, 10);
    assert.equal(await db.collection("npcs").countDocuments({ _id: "ordinary" }), 0);
    assert.equal((await npcGameplay.getGalleryNpcs(db, "player", future, "player"))[0]._id, tutorial._id);
    await db.collection<{ _id: string }>("players").updateOne({ _id: "player" }, { $set: { artist_id: "artist" } });
    for (const met of [false, true]) {
      if (met) await db.collection<npcGameplay.GalleryNpc>("npcs").updateOne({ _id: tutorial._id }, { $addToSet: { players_met: "player" } });
      await setArtistFeatured(db, "player", true);
      await setArtistFeatured(db, "player", false);
      assert.ok(await db.collection<npcGameplay.GalleryNpc>("npcs").findOne({ _id: tutorial._id }));
    }
    await npcGameplay.ensureTutorialDonor(db, "player");
    assert.deepEqual(await npcGameplay.getGalleryNpcs(db, "player", future, "player"), []);
  });

  await t.test("one Common is awarded without battery or visitor-stat changes, and replays reuse the same record without rewards", async () => {
    const db = client.db("tutorial-meet");
    await seed(db);
    const api = await routes(db, { "@/server/legendary-attributes": {
      ...legendary, getDisplayedLegendaryEffect: async () => { throw new Error("Tutorial rewards must not apply donor bonuses"); },
    } });
    await api.display(request(), itemContext("item-0"));
    const players = db.collection<{ _id: string; profile: Record<string, unknown> }>("players");
    await players.updateOne({ _id: "player" }, { $set: {
      tutorial: { step: tutorialElements.TutorialElement.TUTORIAL_MEET_VISITOR, revision: 4 },
      "profile.social_battery": 0,
    } });
    await tutorial.resumeTutorial(db, "player");
    const donor = (await npcGameplay.getGalleryNpcs(db, "player", new Date(), "player"))[0];
    const before = (await players.findOne({ _id: "player" }))!.profile;
    const response = await api.meet(request(), itemContext(donor._id));
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    const result = await response.json();
    assert.equal(result.interaction.type, "art-donor-offer");
    assert.equal(result.interaction.items.length, 1);
    assert.equal(result.interaction.items[0].artwork.rarity, "common");
    assert.equal(result.tutorial.step, tutorialElements.TutorialElement.TUTORIAL_SEE_OFFERS);
    assert.equal(await db.collection("items").countDocuments({ source: "tutorial donor" }), 1);
    assert.deepEqual((await players.findOne({ _id: "player" }))!.profile, before);
    assert.deepEqual(await npcGameplay.getGalleryNpcs(db, "player", new Date(), "player"), []);
    assert.equal((await api.meet(request(), itemContext(donor._id))).status, 404);
    for (let replay = 0; replay < 3; replay++) {
      let progress = (await tutorial.restartTutorial(db, "player"))!;
      while (progress.step !== tutorialElements.TutorialElement.TUTORIAL_MEET_VISITOR) {
        progress = await tutorial.fulfillTutorial(db, "player", progress.step!, progress.revision);
      }
      const visitors = await (await api.visitors(new Request("http://localhost"), galleryContext)).json();
      assert.equal(visitors.visitors.find((npc: { _id: string }) => npc._id === donor._id).alreadyMet, false);
      const practice = await api.meet(request(), itemContext(donor._id));
      assert.equal(practice.status, 200);
      assert.equal((await practice.json()).interaction, undefined);
      assert.equal(await db.collection("items").countDocuments({ source: "tutorial donor" }), 1);
      assert.equal(await db.collection("npcs").countDocuments({ tutorial: true }), 1);
      assert.deepEqual((await players.findOne({ _id: "player" }))!.profile, before);
    }
    await players.updateOne({ _id: "player" }, { $set: { profile: createDefaultPlayerProfile("Player") } });
    await npcGameplay.ensureTutorialDonor(db, "player");
    assert.equal(await db.collection("npcs").countDocuments({ tutorial: true }), 1);
    assert.deepEqual(await npcGameplay.getGalleryNpcs(db, "player", new Date(), "player"), []);
  });

  await t.test("legacy met Donors can return for practice but retain their spent reward", async () => {
    const db = client.db("tutorial-legacy-met");
    await seed(db);
    await npcGameplay.ensureTutorialDonor(db, "player");
    const donor = (await npcGameplay.getGalleryNpcs(db, "player", new Date(), "player"))[0];
    await db.collection<npcGameplay.GalleryNpc>("npcs").updateOne({ _id: donor._id }, { $set: { players_met: ["player"] } });
    await db.collection<{ _id: string }>("players").updateOne({ _id: "player" }, {
      $set: { tutorial: { step: tutorialElements.TutorialElement.TUTORIAL_GO_TO_GALLERY, revision: 3 } },
    });
    await tutorial.fulfillTutorial(db, "player", tutorialElements.TutorialElement.TUTORIAL_GO_TO_GALLERY);
    const api = await routes(db);
    assert.equal((await (await api.meet(request(), itemContext(donor._id))).json()).interaction, undefined);
    assert.equal(await db.collection("items").countDocuments({ source: "tutorial donor" }), 0);
    assert.equal((await db.collection<npcGameplay.GalleryNpc>("npcs").findOne({ _id: donor._id }))!.tutorial_reward_claimed, true);
  });

  await t.test("concurrent meetings grant at most one reward and failed delivery cannot be retried for another item", async () => {
    for (const failure of ["none", "generation", "hydration"] as const) {
      const db = client.db(`tutorial-delivery-${failure}`);
      await seed(db);
      await npcGameplay.ensureTutorialDonor(db, "player");
      const donor = (await npcGameplay.getGalleryNpcs(db, "player", new Date(), "player"))[0];
      const api = await routes(db, failure === "hydration" ? {
        "@/server/item-artwork": { ...itemArtwork, hydrateGameItems: async () => { throw new Error("Hydration failed"); } },
      } : {});
      api.state.failGeneration = failure === "generation";
      if (failure === "none") {
        const responses = await Promise.all(Array.from({ length: 10 }, () => api.meet(request(), itemContext(donor._id))));
        assert.equal(responses.filter(response => response.status === 200).length, 1);
      } else {
        assert.equal((await api.meet(request(), itemContext(donor._id))).status, 500);
        api.state.failGeneration = false;
        const retry = await api.meet(request(), itemContext(donor._id));
        assert.equal(retry.status, 200);
        assert.equal((await retry.json()).interaction, undefined);
      }
      assert.equal(await db.collection("items").countDocuments({ source: "tutorial donor" }), failure === "generation" ? 0 : 1);
    }
  });

  await t.test("ordinary Donors retain their two offers, battery cost, and visitor statistics", async () => {
    const db = client.db("ordinary-donor-regression");
    await seed(db);
    await npcGameplay.ensureTutorialDonor(db, "player");
    const donor = (await npcGameplay.getGalleryNpcs(db, "player", new Date(), "player"))[0];
    await db.collection<npcGameplay.GalleryNpc>("npcs").insertOne({
      ...donor, _id: "ordinary", tutorial: undefined, expiration: new Date(Date.now() + 60_000),
    });
    const api = await routes(db);
    const response = await api.meet(request(), itemContext("ordinary"));
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    assert.equal((await response.json()).interaction.items.length, 2);
    assert.equal(await db.collection("items").countDocuments({ source: "art donor" }), 2);
    const player = await db.collection<{ _id: string; profile: { social_battery: number; playthrough_stats: { visitors_met: number } } }>("players")
      .findOne({ _id: "player" });
    assert.equal(player!.profile.social_battery, 6_000 - socialBattery.getVisitorSocialBatteryCost("bronze", true));
    assert.equal(player!.profile.playthrough_stats.visitors_met, 1);
  });
});
