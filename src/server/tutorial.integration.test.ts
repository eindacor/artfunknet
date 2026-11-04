import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import ts from "typescript";
import * as elements from "../shared/tutorial.ts";
import { TutorialElement as Step, TUTORIAL_ORDER, getPlayerTutorial, mergeTutorialProgress } from "../shared/tutorial.ts";
import { createPlayerAccountRecord } from "./player-account.ts";
import * as tutorial from "./tutorial.ts";
import * as dailyCrate from "./daily-crate.ts";
import { getNpcDisplayName } from "./npc-gameplay.ts";

type Route = (request: Request, context?: { params: Promise<{ id: string }> }) => Promise<Response>;
type Player = { _id: string; active: boolean; tutorial?: elements.TutorialProgress; [key: string]: unknown };

async function seed(db: Db, step: elements.TutorialElement | null = Step.TUTORIAL_SELECT_ITEM) {
  const player = createPlayerAccountRecord({
    email: "example@example.test", screenName: "Example", passwordSalt: "test", passwordHash: "test", playerId: "player",
  });
  player.tutorial = { step, revision: step ? TUTORIAL_ORDER.indexOf(step) : TUTORIAL_ORDER.length };
  await db.collection<Player>("players").insertOne(player);
  return db.collection<Player>("players");
}

async function loadRoute(db: Db, path: string, extra: Record<string, unknown> = {}) {
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/server/player-api": { requirePlayerApi: async () => ({ ok: true, session: { playerId: "player" } }) },
    "@/server/mongodb": { getDatabase: async () => db },
    "@/server/tutorial": tutorial, "@/shared/tutorial": elements,
    "@/server/economy-metrics": { recordEconomyMetricsSafely: async () => {} },
    "@/server/hall-of-fame": { checkItemForHallOfFameStatus: async () => {} },
    "@/server/item-expiration": { removeExpiredTransientItems: async () => {}, getUnexpiredItemFilter: () => ({}),
      getUnclaimedItemExpiration: () => "2999-01-01T00:00:00.000Z" },
    ...extra,
  };
  const compiled = ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(`${compiled}\nexports.POST`, {
    exports: {}, Date, console: { ...console, error() {} },
    require: (id: string) => {
      assert.ok(id in dependencies, `Unexpected tutorial test dependency: ${id}`);
      return dependencies[id];
    },
  }) as Route;
}

test("ordered walkthrough persistence and action guards", async t => {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  t.after(async () => { await client.close(); await server.stop(); });

  await t.test("new players start at selection, legacy and artist accounts do not start a walkthrough", async () => {
    const db = client.db("walkthrough-eligibility");
    const players = await seed(db);
    assert.deepEqual(getPlayerTutorial((await players.findOne({ _id: "player" }))!),
      { step: Step.TUTORIAL_SELECT_ITEM, revision: 0 });
    await players.insertOne({ _id: "legacy", active: true });
    await players.insertOne({ _id: "artist", active: true, account_type: "artist",
      tutorial: { step: Step.TUTORIAL_SELECT_ITEM, revision: 0 } });
    await players.insertOne({ _id: "artist-id", active: true, artist_id: "artist",
      tutorial: { step: Step.TUTORIAL_SELECT_ITEM, revision: 0 } });
    for (const id of ["legacy", "artist", "artist-id"]) {
      assert.deepEqual(await tutorial.fulfillTutorial(db, id, Step.TUTORIAL_SELECT_ITEM), { step: null, revision: 0 });
      assert.equal((await players.findOne({ _id: "legacy" }))?.tutorial, undefined);
      assert.equal((await players.findOne({ _id: id }))?.tutorial?.revision ?? 0, 0);
    }
  });

  await t.test("only the active enum advances and concurrent duplicates cannot skip the prescribed order", async () => {
    const db = client.db("walkthrough-order");
    const players = await seed(db);
    await db.collection("items").insertOne({ owner: "player", status: "unclaimed" });
    assert.equal((await tutorial.fulfillTutorial(db, "player", Step.TUTORIAL_REROLL_VALUE)).revision, 0);
    for (const [index, step] of TUTORIAL_ORDER.entries()) {
      await Promise.all(Array.from({ length: 10 }, () => tutorial.fulfillTutorial(db, "player", step)));
      const saved = getPlayerTutorial((await players.findOne({ _id: "player" }))!);
      assert.deepEqual(saved, { step: TUTORIAL_ORDER[index + 1] ?? null, revision: index + 1 });
      assert.deepEqual(await tutorial.fulfillTutorial(db, "player", step), saved);
    }
    await players.updateOne({ _id: "player" }, { $set: { profile: { level: 0 } } });
    assert.deepEqual(getPlayerTutorial((await players.findOne({ _id: "player" }))!),
      { step: null, revision: TUTORIAL_ORDER.length });
  });

  await t.test("the fill-slots condition uses actual owned displayed works and current capacity", async () => {
    const db = client.db("walkthrough-fill");
    const players = await seed(db, Step.TUTORIAL_FEATURE_ITEM);
    await players.updateOne({ _id: "player" }, { $set: { "profile.display_cap": 2 } });
    await db.collection("items").insertMany([
      { owner: "player", status: "displayed" }, { owner: "other", status: "displayed" }, { owner: "player", status: "claimed" },
    ]);
    assert.equal((await tutorial.recordTutorialAction(db, "player", Step.TUTORIAL_FEATURE_ITEM))?.step, Step.TUTORIAL_FILL_FEATURES);
    assert.equal((await tutorial.fulfillFilledFeatures(db, "player")).step, Step.TUTORIAL_FILL_FEATURES);
    await db.collection("items").insertOne({ owner: "player", status: "displayed" });
    assert.equal((await tutorial.fulfillFilledFeatures(db, "player")).step, Step.TUTORIAL_GO_TO_GALLERY);
  });

  await t.test("entering or resuming an empty claim step advances without granting or changing gameplay rewards", async () => {
    for (const step of [Step.TUTORIAL_SEE_OFFERS, Step.TUTORIAL_CLAIM_ITEM]) {
      const db = client.db(`walkthrough-empty-${step}`);
      const players = await seed(db, step);
      await db.collection("items").insertMany([
        { owner: "other", status: "unclaimed" }, { owner: "player", status: "for_sale" },
        { owner: "player", status: "claimed" },
      ]);
      const before = (await players.findOne({ _id: "player" }))!;
      const offers = await db.collection("items").find().toArray();
      const progress = step === Step.TUTORIAL_SEE_OFFERS
        ? await tutorial.fulfillTutorial(db, "player", step)
        : await tutorial.resumeTutorial(db, "player");
      assert.deepEqual(progress, { step: Step.TUTORIAL_DAILY_CRATE, revision: 7 });
      assert.deepEqual(await tutorial.resumeTutorial(db, "player"), progress);
      assert.deepEqual(getPlayerTutorial((await players.findOne({ _id: "player" }))!), progress);
      assert.deepEqual((await players.findOne({ _id: "player" }))!.profile, before.profile);
      assert.deepEqual(await db.collection("items").find().toArray(), offers);
      assert.equal(await db.collection("npcs").countDocuments(), 0);
    }
  });

  await t.test("available offers and ready or uninitialized daily crates remain actionable tutorial steps", async () => {
    const db = client.db("walkthrough-available-offer");
    const players = await seed(db, Step.TUTORIAL_CLAIM_ITEM);
    await db.collection("items").insertOne({ owner: "player", status: "unclaimed" });
    const claim = getPlayerTutorial((await players.findOne({ _id: "player" }))!);
    assert.deepEqual(await tutorial.resumeTutorial(db, "player"), claim);
    for (const daily_crate of [
      { time_zone: "UTC", last_claimed_at: null },
      { time_zone: "UTC", last_claimed_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() },
      { time_zone: null, last_claimed_at: new Date().toISOString() },
    ]) {
      const daily = { step: Step.TUTORIAL_DAILY_CRATE, revision: 7 };
      await players.updateOne({ _id: "player" }, { $set: { tutorial: daily, "profile.daily_crate": daily_crate } });
      assert.deepEqual(await tutorial.resumeTutorial(db, "player"), daily);
    }
  });

  await t.test("already-claimed daily crates use the existing reset rules and consecutive unavailable steps advance once", async () => {
    const db = client.db("walkthrough-claimed-crate");
    const players = await seed(db, Step.TUTORIAL_CLAIM_ITEM);
    await players.updateOne({ _id: "player" }, { $set: {
      "profile.daily_crate": { time_zone: "UTC", last_claimed_at: new Date().toISOString() },
    } });
    const profile = (await players.findOne({ _id: "player" }))!.profile;
    await Promise.all(Array.from({ length: 10 }, () => tutorial.resumeTutorial(db, "player")));
    const saved = getPlayerTutorial((await players.findOne({ _id: "player" }))!);
    assert.deepEqual(saved, { step: Step.TUTORIAL_MODIFY_ITEM, revision: 8 });
    assert.deepEqual(await tutorial.resumeTutorial(db, "player"), saved);
    assert.deepEqual((await players.findOne({ _id: "player" }))!.profile, profile);
    assert.equal(await db.collection("items").countDocuments(), 0);
  });

  await t.test("unavailable-step recovery does not retry or advance inactive accounts", async () => {
    const db = client.db("walkthrough-inactive");
    const players = await seed(db, Step.TUTORIAL_CLAIM_ITEM);
    await players.updateOne({ _id: "player" }, { $set: { active: false } });
    assert.deepEqual(await tutorial.fulfillTutorial(db, "player", Step.TUTORIAL_CLAIM_ITEM, 6), { step: null, revision: 0 });
    assert.deepEqual((await players.findOne({ _id: "player" }))!.tutorial, { step: Step.TUTORIAL_CLAIM_ITEM, revision: 6 });
  });

  await t.test("client fulfillment is authenticated and cannot spoof server-owned action steps or skip ahead", async () => {
    const db = client.db("walkthrough-api");
    const players = await seed(db);
    const route = await loadRoute(db, "../app/api/play/tutorial/fulfill/route.ts");
    const invoke = (element: unknown) => route(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({ element, revision: 0, playerId: "someone-else" }),
    }));
    assert.equal((await invoke("invalid")).status, 400);
    assert.equal((await invoke(Step.TUTORIAL_FEATURE_ITEM)).status, 400);
    assert.equal((await invoke(Step.TUTORIAL_SEE_ACTION_INFO)).status, 200);
    assert.equal(getPlayerTutorial((await players.findOne({ _id: "player" }))!).revision, 0);
    assert.equal((await (await invoke(Step.TUTORIAL_SELECT_ITEM)).json()).tutorial.step, Step.TUTORIAL_FEATURE_ITEM);
    const denied = await loadRoute(db, "../app/api/play/tutorial/fulfill/route.ts", {
      "@/server/player-api": { requirePlayerApi: async () => ({ ok: false, response: Response.json({}, { status: 401 }) }) },
    });
    assert.equal((await denied(new Request("http://localhost", { method: "POST" }))).status, 401);
  });

  await t.test("the final dialog remains active until acknowledged and completion persists", async () => {
    const db = client.db("walkthrough-completion");
    const players = await seed(db, Step.TUTORIAL_SEE_ACTION_INFO);
    const route = await loadRoute(db, "../app/api/play/tutorial/fulfill/route.ts");
    const acknowledge = async (element: elements.TutorialElement, revision: number) => {
      const response = await route(new Request("http://localhost", {
        method: "POST", body: JSON.stringify({ element, revision }),
      }));
      assert.equal(response.status, 200);
      return (await response.json()).tutorial as elements.TutorialProgress;
    };
    const previousRevision = TUTORIAL_ORDER.indexOf(Step.TUTORIAL_SEE_ACTION_INFO);
    assert.equal((await acknowledge(Step.TUTORIAL_COMPLETE, previousRevision)).step, Step.TUTORIAL_SEE_ACTION_INFO);
    const final = await acknowledge(Step.TUTORIAL_SEE_ACTION_INFO, previousRevision);
    assert.equal(final.step, Step.TUTORIAL_COMPLETE);
    assert.deepEqual(await tutorial.resumeTutorial(db, "player"), final);
    assert.deepEqual(getPlayerTutorial((await players.findOne({ _id: "player" }))!), final);
    const finished = await acknowledge(Step.TUTORIAL_COMPLETE, final.revision);
    assert.deepEqual(finished, { step: null, revision: final.revision + 1 });
    assert.deepEqual(await tutorial.resumeTutorial(db, "player"), finished);
    assert.deepEqual(await acknowledge(Step.TUTORIAL_COMPLETE, final.revision), finished);
  });

  await t.test("restart supports legacy accounts, preserves gameplay data, and stale skips cannot advance a new replay", async () => {
    const db = client.db("walkthrough-replay");
    const players = await seed(db);
    await players.updateOne({ _id: "player" }, { $unset: { tutorial: "" },
      $set: { "profile.daily_crate.last_claimed_at": "2026-11-04T12:00:00.000Z" } });
    const before = (await players.findOne({ _id: "player" }))!;
    const route = await loadRoute(db, "../app/api/play/tutorial/route.ts");
    const post = (body: unknown) => route(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }));
    assert.equal((await post({ action: "invalid" })).status, 400);
    const first = (await (await post({ action: "restart" })).json()).tutorial as elements.TutorialProgress;
    assert.deepEqual(first, { step: Step.TUTORIAL_SELECT_ITEM, revision: 1 });
    await Promise.all(Array.from({ length: 10 }, () => post({ action: "restart" })));
    const current = getPlayerTutorial((await players.findOne({ _id: "player" }))!);
    assert.equal(current.revision, 11);
    assert.equal((await (await post({ action: "skip", element: first.step, revision: first.revision })).json()).tutorial.revision, 11);
    const fulfill = await loadRoute(db, "../app/api/play/tutorial/fulfill/route.ts");
    const stale = await fulfill(new Request("http://localhost", { method: "POST",
      body: JSON.stringify({ element: first.step, revision: first.revision }) }));
    assert.equal((await stale.json()).tutorial.revision, 11);
    const next = await (await post({ action: "skip", element: current.step, revision: current.revision })).json();
    assert.equal(next.tutorial.step, Step.TUTORIAL_FEATURE_ITEM);
    assert.equal(next.tutorial.revision, 12);
    assert.deepEqual((await players.findOne({ _id: "player" }))!.profile, before.profile);
    assert.equal(await db.collection("items").countDocuments(), 0);
    assert.equal(await db.collection("npcs").countDocuments(), 0);
    await players.updateOne({ _id: "player" }, { $set: { account_type: "artist" } });
    assert.equal((await post({ action: "restart" })).status, 403);
  });

  await t.test("entry and resume callbacks ensure one Donor and do not reopen it in the same revision", async () => {
    const db = client.db("walkthrough-entry");
    await seed(db, Step.TUTORIAL_GO_TO_GALLERY);
    const entered = await tutorial.fulfillTutorial(db, "player", Step.TUTORIAL_GO_TO_GALLERY);
    assert.equal(entered.step, Step.TUTORIAL_MEET_VISITOR);
    const npcs = db.collection<{ _id: string; tutorial_revision: number; players_met: string[] }>("npcs");
    const donor = (await npcs.findOne({}))!;
    assert.equal(donor.tutorial_revision, entered.revision);
    await npcs.updateOne({ _id: donor._id }, { $set: { players_met: ["player"] } });
    await Promise.all(Array.from({ length: 10 }, () => tutorial.resumeTutorial(db, "player")));
    assert.equal(await npcs.countDocuments(), 1);
    assert.deepEqual((await npcs.findOne({ _id: donor._id }))!.players_met, ["player"]);
    await tutorial.restartTutorial(db, "player");
    await tutorial.resumeTutorial(db, "player", entered);
    assert.deepEqual((await npcs.findOne({ _id: donor._id }))!.players_met, ["player"], "A stale callback cannot reopen a visitor");
  });

  await t.test("retrying a transition repairs failed entry setup without advancing twice", async () => {
    const db = client.db("walkthrough-entry-retry");
    await seed(db, Step.TUTORIAL_GO_TO_GALLERY);
    const collection = db.collection.bind(db);
    const failure = t.mock.method(db, "collection", (name: string) => {
      if (name === "npcs") throw new Error("Visitor storage unavailable");
      return collection(name);
    });
    await assert.rejects(tutorial.fulfillTutorial(db, "player", Step.TUTORIAL_GO_TO_GALLERY, 3));
    failure.mock.restore();
    const recovered = await tutorial.fulfillTutorial(db, "player", Step.TUTORIAL_GO_TO_GALLERY, 3);
    assert.deepEqual(recovered, { step: Step.TUTORIAL_MEET_VISITOR, revision: 4 });
    assert.equal(await db.collection("npcs").countDocuments(), 1);
  });

  await t.test("claim and daily-crate APIs advance only after successful actions", async () => {
    const db = client.db("walkthrough-game-actions");
    const players = await seed(db, Step.TUTORIAL_CLAIM_ITEM);
    const claim = await loadRoute(db, "../app/api/play/items/[id]/claim/route.ts");
    const request = () => new Request("http://localhost", { method: "POST" });
    const context = { params: Promise.resolve({ id: "offer" }) };
    assert.equal((await claim(request(), context)).status, 409);
    assert.equal(getPlayerTutorial((await players.findOne({ _id: "player" }))!).step, Step.TUTORIAL_CLAIM_ITEM);
    await db.collection<{ _id: string }>("items").insertOne({
      _id: "offer", owner: "player", status: "unclaimed", values: { actual: 100 },
    });
    assert.equal((await (await claim(request(), context)).json()).tutorial.step, Step.TUTORIAL_DAILY_CRATE);
    await players.updateOne({ _id: "player" }, { $set: { "profile.daily_crate.time_zone": "UTC" } });
    let fail = true;
    const drop = await loadRoute(db, "../app/api/play/drop/route.ts", {
      "@/server/daily-crate": dailyCrate,
      "@/server/game-settings": { getGameplaySettings: async () => ({ active: {} }), getGameplayGenerationMap: () => ({}) },
      "@/server/gameplay": { generateDailyDrop: async () => {
        if (fail) throw new Error("Generation failed");
        return [{ _id: "daily-offer" }];
      } },
    });
    assert.equal((await drop(request())).status, 500);
    assert.equal(getPlayerTutorial((await players.findOne({ _id: "player" }))!).step, Step.TUTORIAL_DAILY_CRATE);
    fail = false;
    assert.equal((await (await drop(request())).json()).tutorial.step, Step.TUTORIAL_MODIFY_ITEM);
  });
});

test("cached tutorial progress rejects stale responses and tutorial Donors keep their standard name", () => {
  const current = { step: Step.TUTORIAL_REROLL_VALUE, revision: 11 };
  assert.equal(mergeTutorialProgress(current, { step: Step.TUTORIAL_SELECT_ITEM, revision: 0 }), current);
  assert.equal(mergeTutorialProgress(current, { step: Step.TUTORIAL_REROLL_ATTRIBUTE, revision: 10 }), current);
  assert.deepEqual(mergeTutorialProgress(current, { step: null, revision: 13 }), { step: null, revision: 13 });
  assert.equal(getNpcDisplayName({ tutorial: true, npc_name: "Tutorial Art Donor" }), "Art Donor");
  assert.equal(getNpcDisplayName({ tutorial: true, npc_name: "Art Donor" }), "Art Donor");
  assert.equal(getNpcDisplayName({ npc_name: "Unchanged Visitor" }), "Unchanged Visitor");
});
