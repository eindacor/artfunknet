import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import ts from "typescript";

import { migrateDailyCrateClaims } from "../../scripts/database-migrations.mjs";
import * as tutorialElements from "../shared/tutorial.ts";
import {
  getDailyCrateItemCount,
  getPlayerDailyCrateState,
  initializeDailyCrateTimeZone,
  normalizeDailyCrateTimeZone,
  releaseDailyCrateClaim,
  reserveDailyCrateClaim,
  type DailyCrateMetadata,
} from "./daily-crate.ts";

type Player = {
  _id: string;
  active: boolean;
  profile: {
    level: number;
    last_drop?: string;
    daily_crate?: DailyCrateMetadata;
    view_settings?: { cratePurchaseCount: number };
  };
};

async function loadDropRoute(
  database: Db,
  generateDailyDrop: (db: Db, playerId: string, level: number, options: { itemCount: number }) => Promise<{ _id: string }[]>,
) {
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/server/daily-crate": {
      getDailyCrateItemCount, initializeDailyCrateTimeZone, normalizeDailyCrateTimeZone,
      releaseDailyCrateClaim, reserveDailyCrateClaim,
    },
    "@/server/game-settings": {
      getGameplaySettings: async () => ({ active: { dailyDropCount: 50, mintValueMultiplier: 1 }, debugEnabled: false }),
      getGameplayGenerationMap: () => ({}),
    },
    "@/server/gameplay": { generateDailyDrop },
    "@/server/mongodb": { getDatabase: async () => database },
    "@/server/item-expiration": { getUnclaimedItemExpiration: () => "2999-01-01T00:00:00.000Z" },
    "@/server/player-api": { requirePlayerApi: async () => ({ ok: true, session: { playerId: "owner" } }) },
    "@/server/tutorial": { recordTutorialAction: async () => undefined },
    "@/shared/tutorial": tutorialElements,
  };
  const code = ts.transpileModule(
    await readFile(new URL("../app/api/play/drop/route.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  return runInNewContext(`${code}\nexports.POST`, {
    exports: {}, Date, console: { error() {} },
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected daily-drop dependency: ${name}`);
      return dependencies[name];
    },
  }) as () => Promise<Response>;
}

test("daily crates migrate legacy history, save one timezone and reserve one claim per local-noon period", async (t) => {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  t.after(async () => { await client.close(); await server.stop(); });

  await t.test("migration removes obsolete fields without resetting existing claims or player options", async () => {
    const db = client.db("daily-crate-migration");
    const players = db.collection<Player>("players");
    await players.insertMany([
      { _id: "legacy", active: true, profile: {
        level: 5, last_drop: "2026-11-01T16:59:59.000Z", view_settings: { cratePurchaseCount: 7 },
      } },
      { _id: "current", active: true, profile: {
        level: 5, last_drop: "2026-10-31T10:00:00.000Z",
        daily_crate: { time_zone: "America/New_York", last_claimed_at: "2026-11-01T17:00:00.000Z" },
      } },
    ]);
    await db.collection<{ _id: string; gameplay?: unknown }>("metadata").insertOne({
      _id: "gameplay-settings",
      gameplay: {
        daily_drop_cooldown_minutes: 1440,
        configs: {
          actual: { daily_drop_cooldown_minutes: 1440, daily_drop_count: 50 },
          debug: { daily_drop_cooldown_minutes: 1, daily_drop_count: 20 },
        },
      },
    });
    assert.deepEqual(await migrateDailyCrateClaims(db), { playersUpdated: 2, settingsUpdated: 1 });
    const legacy = await players.findOne({ _id: "legacy" });
    assert.equal(legacy?.profile.last_drop, undefined);
    assert.equal(legacy?.profile.daily_crate?.last_claimed_at, "2026-11-01T16:59:59.000Z");
    assert.equal(legacy?.profile.view_settings?.cratePurchaseCount, 7);
    assert.equal((await players.findOne({ _id: "current" }))?.profile.daily_crate?.last_claimed_at, "2026-11-01T17:00:00.000Z");
    const metadata = await db.collection<{ _id: string; gameplay?: unknown }>("metadata").findOne({ _id: "gameplay-settings" });
    assert.deepEqual(metadata?.gameplay, { configs: { actual: { daily_drop_count: 50 }, debug: { daily_drop_count: 20 } } });
    assert.deepEqual(await migrateDailyCrateClaims(db), { playersUpdated: 0, settingsUpdated: 0 });
  });

  await t.test("owner loads migrate legacy timestamps lazily and saved timezone never follows a different device", async () => {
    const db = client.db("daily-crate-timezones");
    await db.collection<Player>("players").insertOne({
      _id: "owner", active: true, profile: { level: 5, last_drop: "2026-11-01T16:59:59.000Z" },
    });
    const initial = await initializeDailyCrateTimeZone(db, "owner", "America/New_York");
    assert.deepEqual(initial, { timeZone: "America/New_York", lastClaimedAt: "2026-11-01T16:59:59.000Z" });
    assert.deepEqual(await initializeDailyCrateTimeZone(db, "owner", "Asia/Tokyo"), initial);
    assert.equal((await db.collection<Player>("players").findOne({ _id: "owner" }))?.profile.last_drop, undefined);
    assert.equal(await reserveDailyCrateClaim(db, "owner", new Date("2026-11-01T16:59:59.999Z")), null);
    assert.ok(await reserveDailyCrateClaim(db, "owner", new Date("2026-11-01T17:00:00.000Z")));
  });

  await t.test("simultaneous devices initialize the same account timezone and cannot duplicate daily claims", async () => {
    const db = client.db("daily-crate-races");
    await db.collection<Player>("players").insertOne({
      _id: "owner", active: true, profile: { level: 5, daily_crate: { time_zone: null, last_claimed_at: null } },
    });
    const zones = await Promise.all([
      initializeDailyCrateTimeZone(db, "owner", "America/New_York"),
      initializeDailyCrateTimeZone(db, "owner", "Asia/Tokyo"),
    ]);
    assert.deepEqual(zones[0], zones[1]);
    const now = new Date("2026-11-01T20:00:00.000Z");
    const claims = await Promise.all(Array.from({ length: 20 }, () => reserveDailyCrateClaim(db, "owner", now)));
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal((await getPlayerDailyCrateState(db, "owner"))?.lastClaimedAt, now.toISOString());
  });

  await t.test("failed generation releases its reservation but cannot erase a newer noon-period claim", async () => {
    const db = client.db("daily-crate-rollback");
    await db.collection<Player>("players").insertOne({
      _id: "owner", active: true, profile: { level: 5, daily_crate: { time_zone: "UTC", last_claimed_at: null } },
    });
    const first = await reserveDailyCrateClaim(db, "owner", new Date("2026-11-01T12:00:00.000Z"));
    assert.ok(first);
    await releaseDailyCrateClaim(db, first);
    assert.equal((await getPlayerDailyCrateState(db, "owner"))?.lastClaimedAt, null);
    const retried = await reserveDailyCrateClaim(db, "owner", new Date("2026-11-01T12:00:01.000Z"));
    assert.ok(retried);
    const next = await reserveDailyCrateClaim(db, "owner", new Date("2026-11-02T12:00:00.000Z"));
    assert.ok(next);
    await releaseDailyCrateClaim(db, retried);
    assert.equal((await getPlayerDailyCrateState(db, "owner"))?.lastClaimedAt, next.state.lastClaimedAt);
  });

  await t.test("the first successful drop gives eight items, retries preserve it, and later or legacy claims use normal counts", async () => {
    const db = client.db("daily-crate-item-counts");
    const players = db.collection<Player>("players");
    await players.insertOne({
      _id: "owner", active: true, profile: { level: 0, daily_crate: { time_zone: "UTC", last_claimed_at: null } },
    });
    const counts: number[] = [];
    let fail = true;
    const drop = await loadDropRoute(db, async (_database, _playerId, _level, { itemCount }) => {
      counts.push(itemCount);
      if (fail) throw new Error("Generation failed");
      return Array.from({ length: itemCount }, (_, index) => ({ _id: `item-${index}` }));
    });
    assert.equal((await drop()).status, 500);
    assert.equal((await getPlayerDailyCrateState(db, "owner"))?.lastClaimedAt, null);
    fail = false;
    const responses = await Promise.all(Array.from({ length: 10 }, () => drop()));
    assert.equal(responses.filter(response => response.status === 200).length, 1);
    assert.equal(responses.filter(response => response.status === 409).length, 9);
    const first = await responses.find(response => response.status === 200)!.json();
    assert.equal(first.itemCount, 8);
    assert.equal(first.item_ids.length, 8);
    assert.deepEqual(counts, [8, 8], "Only a failed attempt and the successful retry may generate the first drop");
    assert.ok((await getPlayerDailyCrateState(db, "owner"))?.lastClaimedAt);

    const previous = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await players.updateOne({ _id: "owner" }, { $set: { "profile.daily_crate.last_claimed_at": previous } });
    assert.equal((await (await drop()).json()).itemCount, 50);
    await players.updateOne({ _id: "owner" }, {
      $unset: { "profile.daily_crate.last_claimed_at": "" }, $set: { "profile.last_drop": previous },
    });
    assert.equal((await (await drop()).json()).itemCount, 50, "Migrated legacy claims must not count as a first drop");
    assert.equal((await players.findOne({ _id: "owner" }))?.profile.last_drop, undefined);
    await players.updateOne({ _id: "owner" }, { $unset: { "profile.daily_crate.last_claimed_at": "" } });
    assert.equal((await (await drop()).json()).itemCount, 8, "An absent claim timestamp also means no prior drop");
    assert.deepEqual(counts, [8, 8, 50, 50, 8]);
  });

  await t.test("missing, inactive or unconfigured accounts cannot reserve crates", async () => {
    const db = client.db("daily-crate-access");
    await db.collection<Player>("players").insertMany([
      { _id: "inactive", active: false, profile: { level: 5, daily_crate: { time_zone: "UTC", last_claimed_at: null } } },
      { _id: "unconfigured", active: true, profile: { level: 5 } },
    ]);
    assert.equal(await initializeDailyCrateTimeZone(db, "inactive", "UTC"), null);
    assert.equal(await initializeDailyCrateTimeZone(db, "missing", "UTC"), null);
    assert.equal(await initializeDailyCrateTimeZone(db, "unconfigured", "Not/AZone"), null);
    for (const playerId of ["inactive", "missing", "unconfigured"]) {
      assert.equal(await reserveDailyCrateClaim(db, playerId), null);
    }
  });
});
