import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import {
  applyXp,
  getCapsForLevel,
  getXpChunk,
  getXpGoal,
  settleGalleryEarnings,
} from "./collection-gameplay.ts";
import { DEFAULT_ACTUAL_GAMEPLAY_CONFIG as config } from "./game-settings.ts";
import type { Artwork, GameItem } from "./gameplay.ts";
import { setupTestDb } from "./test-utils/db-setup.ts";

test("legacy XP goals and chunks are preserved", () => {
  assert.equal(getXpGoal(0), 100);
  assert.equal(getXpGoal(1), 130);
  assert.equal(getXpGoal(50), 10_000_000);
  assert.equal(getXpChunk(0), 100);
});

test("XP carries through multiple level thresholds", () => {
  assert.deepEqual(applyXp(0, 90, 50), {
    level: 1,
    xp: 40,
    lotteryTickets: 0,
  });
});

test("players earn a lottery ticket whenever they reach a fifth level", () => {
  assert.deepEqual(applyXp(4, getXpGoal(4) - 1, 1), {
    level: 5,
    xp: 0,
    lotteryTickets: 1,
  });
  assert.deepEqual(applyXp(9, getXpGoal(9) - 1, 1), {
    level: 10,
    xp: 0,
    lotteryTickets: 1,
  });
  assert.deepEqual(applyXp(5, getXpGoal(5) - 1, 1), {
    level: 6,
    xp: 0,
    lotteryTickets: 0,
  });
});

test("max-level XP caps award lottery tickets and reset progress", () => {
  const goal = getXpGoal(50);
  assert.deepEqual(applyXp(50, goal - 1, 1), {
    level: 50,
    xp: 0,
    lotteryTickets: 1,
  });
  assert.deepEqual(applyXp(50, goal - 10, goal + 25), {
    level: 50,
    xp: 15,
    lotteryTickets: 2,
  });
});

test("level caps use the original linear scaling", () => {
  assert.deepEqual(getCapsForLevel(0), {
    inventory_cap: 15,
    display_cap: 5,
    auction_cap: 8,
    ticket_cap: 3,
    pc_cap: 12,
    visitor_cap: 20,
    repairing_cap: 4,
  });
  assert.equal(getCapsForLevel(50).inventory_cap, 64);
  assert.equal(getCapsForLevel(50).display_cap, 10);
});

const payoutStart = new Date("2026-09-01T00:00:00.000Z");
const payoutIntervalMs = config.galleryPayoutIntervalMinutes * 60_000;

async function seedGallery(db: Db, mixed = false) {
  const artworks: Partial<Artwork>[] = [
    { _id: "common", rarity: "common" },
    ...(mixed ? [
      { _id: "uncommon", rarity: "uncommon" as const },
      { _id: "forged", rarity: "legendary" as const, effect_id: "forgery-money" },
      { _id: "money", rarity: "legendary" as const, effect_id: "money-xp" },
      { _id: "bonus", rarity: "masterpiece" as const, effect_id: "uncommon-xp" },
      { _id: "preserved", rarity: "masterpiece" as const, effect_id: "preservation" },
    ] : []),
  ].map((artwork) => ({ ...artwork, active: true, value_scale: 0.5, title: artwork._id }));
  await setupTestDb(db, "player", {
    playerProfile: { level: 4, xp: getXpGoal(4) - 2, bankBalance: -500, lotteryTickets: 2 },
    artworks,
  });
  await db.collection("players").updateOne({ _id: "player" }, {
    $set: {
      "profile.last_gallery_payout": payoutStart.toISOString(),
      "profile.gallery_money_remainder": 0.75,
      "profile.gallery_xp_remainder": 0.8,
    },
  });
  await db.collection<{ _id: string }>("players").insertOne({
    _id: "forger", active: true,
    profile: { level: 2, xp: 20, bank_balance: 0, lottery_tickets: 0 },
  });
  await db.collection<{ _id: string }>("artwork_effects").insertMany([
    { _id: "forgery-money", code: "DISPLAY_FORGERY_MONEY_BONUS", active: true, parameters: {} },
    { _id: "money-xp", code: "MONEY_FOR_XP", active: true, parameters: { money_per_xp: 2 } },
    { _id: "uncommon-xp", code: "MP_UNCOMMON_GALLERY_XP", active: true, parameters: { xp_chunks: 0.5 } },
    { _id: "preservation", code: "MP_PRESERVATION_MINT", active: true, parameters: {} },
  ]);
  const items = artworks.map((artwork) => ({
    _id: artwork._id, artwork_id: artwork._id, owner: "player", status: "displayed",
    condition: 0.6, level: artwork._id === "forged" ? 10 : 2,
    time_displayed: new Date(payoutStart.getTime() - 90 * 60_000).toISOString(),
    values: { actual: 1_000 },
    authenticity: {
      forgery: artwork._id === "forged", identified: artwork._id !== "forged",
      forgery_quality: 0.7, original_owner: "forger", liable: "player",
    },
  })) as GameItem[];
  await db.collection<GameItem>("items").insertMany(items);
}

function countReads(t: TestContext, db: Db) {
  const collection = db.collection.bind(db);
  const reads: string[] = [];
  t.mock.method(db, "collection", ((name: string) => new Proxy(collection(name), {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        if (property === "find" || property === "findOne" || property === "aggregate") {
          reads.push(`${name}.${String(property)}`);
          assert.ok(reads.length <= 50, "Gallery catch-up is still reading the database inside its interval loop.");
        }
        return Reflect.apply(value, target, args);
      };
    },
  })) as Db["collection"]);
  return reads;
}

test("gallery catch-up preserves earnings without per-interval database reads", async (t) => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  t.after(async () => { await client.close(); await server.stop(); });
  await client.connect();

  const payoutCases = [
    { random: 0, money: 12_709, xp: 1_099, remainingXp: 244, moneyRemainder: 0.08333333333030168, xpRemainder: 0.29999999999996874, forgerLevel: 2, forgerXp: 23 },
    { random: 0.99, money: 15_355, xp: 1_303, remainingXp: 448, moneyRemainder: 0.0833333333284827, xpRemainder: 0.4666666666665975, forgerLevel: 3, forgerXp: 25 },
  ];
  for (const expected of payoutCases) {
    const { random } = expected;
    await t.test(`catch-up payouts preserve bonuses, leveling and forgery behavior with random=${random}`, async (t) => {
      const db = client.db(`gallery-payout-${random === 0 ? "caught" : "undetected"}`);
      await seedGallery(db, true);
      t.mock.method(Math, "random", () => random);
      const result = await settleGalleryEarnings(db, "player", config, new Date(payoutStart.getTime() + 36 * payoutIntervalMs + 7 * 60_000));
      const profile = (await db.collection("players").findOne({ _id: "player" }))!.profile;
      const forger = (await db.collection("players").findOne({ _id: "forger" }))!.profile;
      const items = await db.collection<GameItem>("items").find().sort({ _id: 1 }).toArray();
      assert.deepEqual(result, { money: expected.money, xp: expected.xp, intervals: 36 });
      assert.deepEqual({
        bankBalance: profile.bank_balance, level: profile.level, xp: profile.xp,
        tickets: profile.lottery_tickets, moneyRemainder: profile.gallery_money_remainder,
        xpRemainder: profile.gallery_xp_remainder, lastPayout: profile.last_gallery_payout,
      }, {
        bankBalance: expected.money - 500, level: 7, xp: expected.remainingXp,
        tickets: 3, moneyRemainder: expected.moneyRemainder,
        xpRemainder: expected.xpRemainder, lastPayout: "2026-09-01T06:00:00.000Z",
      });
      assert.deepEqual({ level: forger.level, xp: forger.xp, tickets: forger.lottery_tickets }, {
        level: expected.forgerLevel, xp: expected.forgerXp, tickets: 0,
      });
      for (const item of items) {
        const caught = random === 0 && item._id === "forged";
        assert.equal(item.status, caught ? "claimed" : "displayed");
        assert.equal(item.authenticity.identified, caught || item._id !== "forged");
        assert.equal(item.authenticity.forgery_quality, caught ? 0.6 : 0.7);
        assert.equal(item.condition, random === 0
          ? caught ? 0.59 : item._id === "preserved" ? 0.6 : 0.49
          : 0.6);
      }
      assert.equal(await db.collection("player_notifications").countDocuments(), random === 0 ? 1 : 0);
    });
  }

  await t.test("one month of catch-up uses the same read budget as one interval", async (t) => {
    const readCounts: number[] = [];
    for (const intervals of [1, 4_320]) {
      const db = client.db(`gallery-reads-${intervals}`);
      await seedGallery(db);
      t.mock.method(Math, "random", () => 0.99);
      const reads = countReads(t, db);
      const result = await settleGalleryEarnings(db, "player", config, new Date(payoutStart.getTime() + intervals * payoutIntervalMs));
      assert.equal(result.intervals, intervals);
      readCounts.push(reads.length);
    }
    assert.equal(readCounts[1], readCounts[0]);
    t.diagnostic(`Database reads: ${readCounts[0]} for one interval; ${readCounts[1]} for 4,320 intervals.`);
  });

  await t.test("catching the last displayed forgery skips the remaining empty intervals without extra rewards", async (t) => {
    const rewards: Array<{ money: number; xp: number }> = [];
    const readCounts: number[] = [];
    for (const intervals of [1, 4_320]) {
      const db = client.db(`gallery-last-forgery-${intervals}`);
      await seedGallery(db, true);
      await db.collection("items").deleteMany({ _id: { $ne: "forged" } });
      t.mock.method(Math, "random", () => 0);
      const reads = countReads(t, db);
      const result = await settleGalleryEarnings(db, "player", config, new Date(payoutStart.getTime() + intervals * payoutIntervalMs));
      rewards.push({ money: result.money, xp: result.xp });
      readCounts.push(reads.length);
      assert.equal(result.intervals, intervals);
      const item = await db.collection<GameItem>("items").findOne({ _id: "forged" });
      assert.equal(item?.status, "claimed");
      assert.equal(item?.condition, 0.59);
      assert.equal(await db.collection("player_notifications").countDocuments(), 1);
      const profile = (await db.collection("players").findOne({ _id: "player" }))!.profile;
      assert.equal(profile.last_gallery_payout, new Date(payoutStart.getTime() + intervals * payoutIntervalMs).toISOString());
    }
    assert.deepEqual(rewards[1], rewards[0]);
    assert.equal(readCounts[1], readCounts[0]);
  });

  await t.test("overlapping catch-ups still pay and report a detection only once", async (t) => {
    const db = client.db("gallery-concurrent");
    await seedGallery(db, true);
    t.mock.method(Math, "random", () => 0);
    t.mock.method(console, "warn", () => {});
    const now = new Date(payoutStart.getTime() + 36 * payoutIntervalMs);
    const results = await Promise.all([
      settleGalleryEarnings(db, "player", config, now),
      settleGalleryEarnings(db, "player", config, now),
    ]);
    assert.equal(results.filter((result) => result.intervals > 0).length, 1);
    assert.equal((await db.collection("players").findOne({ _id: "player" }))?.profile.bank_balance, 12_209);
    assert.equal((await db.collection("players").findOne({ _id: "forger" }))?.profile.xp, 23);
    assert.equal(await db.collection("player_notifications").countDocuments(), 1);
  });

  await t.test("empty galleries advance the whole payout clock without loading rate inputs", async (t) => {
    const db = client.db("gallery-empty");
    await db.collection<{ _id: string }>("players").insertOne({
      _id: "player", active: true, profile: {
        level: 4, xp: 20, bank_balance: -500, lottery_tickets: 2,
        last_gallery_payout: payoutStart.toISOString(),
        gallery_money_remainder: 0.75, gallery_xp_remainder: 0.8,
      },
    });
    const reads = countReads(t, db);
    const result = await settleGalleryEarnings(db, "player", config, new Date(payoutStart.getTime() + 4_320 * payoutIntervalMs + 7 * 60_000));
    assert.deepEqual(result, { money: 0, xp: 0, intervals: 4_320 });
    assert.ok(reads.every((read) => read.startsWith("players.") || read.startsWith("items.")));
    const profile = (await db.collection("players").findOne({ _id: "player" }))!.profile;
    assert.equal(profile.last_gallery_payout, new Date(payoutStart.getTime() + 4_320 * payoutIntervalMs).toISOString());
    assert.equal(profile.bank_balance, -500);
    assert.equal(profile.gallery_money_remainder, 0.75);
    assert.equal(profile.gallery_xp_remainder, 0.8);
  });
});
