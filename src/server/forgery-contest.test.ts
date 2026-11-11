import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import * as React from "react";
import ts from "typescript";

import * as contest from "./forgery-contest.ts";
import { getForgeryContestSchedule } from "./forgery-contest-schedule.ts";
import * as cardCatalog from "../components/item-cards/catalog.ts";
import { calculateItemValues, type GameItem, type ItemAttribute, type LootData } from "./gameplay.ts";
import { setupTestDb } from "./test-utils/db-setup.ts";
import { ITEM_SERIAL_INPUT_MAX_LENGTH } from "./item-serial-format.ts";
import {
  getForgeryContestFollowingSettlementAt,
  getForgeryContestMoneyReward,
  getForgeryContestNextSettlementAt,
  getForgeryContestSubmissionPermission,
  getForgeryContestVotePermission,
  isForgeryContestActionDay,
  rankForgeryContestEntries,
} from "./forgery-contest.ts";

test("Duper Tuesday voting day is Tuesday in New York", () => {
  assert.equal(
    isForgeryContestActionDay(new Date("2026-10-06T14:00:00.000Z")),
    true,
  );
  assert.equal(
    isForgeryContestActionDay(new Date("2026-10-07T03:00:00.000Z")),
    true,
  );
  assert.equal(
    isForgeryContestActionDay(new Date("2026-10-07T05:00:00.000Z")),
    false,
  );
});

test("Duper Tuesday phases switch at local midnight and noon across daylight saving time", () => {
  for (const [time, phase, nextPhaseAt] of [
    ["2026-10-06T03:59:59.999Z", "submissions", "2026-10-06T04:00:00.000Z"],
    ["2026-10-06T04:00:00.000Z", "voting", "2026-10-06T16:00:00.000Z"],
    ["2026-10-06T15:59:59.999Z", "voting", "2026-10-06T16:00:00.000Z"],
    ["2026-10-06T16:00:00.000Z", "results", "2026-10-07T04:00:00.000Z"],
    ["2026-10-07T03:59:59.999Z", "results", "2026-10-07T04:00:00.000Z"],
    ["2026-10-07T04:00:00.000Z", "submissions", "2026-10-13T04:00:00.000Z"],
    ["2026-11-03T04:59:59.999Z", "submissions", "2026-11-03T05:00:00.000Z"],
    ["2026-11-03T05:00:00.000Z", "voting", "2026-11-03T17:00:00.000Z"],
    ["2026-11-03T17:00:00.000Z", "results", "2026-11-04T05:00:00.000Z"],
    ["2026-11-04T05:00:00.000Z", "submissions", "2026-11-10T05:00:00.000Z"],
  ] as const) {
    const schedule = getForgeryContestSchedule(new Date(time));
    assert.deepEqual(schedule, {
      phase, nextPhaseAt, submissionsOpen: phase === "submissions", votingOpen: phase === "voting",
    }, time);
  }
});

test("Duper Tuesday settlement advances from Tuesday noon to Tuesday noon", () => {
  assert.equal(
    getForgeryContestNextSettlementAt(
      new Date("2026-10-06T14:00:00.000Z"),
    ).toISOString(),
    "2026-10-06T16:00:00.000Z",
  );
  assert.equal(
    getForgeryContestNextSettlementAt(
      new Date("2026-10-06T18:00:00.000Z"),
    ).toISOString(),
    "2026-10-13T16:00:00.000Z",
  );
  assert.equal(
    getForgeryContestNextSettlementAt(
      new Date("2026-11-03T18:00:00.000Z"),
    ).toISOString(),
    "2026-11-10T17:00:00.000Z",
  );
});

test("forced settlement advances beyond the current contest cycle", () => {
  assert.equal(
    getForgeryContestFollowingSettlementAt(
      "2026-10-06T16:00:00.000Z",
      new Date("2026-10-02T02:30:00.000Z"),
    ).toISOString(),
    "2026-10-13T16:00:00.000Z",
  );
});

test("Duper Tuesday cash rewards use submitted estimated value", () => {
  assert.equal(getForgeryContestMoneyReward(1, 17_613.9), 17_613);
  assert.equal(getForgeryContestMoneyReward(2, 17_613.9), 8_806);
  assert.equal(getForgeryContestMoneyReward(3, 17_613.9), 0);
});

test("Duper Tuesday ranking uses votes, submission time, then id", () => {
  const ranked = rankForgeryContestEntries([
    {
      id: "later",
      playerId: "p-2",
      submittedAt: "2026-10-06T14:01:00.000Z",
      votes: 4,
    },
    {
      id: "z-id",
      playerId: "p-3",
      submittedAt: "2026-10-06T14:00:00.000Z",
      votes: 4,
    },
    {
      id: "a-id",
      playerId: "p-1",
      submittedAt: "2026-10-06T14:00:00.000Z",
      votes: 4,
    },
    {
      id: "most-votes",
      playerId: "p-4",
      submittedAt: "2026-10-06T15:00:00.000Z",
      votes: 5,
    },
  ]);
  assert.deepEqual(
    ranked.map((entry) => entry.id),
    ["most-votes", "a-id", "z-id", "later"],
  );
});

test("an entry with one vote ranks above entries with no votes", () => {
  const ranked = rankForgeryContestEntries([
    {
      id: "zero-a",
      playerId: "p-1",
      submittedAt: "2026-10-01T12:00:00.000Z",
      votes: 0,
    },
    {
      id: "leader",
      playerId: "p-2",
      submittedAt: "2026-10-01T12:01:00.000Z",
      votes: 1,
    },
    {
      id: "zero-b",
      playerId: "p-3",
      submittedAt: "2026-10-01T12:02:00.000Z",
      votes: 0,
    },
  ]);

  assert.equal(ranked[0]?.id, "leader");
});

test("submission permissions enforce uniqueness and item eligibility", () => {
  assert.deepEqual(
    getForgeryContestSubmissionPermission({
      alreadyEntered: false,
      itemEligible: true,
    }),
    { allowed: true },
  );
  assert.match(
    getForgeryContestSubmissionPermission({
      alreadyEntered: true,
      itemEligible: true,
    }).reason ?? "",
    /already submitted/i,
  );
  assert.match(
    getForgeryContestSubmissionPermission({
      alreadyEntered: false,
      itemEligible: false,
    }).reason ?? "",
    /identified forgery/i,
  );
  assert.deepEqual(
    getForgeryContestSubmissionPermission({
      alreadyEntered: false,
      itemEligible: true,
    }),
    { allowed: true },
  );
});

test("vote permissions reject missing and self-owned entries", () => {
  assert.deepEqual(
    getForgeryContestVotePermission({
      entryExists: true,
      ownsEntry: false,
    }),
    { allowed: true },
  );
  assert.match(
    getForgeryContestVotePermission({
      entryExists: true,
      ownsEntry: true,
    }).reason ?? "",
    /own/i,
  );
  assert.match(
    getForgeryContestVotePermission({
      entryExists: false,
      ownsEntry: false,
    }).reason ?? "",
    /no longer available/i,
  );
});

async function seedContest(db: Db) {
  const attributes: ItemAttribute[] = Array.from({ length: 12 }, (_, index) => ({
    _id: `attribute-${index}`, title: `Attribute ${index}`, active: true,
    type: "regular", description: "", icon: "fa-user", npc_name: `Visitor ${index}`,
  }));
  await setupTestDb(db, "player-1", {
    playerProfile: { bankBalance: 0 },
    attributes,
    artworks: (["legendary", "rare", "uncommon", "common"] as const).map(rarity => ({
      _id: `${rarity}-art`, rarity, title: `${rarity} artwork`, active: true,
      artist: "Artist", artist_id: "artist", date: 2026, genre: "Abstract",
      medium: "Oil", width: 80, height: 100, value_scale: 0.5,
    })),
    uniqueAttributes: [{
      _id: "contest-effect", code: "REROLL_DISCOUNT", active: true,
      linked_attributes: attributes.slice(0, 2).map(attribute => attribute._id),
    }],
  });
  await db.collection("players").updateOne({ _id: "player-1" }, { $set: { screen_name: "Player 1" } });
  await db.collection<{ _id: string }>("players").insertMany([2, 3].map(index => ({
    _id: `player-${index}`, screen_name: `Player ${index}`, active: true,
    profile: { bank_balance: 0 },
  })));
}

type AdminContestRoutes = {
  GET: () => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
  PATCH: (request: Request) => Promise<Response>;
  DELETE: (request: Request) => Promise<Response>;
};

async function contestRoutes(db: Db, now?: Date) {
  let admin = true;
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/components/item-cards/catalog": cardCatalog,
    "@/server/forgery-contest": {
      ...contest,
      getForgeryContestPlayerView: (database: Db, playerId: string) => contest.getForgeryContestPlayerView(database, playerId, now),
      submitForgeryContestEntry: (database: Db, playerId: string, itemId: string) => contest.submitForgeryContestEntry(database, playerId, itemId, now),
      setForgeryContestVote: (database: Db, playerId: string, entryId: string) => contest.setForgeryContestVote(database, playerId, entryId, now),
    },
    "@/server/forgery-contest-schedule": { getForgeryContestSchedule: () => getForgeryContestSchedule(now) },
    "@/server/mongodb": { getDatabase: async () => db },
    "@/server/admin-api": { requireAdminApi: async () => admin
      ? { ok: true, session: { email: "admin@example.com" } }
      : { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) } },
    "@/server/player-api": { requirePlayerApi: async () => ({ ok: true, session: { playerId: "player-1" } }) },
  };
  async function load<T>(path: string): Promise<T> {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    for (const [, name] of code.matchAll(/require\("([^"]+)"\)/g)) {
      if (name in dependencies) continue;
      assert.ok(name.startsWith("@/server/") || name === "node:crypto", `Unexpected dependency: ${name}`);
      dependencies[name] = await import(name === "node:crypto"
        ? name
        : new URL(`./${name.slice("@/server/".length)}.ts`, import.meta.url).href);
    }
    return runInNewContext(`${code}\nexports`, {
      exports: {}, console, Date, structuredClone,
      require: (name: string) => {
        assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
        return dependencies[name];
      },
    }) as T;
  }
  return {
    admin: await load<AdminContestRoutes>("../app/api/admin/daily-events/forgery-contest/route.ts"),
    player: await load<{
      GET: () => Promise<Response>;
      POST: (request: Request) => Promise<Response>;
      PATCH: (request: Request) => Promise<Response>;
    }>("../app/api/play/daily-events/forgery-contest/route.ts"),
    forge: await load<{
      POST: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
    }>("../app/api/play/archives/[id]/forge/route.ts"),
    setAdmin: (allowed: boolean) => { admin = allowed; },
  };
}

function prizeRequest(method: string, body: unknown) {
  return new Request("http://localhost", { method, body: JSON.stringify(body) });
}

function prizeProperties(item: GameItem) {
  return {
    artworkId: item.artwork_id, condition: 0.65, itemLevel: 12,
    foil: true, unlocked: !item.unlocked, mint: false, seasonal: true, cardRenderer: "legacy",
  };
}

async function enterContest(db: Db, count: number, now: Date) {
  const view = await contest.getForgeryContestAdminView(db, now);
  for (let index = 0; index < count; index += 1) {
    const original = await db.collection<GameItem>("items").findOne({ _id: view.prizes[index].item._id });
    assert.ok(original);
    const entry: GameItem = {
      ...original, _id: `entry-${index + 1}`, owner: `player-${index + 1}`, source: "test forgery",
      authenticity: { ...original.authenticity, forgery: true, identified: true },
      values: { ...original.values, actual: (index + 1) * 1_000 },
    };
    await db.collection<GameItem>("items").insertOne(entry);
    await contest.submitForgeryContestEntry(db, entry.owner, entry._id, now);
  }
}

test("Duper Tuesday buffers preserve editable rewards through replacement and settlement", async (t) => {
  const now = new Date("2026-11-09T15:00:00.000Z");
  t.mock.timers.enable({ apis: ["Date"], now: now.getTime() });
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  t.after(async () => { await client.close(); await server.stop(); });

  await t.test("entries and votes are private until Tuesday, winners replace them at noon, and Wednesday starts a new round", async () => {
    const db = client.db("contest-phase-boundaries");
    await seedContest(db);
    await enterContest(db, 2, now);
    const entered = await db.collection<contest.ForgeryContestEntry>("forgery_contest_entries").find().toArray();
    const candidate = entered.find(entry => entry.player_id === "player-2")!;
    const before = await contestRoutes(db, new Date("2026-11-10T04:59:59.999Z"));
    const hidden = await (await before.player.GET()).json();
    assert.equal(hidden.phase, "submissions");
    assert.equal(hidden.submissionsOpen, true);
    assert.equal(hidden.votingOpen, false);
    assert.deepEqual(hidden.entries, []);
    assert.deepEqual(hidden.lastWinners, []);
    assert.ok(hidden.currentEntryId);
    assert.equal((await before.player.PATCH(prizeRequest("PATCH", { entryId: candidate._id }))).status, 409);

    const voting = await contestRoutes(db, new Date("2026-11-10T05:00:00.000Z"));
    const revealed = await (await voting.player.GET()).json();
    assert.equal(revealed.phase, "voting");
    assert.equal(revealed.submissionsOpen, false);
    assert.equal(revealed.votingOpen, true);
    assert.equal(revealed.entries.length, 2);
    assert.deepEqual(revealed.eligibleItems, []);
    assert.equal((await voting.player.POST(prizeRequest("POST", { itemId: "entry-1" }))).status, 409);
    assert.equal((await voting.player.PATCH(prizeRequest("PATCH", { entryId: candidate._id }))).status, 200);

    const noon = await contestRoutes(db, new Date("2026-11-10T17:00:00.000Z"));
    const results = await (await noon.player.GET()).json();
    assert.equal(results.phase, "results");
    assert.equal(results.submissionsOpen, false);
    assert.equal(results.votingOpen, false);
    assert.deepEqual(results.entries, []);
    assert.equal(results.lastWinners.length, 2);
    assert.equal(results.lastWinners[0].playerId, "player-2");
    assert.equal(results.currentEntryId, null);
    assert.equal((await noon.player.POST(prizeRequest("POST", { itemId: "entry-1" }))).status, 409);
    assert.equal((await noon.player.PATCH(prizeRequest("PATCH", { entryId: candidate._id }))).status, 409);

    const late = await contest.getForgeryContestPlayerView(db, "player-1", new Date("2026-11-11T04:59:59.999Z"));
    assert.equal(late.lastWinners.length, 2);
    const reopenedAt = new Date("2026-11-11T05:00:00.000Z");
    const wednesday = await contestRoutes(db, reopenedAt);
    const reopened = await (await wednesday.player.GET()).json();
    assert.equal(reopened.phase, "submissions");
    assert.equal(reopened.submissionsOpen, true);
    assert.equal(reopened.votingOpen, false);
    assert.equal(reopened.prizes.length, 3);
    assert.deepEqual(reopened.entries, []);
    assert.deepEqual(reopened.lastWinners, []);
    const work = (await db.collection<GameItem>("items").findOne({ _id: "entry-1" }))!;
    await db.collection<GameItem>("items").insertOne({ ...work, _id: "next-round-entry", owner: "player-1" });
    assert.equal((await wednesday.player.POST(prizeRequest("POST", { itemId: "next-round-entry" }))).status, 200);
    assert.ok((await (await wednesday.player.GET()).json()).currentEntryId);
    const state = await db.collection<contest.ForgeryContestState>("metadata").findOne({ _id: contest.FORGERY_CONTEST_STATE_ID });
    assert.equal(state?.last_winners.length, 2, "past awards remain stored, not visible to players");
  });

  await t.test("create-and-submit charges once, transfers the created work, and rejects duplicate or Tuesday entry before forging", async () => {
    const db = client.db("contest-forge-entry");
    await seedContest(db);
    await db.collection("players").updateOne({ _id: "player-1" }, {
      $set: { "profile.bank_balance": 1_000_000, "profile.inventory_cap": 20 },
    });
    await db.collection<{ _id: string }>("player_artwork_archives").insertOne({
      _id: "archive", owner: "player-1", artwork_id: "common-art",
      entries: [{ source_item_id: "original", modifiers: ["standard"], art_style: "museum", value: 1000, archived_at: now.toISOString() }],
      combined_value: 1000, archived_count: 1, created_at: now.toISOString(), updated_at: now.toISOString(),
    });
    const api = await contestRoutes(db, now);
    const context = { params: Promise.resolve({ id: "archive" }) };
    const payload = { modifiers: [], artStyle: "museum", serialNumber: "123-000042", submitToContest: true };
    const createdResponse = await api.forge.POST(prizeRequest("POST", payload), context);
    const created = await createdResponse.json();
    assert.equal(createdResponse.status, 200, JSON.stringify(created));
    assert.equal(created.submittedToContest, true);
    assert.match(created.message, /submitted to Duper Tuesday/);
    const entry = await db.collection<contest.ForgeryContestEntry>("forgery_contest_entries").findOne({ player_id: "player-1", pending: false });
    assert.ok(entry);
    const work = await db.collection<GameItem>("items").findOne({ _id: entry.item_id });
    assert.equal(work?.owner, contest.FORGERY_CONTEST_OWNER_ID);
    assert.equal(work?.serial_number, 42);
    assert.equal(work?.serial_prefix, 123);
    assert.equal((await db.collection("players").findOne({ _id: "player-1" }))?.profile.bank_balance, 1_000_000 - created.cost);
    const itemCount = await db.collection("items").countDocuments();
    const duplicate = await api.forge.POST(prizeRequest("POST", payload), context);
    assert.equal(duplicate.status, 409);
    assert.match((await duplicate.json()).error, /already submitted/);
    const tuesday = await contestRoutes(db, new Date("2026-11-10T05:00:00.000Z"));
    const closed = await tuesday.forge.POST(prizeRequest("POST", payload), context);
    assert.equal(closed.status, 409);
    assert.match((await closed.json()).error, /closed on Tuesdays/);
    assert.equal(await db.collection("items").countDocuments(), itemCount);
    assert.equal((await db.collection("players").findOne({ _id: "player-1" }))?.profile.bank_balance, 1_000_000 - created.cost);
    const regular = await tuesday.forge.POST(prizeRequest("POST", { ...payload, submitToContest: false }), context);
    assert.equal(regular.status, 200, JSON.stringify(await regular.clone().json()));
    assert.equal((await regular.json()).submittedToContest, false);
    assert.equal(await db.collection("items").countDocuments({ owner: "player-1" }), 1);
  });

  await t.test("concurrent initialization and legacy upgrades preserve active prizes and protect buffered items from cleanup", async () => {
    const db = client.db("contest-buffer-bootstrap");
    await seedContest(db);
    const [first, second] = await Promise.all([
      contest.getForgeryContestAdminView(db, now),
      contest.getForgeryContestAdminView(db, now),
    ]);
    assert.deepEqual(first, second);
    assert.equal(first.prizes.length, 3);
    assert.equal(first.bufferPrizes.length, 6);
    assert.equal(await db.collection("items").countDocuments({ owner: contest.FORGERY_CONTEST_OWNER_ID }), 9);
    for (const place of [1, 2, 3] as const) {
      const buffer = first.bufferPrizes.filter(prize => prize.place === place);
      assert.equal(buffer.length, 2);
      assert.ok(buffer.every(prize => prize.item.mint && prize.item.card_renderer && prize.item.card_renderer !== "museum"));
      assert.ok(buffer.every(prize => prize.item.artwork.rarity === (["legendary", "rare", "uncommon"] as const)[place - 1]));
    }
    const oldBufferIds = first.bufferPrizes.map(prize => prize.item._id);
    await db.collection("metadata").updateOne({ _id: contest.FORGERY_CONTEST_STATE_ID }, { $unset: { buffer_prizes: "" } });
    await db.collection("items").deleteMany({ _id: { $in: oldBufferIds } });
    const upgraded = await contest.getForgeryContestAdminView(db, now);
    assert.deepEqual(upgraded.prizes, first.prizes);
    assert.equal(upgraded.bufferPrizes.length, 6);
    const bufferIds = upgraded.bufferPrizes.map(prize => prize.item._id);
    await db.collection("items").updateMany({ _id: { $in: bufferIds } }, {
      $set: { date_created: new Date(now.getTime() - 20 * 60_000).toISOString() },
    });
    const retained = await contest.getForgeryContestAdminView(db, now);
    assert.deepEqual(retained.bufferPrizes.map(prize => prize.item._id), bufferIds);
    assert.equal(await db.collection("items").countDocuments({ _id: { $in: bufferIds } }), 6);
  });

  await t.test("legacy queues shrink to their first two prizes per place without changing active or retained prizes", async () => {
    const db = client.db("contest-buffer-trimming");
    await seedContest(db);
    const initial = await contest.getForgeryContestAdminView(db, now);
    for (const place of [1, 2, 3] as const) {
      const source = initial.bufferPrizes.find(prize => prize.place === place)!;
      const item = (await db.collection<GameItem>("items").findOne({ _id: source.item._id }))!;
      const extraId = `legacy-extra-${place}`;
      await db.collection<GameItem>("items").insertOne({ ...item, _id: extraId });
      await db.collection<contest.ForgeryContestState>("metadata").updateOne(
        { _id: contest.FORGERY_CONTEST_STATE_ID },
        { $push: { buffer_prizes: { place, item_id: extraId } } },
      );
    }
    const [first, second] = await Promise.all([
      contest.getForgeryContestAdminView(db, now),
      contest.getForgeryContestAdminView(db, now),
    ]);
    assert.deepEqual(first.prizes, initial.prizes);
    assert.deepEqual(first.bufferPrizes, initial.bufferPrizes);
    assert.deepEqual(second.bufferPrizes, initial.bufferPrizes);
  });

  await t.test("buffer edits retain values and serials, become visible prizes, and reach all three winners unchanged", async () => {
    const db = client.db("contest-buffer-awards");
    await seedContest(db);
    const api = await contestRoutes(db);
    const initial = await contest.getForgeryContestAdminView(db, now);
    const editedIds: string[] = [];
    for (const place of [1, 2, 3] as const) {
      const prize = initial.bufferPrizes.find(prize => prize.place === place)!;
      const properties = {
        ...prizeProperties(prize.item), itemLevel: 10 + place,
        artworkId: place === 1 ? "common-art" : prize.item.artwork_id,
        mint: place === 3,
      };
      const response = await api.admin.PATCH(prizeRequest("PATCH", {
        ...properties, pool: "buffer", place, itemId: prize.item._id,
      }));
      assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
      const saved = await db.collection<GameItem>("items").findOne({ _id: prize.item._id });
      assert.ok(saved);
      assert.equal(saved.level, 10 + place);
      assert.equal(saved.condition, place === 3 ? 1 : 0.65);
      assert.equal(saved.mint, place === 3);
      assert.equal(saved.foil, true);
      assert.equal(saved.seasonal, true);
      assert.equal(saved.card_renderer, "legacy");
      const artwork = (await db.collection("artworks").findOne({ _id: saved.artwork_id }))!;
      const metadata = (await db.collection<{ _id: string; loot_data: LootData }>("metadata").findOne({ _id: "loot-data" }))!;
      assert.deepEqual(saved.values, calculateItemValues(saved, artwork as typeof prize.item.artwork, metadata.loot_data));
      if (place === 1) {
        assert.equal(saved.serial_number, artwork.serial_counter);
        assert.deepEqual(saved.attributes.special, []);
      } else {
        assert.equal(saved.serial_number, prize.item.serial_number);
      }
      editedIds.push(prize.item._id);
      const replacement = await api.admin.POST(prizeRequest("POST", { place, action: "replace" }));
      assert.equal(replacement.status, 200);
      assert.equal(await db.collection("items").findOne({ _id: initial.prizes.find(prize => prize.place === place)!.item._id }), null);
    }
    const publicResponse = await api.player.GET();
    assert.equal(publicResponse.status, 200);
    const publicView = await publicResponse.json();
    assert.deepEqual(publicView.prizes.map((prize: { item: GameItem }) => prize.item._id), editedIds);
    assert.equal(publicView.bufferPrizes, undefined);
    const beforeDraw = await contest.getForgeryContestAdminView(db, now);
    const nextIds = ([1, 2, 3] as const).map(place => beforeDraw.bufferPrizes.find(prize => prize.place === place)!.item._id);
    await enterContest(db, 3, now);
    const votingAt = new Date("2026-11-10T05:00:00.000Z");
    const playerView = await contest.getForgeryContestPlayerView(db, "player-1", votingAt);
    const entry = (id: string) => playerView.entries.find(entry => entry.playerId === id)!.id;
    await contest.setForgeryContestVote(db, "player-2", entry("player-1"), votingAt);
    await contest.setForgeryContestVote(db, "player-3", entry("player-1"), votingAt);
    await contest.setForgeryContestVote(db, "player-1", entry("player-2"), votingAt);
    const settled = await contest.drawForgeryContestForDebug(db, votingAt);
    assert.deepEqual(settled.prizes.map(prize => prize.item_id), nextIds);
    assert.equal(settled.buffer_prizes.length, 6);
    for (const winner of settled.last_winners) {
      const prize = await db.collection<GameItem>("items").findOne({ _id: editedIds[winner.place - 1] });
      assert.equal(prize?.owner, winner.player_id);
      assert.equal(prize?.status, "claimed");
      assert.equal(prize?.level, 10 + winner.place);
      assert.equal(prize?.foil, true);
      assert.equal(prize?.card_renderer, "legacy");
      assert.equal(winner.prize_item_snapshot._id, prize?._id);
      assert.equal(winner.prize_item_snapshot.level, prize?.level);
      assert.equal(settled.buffer_prizes.filter(prize => prize.place === winner.place).length, 2);
    }
    assert.equal(settled.last_winners.length, 3);
    assert.deepEqual(settled.last_winners.map(winner => winner.money_reward), [1_000, 1_000, 0]);
    await contest.settleForgeryContestIfDue(db, votingAt);
    const balances = await db.collection("players").find().sort({ _id: 1 }).toArray();
    assert.deepEqual(balances.map(player => player.profile.bank_balance), [1_000, 1_000, 0]);
    assert.equal(await db.collection("player_notifications").countDocuments(), 3);
  });

  await t.test("buffers stay two prizes deep and reject protected or unauthorized edits", async () => {
    const db = client.db("contest-buffer-controls");
    await seedContest(db);
    const api = await contestRoutes(db);
    const view = await contest.getForgeryContestAdminView(db, now);
    const prize = view.bufferPrizes.find(prize => prize.place === 2)!;
    const properties = { ...prizeProperties(prize.item), itemId: prize.item._id, place: 2, pool: "buffer" };
    assert.equal((await api.admin.DELETE(prizeRequest("DELETE", { itemId: prize.item._id, place: 2 }))).status, 409);
    const beforeExpansion = await db.collection("items").find().sort({ _id: 1 }).toArray();
    const expansion = await api.admin.POST(prizeRequest("POST", { action: "create", place: 2 }));
    assert.equal(expansion.status, 409);
    assert.match((await expansion.json()).error, /limited to 2 buffered prizes/);
    assert.deepEqual(await db.collection("items").find().sort({ _id: 1 }).toArray(), beforeExpansion);
    const remaining = await contest.getForgeryContestAdminView(db, now);
    assert.equal(remaining.bufferPrizes.filter(prize => prize.place === 2).length, 2);
    const first = remaining.bufferPrizes.find(prize => prize.place === 1)!;
    const body = { ...properties, place: 1, itemId: first.item._id };
    for (const changes of [
      { condition: -0.1 }, { condition: 1.1 }, { itemLevel: 0 }, { itemLevel: 1.5 },
      { itemLevel: 101 }, { cardRenderer: "museum" }, { cardRenderer: "unknown" }, { place: 4 },
    ]) {
      assert.equal((await api.admin.PATCH(prizeRequest("PATCH", { ...body, ...changes }))).status, 400);
    }
    for (const changes of [{ pool: "prizes" }, { place: 2 }, { itemId: view.prizes[0].item._id }]) {
      assert.equal((await api.admin.PATCH(prizeRequest("PATCH", { ...body, ...changes }))).status, 409);
    }
    const before = await db.collection("items").find().sort({ _id: 1 }).toArray();
    await db.collection("metadata").updateOne({ _id: contest.FORGERY_CONTEST_STATE_ID }, {
      $set: { settlement_lock: { token: "other-operation", cycle_id: "test", expires_at: new Date(Date.now() + 60_000).toISOString() } },
    });
    assert.equal((await api.admin.PATCH(prizeRequest("PATCH", body))).status, 409);
    assert.equal((await api.admin.POST(prizeRequest("POST", { place: 1 }))).status, 409);
    assert.equal((await api.admin.DELETE(prizeRequest("DELETE", { place: 1, itemId: first.item._id }))).status, 409);
    assert.deepEqual(await db.collection("items").find().sort({ _id: 1 }).toArray(), before);
    api.setAdmin(false);
    assert.equal((await api.admin.GET()).status, 401);
    for (const method of ["POST", "PATCH", "DELETE"] as const) {
      assert.equal((await api.admin[method](prizeRequest(method, body))).status, 401);
    }
  });

  await t.test("failed settlement restores existing prizes and buffers and a retry awards only once", async (t) => {
    const db = client.db("contest-buffer-rollback");
    await seedContest(db);
    await enterContest(db, 1, now);
    const state = (await db.collection<contest.ForgeryContestState>("metadata").findOne({ _id: contest.FORGERY_CONTEST_STATE_ID }))!;
    const before = await db.collection("items").find().sort({ _id: 1 }).toArray();
    const metadata = db.collection("metadata");
    const collection = db.collection.bind(db);
    const updateOne = metadata.updateOne.bind(metadata);
    let injected = false;
    t.mock.method(db, "collection", ((name: string) => name === "metadata" ? metadata : collection(name)) as Db["collection"]);
    t.mock.method(metadata, "updateOne", (async (...args: Parameters<typeof metadata.updateOne>) => {
      const update = args[1] as { $set?: { cycle_id?: string } };
      if (update.$set?.cycle_id && !injected) {
        injected = true;
        throw new Error("Synthetic contest state failure");
      }
      return updateOne(...args);
    }) as typeof metadata.updateOne);
    await assert.rejects(contest.drawForgeryContestForDebug(db, now), /Synthetic contest state failure/);
    const restored = await db.collection<contest.ForgeryContestState>("metadata").findOne({ _id: contest.FORGERY_CONTEST_STATE_ID });
    assert.deepEqual(restored?.prizes, state.prizes);
    assert.deepEqual(restored?.buffer_prizes, state.buffer_prizes);
    assert.equal(restored?.settlement_lock, undefined);
    assert.deepEqual(await db.collection("items").find().sort({ _id: 1 }).toArray(), before);
    const settled = await contest.settleForgeryContestIfDue(db, now);
    assert.equal(settled.last_winners.length, 1);
    assert.equal(settled.last_winners[0].prize_item_snapshot._id, state.prizes[0].item_id);
    assert.equal(settled.prizes[0].item_id, state.buffer_prizes.find(prize => prize.place === 1)?.item_id);
    assert.equal((await db.collection("players").findOne({ _id: "player-1" }))?.profile.bank_balance, 1_000);
    assert.equal(await db.collection("player_notifications").countDocuments(), 1);
    for (const prize of state.prizes.slice(1)) {
      assert.equal(await db.collection("items").findOne({ _id: prize.item_id }), null);
    }
  });
});

async function loadComponent(path: string, name: string, context: Record<string, unknown>) {
  const text = await readFile(new URL(path, import.meta.url), "utf8");
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = source.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(component);
  const code = ts.transpileModule(component.getText(source), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  return runInNewContext(`${code}\n${name}`, { exports: {}, React, window: new EventTarget(), Event, ...context }) as
    (props: Record<string, unknown>) => React.ReactElement;
}

function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  const result: React.ReactElement<Record<string, unknown>>[] = [];
  React.Children.forEach(node, child => {
    if (React.isValidElement<{ children?: React.ReactNode }>(child)) {
      result.push(child);
      result.push(...elements(child.props.children));
    }
  });
  return result;
}

test("the Duper Tuesday daily-event panel displays all current rewards as read-only cards", async () => {
  const ItemCard = () => null;
  const prizes = [1, 2, 3].map(place => ({ place, item: { _id: `prize-${place}` } }));
  const view = {
    phase: "submissions", nextPhaseAt: "2026-11-10T05:00:00.000Z",
    prizes, entries: [], eligibleItems: [], currentEntryId: null, lastWinners: [],
    submissionsOpen: true, votingOpen: false, nextSettlementAt: new Date().toISOString(),
  };
  let stateIndex = 0;
  const panel = await loadComponent("../components/daily-events-panel.tsx", "ForgeryContestPanel", {
    ItemCard,
    ActionMessages: () => null,
    useState: (initial: unknown) => [stateIndex++ === 0 ? view : initial, () => {}],
    useCallback: (callback: unknown) => callback,
    useEffect: () => {},
  });
  const children = elements(panel({ impersonating: false, legendaryAttributes: [], playerId: "viewer" }));
  const headings = children.filter(child => child.type === "h4" || child.type === "h5")
    .map(child => React.Children.toArray(child.props.children as React.ReactNode).join(""));
  for (const heading of ["Your submission", "Contest rewards", "First place", "Second place", "Third place"]) {
    assert.ok(headings.includes(heading), heading);
  }
  for (const label of ["Your submission", "Contest rewards"]) {
    assert.ok(children.some(child => child.type === "section" && child.props["aria-label"] === label), label);
  }
  assert.ok(!children.some(child => child.props["aria-label"] === "Current entries and voting"));
  const cards = children.filter(child => child.type === ItemCard);
  assert.deepEqual(cards.map(card => (card.props.item as GameItem)._id), ["prize-1", "prize-2", "prize-3"]);
  for (const card of cards) {
    const permissions = card.props.permissions as { canManageItem: boolean; canCustomizeCosmetic: boolean };
    assert.equal(permissions.canManageItem, false);
    assert.equal(permissions.canCustomizeCosmetic, false);
  }
});

test("the compact contest panel preserves submission and voting controls and shows submitted state", async () => {
  const view = {
    phase: "submissions", nextPhaseAt: "2026-11-10T05:00:00.000Z",
    prizes: [], lastWinners: [], currentEntryId: null as string | null, votedEntryId: "voted",
    submissionsOpen: true, votingOpen: false, nextSettlementAt: new Date().toISOString(),
    eligibleItems: [{ _id: "owned-forgery" }],
    entries: [
      { id: "own", playerId: "viewer", playerName: "You", item: { _id: "own-item" } },
      { id: "voted", playerId: "other", playerName: "Other", item: { _id: "voted-item" } },
      { id: "candidate", playerId: "candidate", playerName: "Candidate", item: { _id: "candidate-item" } },
    ],
  };
  let stateIndex = 0;
  const requests: { method: string; body: unknown }[] = [];
  const panel = await loadComponent("../components/daily-events-panel.tsx", "ForgeryContestPanel", {
    ItemCard: () => null, ActionMessages: () => null,
    useState: (initial: unknown) => [stateIndex++ === 0 ? view : initial, () => {}],
    useCallback: (callback: unknown) => callback, useEffect: () => {},
    fetch: async (_url: string, options?: { method: string; body: string }) => {
      if (options?.method) requests.push({ method: options.method, body: JSON.parse(options.body) });
      return Response.json(options?.method ? { message: "Saved." } : view);
    },
  });
  const render = () => {
    stateIndex = 0;
    return elements(panel({ impersonating: false, legendaryAttributes: [], playerId: "viewer" }));
  };
  let children = render();
  const button = (label: string) => children.find(child => child.type === "button" && child.props.children === label)!;
  assert.equal(button("Change vote"), undefined);
  await (button("Submit this forgery").props.onClick as () => Promise<void>)();
  view.phase = "voting";
  view.submissionsOpen = false;
  view.votingOpen = true;
  children = render();
  assert.equal(button("Submit this forgery"), undefined);
  assert.equal(button("Your entry").props.disabled, true);
  assert.equal(button("Your vote").props.disabled, true);
  assert.equal(button("Change vote").props.disabled, false);
  await (button("Change vote").props.onClick as () => Promise<void>)();
  assert.deepEqual(requests, [
    { method: "POST", body: { itemId: "owned-forgery" } },
    { method: "PATCH", body: { entryId: "candidate" } },
  ]);
  view.submissionsOpen = false;
  view.votingOpen = false;
  const closed = render();
  assert.ok(closed.filter(child => child.type === "button" &&
    ["Submit this forgery", "Change vote"].includes(child.props.children as string))
    .every(child => child.props.disabled));
  view.currentEntryId = "own";
  view.phase = "submissions";
  const submitted = render();
  const submission = submitted.find(child => child.type === "section" && child.props["aria-label"] === "Your submission")!;
  assert.ok(elements(submission).some(child => child.type === "span" && child.props.children === "Submitted"));
  assert.ok(!submitted.some(child => child.type === "button" && child.props.children === "Submit this forgery"));
});

test("Tuesday results are an expanded winner celebration, not entries or a collapsible history", async () => {
  const ItemCard = () => null;
  const view = {
    phase: "results", nextPhaseAt: "2026-11-11T05:00:00.000Z",
    submissionsOpen: false, votingOpen: false, nextSettlementAt: "2026-11-17T17:00:00.000Z",
    prizes: [{ place: 1, item: { _id: "next-prize" } }],
    currentEntryId: null, eligibleItems: [{ _id: "owned" }], entries: [],
    lastWinners: [{ place: 1, playerName: "Winner", votes: 42, item: { _id: "winning-work" } }],
  };
  let index = 0;
  const panel = await loadComponent("../components/daily-events-panel.tsx", "ForgeryContestPanel", {
    ItemCard, ActionMessages: () => null,
    useState: (initial: unknown) => [index++ === 0 ? view : initial, () => {}],
    useCallback: (callback: unknown) => callback, useEffect: () => {},
  });
  const render = () => {
    index = 0;
    return elements(panel({ impersonating: false, legendaryAttributes: [], playerId: "viewer" }));
  };
  const children = render();
  assert.ok(children.some(child => child.type === "section" && child.props["aria-label"] === "Duper Tuesday winners"));
  assert.ok(!children.some(child => child.type === "details" || child.type === "summary"));
  assert.ok(!children.some(child => child.props["aria-label"] === "Your submission" || child.props["aria-label"] === "Current entries and voting"));
  assert.deepEqual(children.filter(child => child.type === ItemCard).map(child => (child.props.item as GameItem)._id), ["winning-work"]);
  view.phase = "submissions";
  view.submissionsOpen = true;
  const reopened = render();
  assert.ok(!reopened.some(child => child.props["aria-label"] === "Duper Tuesday winners"));
  assert.ok(reopened.some(child => child.props["aria-label"] === "Your submission"));
  assert.deepEqual(reopened.filter(child => child.type === ItemCard).map(child => (child.props.item as GameItem)._id), ["owned", "next-prize"]);
});

test("forging offers a direct Duper Tuesday entry only outside Tuesdays and before the player has entered", async () => {
  for (const [time, entered, allowed] of [
    ["2026-11-10T04:59:59.999Z", false, true],
    ["2026-11-10T05:00:00.000Z", false, false],
    ["2026-11-10T17:00:00.000Z", false, false],
    ["2026-11-11T04:59:59.999Z", false, false],
    ["2026-11-11T05:00:00.000Z", false, true],
    ["2026-11-09T15:00:00.000Z", true, false],
  ] as const) {
    let state = 0;
    const requests: Record<string, unknown>[] = [];
    const editor = await loadComponent("../components/forgery-dialog.tsx", "ForgeryEditor", {
      useState: (initial: unknown) => {
        state++;
        return [state === 7
          ? { submissionsOpen: true, currentEntryId: entered ? "submitted" : null }
          : typeof initial === "function" ? initial() : initial, () => {}];
      },
      useMemo: (callback: () => unknown) => callback(), useEffect: () => {},
      useCardCosmetics: () => [], getCardCosmetic: cardCatalog.getCardCosmetic,
      getForgeryContestSchedule: () => getForgeryContestSchedule(new Date(time)),
      createRandomForgerySerial: () => ({ serial_number: 42, serial_prefix: 123 }),
      formatItemSerialNumber: () => "123-000042",
      parseItemSerialNumber: () => ({ serial_number: 42, serial_prefix: 123 }),
      ITEM_SERIAL_INPUT_MAX_LENGTH,
      createPreviewItem: () => ({ artwork: { rarity: "common" }, authenticity: {} }),
      calculateForgeCostForSelection: () => 100,
      MODIFIERS: [], HEAT_CONTEXTS: [],
      CARD_RENDERERS: { museum: () => null },
      KnownForgeryWatermark: () => null, RenderCardPreview: () => null,
      fetch: async (_url: string, options: { body: string }) => {
        requests.push(JSON.parse(options.body));
        return Response.json({ message: "Created." });
      },
    });
    const children = elements(editor({
      archive: { _id: "archive", artwork_id: "art", modifiers: [], artStyles: [] },
      inventoryFull: false, legendaryAttributes: [], onForged: () => {},
      pricing: { seasonalArtworkIds: [] },
    }));
    const direct = children.find(child => child.type === "button" && child.props.children === "Create and submit to Duper Tuesday")!;
    const regular = children.find(child => child.type === "button" && child.props.className === "art-style-dialog-apply red")!;
    assert.equal(direct.props.disabled, !allowed, time);
    assert.equal(regular.props.disabled, false, "regular forging remains available on Tuesdays");
    if (allowed) {
      await (direct.props.onClick as () => Promise<void>)();
      assert.deepEqual(requests[0], { modifiers: [], artStyle: "museum", serialNumber: "123-000042", submitToContest: true });
    }
  }
});

test("contest admin retains editable two-prize buffers without expansion or removal controls", async () => {
  const PrizeEditor = () => null;
  const admin = await loadComponent("../app/admin/forgery-contest/forgery-contest-admin.tsx", "ForgeryContestAdmin", {
    ItemCard: () => null, PrizeEditor,
    PLACE_NAMES: { 1: "First place", 2: "Second place", 3: "Third place" },
    useState: (initial: unknown) => [initial, () => {}],
    useRouter: () => ({ refresh: () => {} }),
  });
  const children = elements(admin({
    artworks: [], prizes: [], minimumBufferCount: 2,
    nextSettlementAt: new Date().toISOString(),
    bufferPrizes: [1, 2, 3].flatMap(place => [0, 1].map(index => ({ place, item: { _id: `${place}-${index}` } }))),
  }));
  const editors = children.filter(child => child.type === PrizeEditor);
  assert.equal(editors.length, 6);
  assert.ok(editors.every(editor => editor.props.canRemove === false));
  assert.ok(!children.some(child => child.type === "button" && child.props.children === "Add buffered prize"));
});

test("the shared buffer editor targets the selected contest tier without changing lottery requests", async () => {
  const work = {
    _id: "buffer-item", artwork_id: "art", condition: 0.7, level: 8, lottery: 0,
    foil: true, unlocked: false, mint: false, seasonal: false, card_renderer: "legacy",
  };
  for (const contestPlace of [undefined, 2]) {
    const requests: { endpoint: string; method: string; body: Record<string, unknown> }[] = [];
    const editor = await loadComponent("../app/admin/raffle-reward-form.tsx", "PrizeEditor", {
      useState: (initial: unknown) => [initial, () => {}],
      useRouter: () => ({ refresh: () => {} }),
      useCardCosmetics: () => [{ id: "legacy", name: "Legacy" }],
      ItemCard: () => null,
      Flag: () => null,
      fetch: async (endpoint: string, options: { method: string; body: string }) => {
        requests.push({ endpoint, method: options.method, body: JSON.parse(options.body) });
        return Response.json({ item: work });
      },
    });
    const children = elements(editor({
      artworks: [{ _id: "art", rarity: "common", title: "Artwork", artist: "Artist" }],
      canRemove: true, contestPlace, index: 0, prize: { item: work, potency: 4 },
    }));
    const button = (label: string) => children.find(child => child.type === "button" && child.props.children === label)!;
    await (button("Save and refresh preview").props.onClick as () => Promise<void>)();
    await (button("Remove from buffer").props.onClick as () => Promise<void>)();
    assert.deepEqual(requests.map(request => request.method), ["PATCH", "DELETE"]);
    for (const request of requests) {
      assert.equal(request.endpoint, contestPlace ? "/api/admin/daily-events/forgery-contest" : "/api/admin/lottery");
      assert.equal(request.body.itemId, work._id);
      assert.equal(request.body.place, contestPlace);
    }
    assert.equal(requests[0].body.condition, 0.7);
    assert.equal(requests[0].body.potency, 4);
    assert.equal(requests[0].body.pool, "buffer");
  }
});
