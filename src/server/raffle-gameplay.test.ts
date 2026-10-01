import assert from "node:assert/strict";
import test from "node:test";

import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import { DEFAULT_ACTUAL_GAMEPLAY_CONFIG } from "./game-settings.ts";
import {
  DEFAULT_RAFFLE_GENERATION_CONFIG,
  RAFFLE_DEFAULT_BUFFER_COUNT,
  RAFFLE_GENERATION_CHANCES,
  getNextRaffleDrawAt,
  getLotteryPrizeDrawOutcome,
  ensureRaffleState,
  normalizeRaffleGenerationConfig,
  RAFFLE_OWNER_ID,
  RAFFLE_STATE_ID,
  selectWeightedRaffleEntry,
} from "./raffle-gameplay.ts";

test("lottery drawings run at noon America/New_York each day", () => {
  assert.equal(
    getNextRaffleDrawAt(new Date("2026-09-07T15:30:00.000Z")).toISOString(),
    "2026-09-07T16:00:00.000Z",
  );
  assert.equal(
    getNextRaffleDrawAt(new Date("2026-09-07T18:30:00.000Z")).toISOString(),
    "2026-09-08T16:00:00.000Z",
  );
  assert.equal(
    getNextRaffleDrawAt(new Date("2026-10-31T18:30:00.000Z")).toISOString(),
    "2026-11-01T17:00:00.000Z",
  );
});

test("lottery starts with three replacement items in its expandable buffer", () => {
  assert.equal(RAFFLE_DEFAULT_BUFFER_COUNT, 3);
});

test("random lottery prizes use elevated special property chances", () => {
  assert.ok(RAFFLE_GENERATION_CHANCES.foil >= 0.2);
  assert.ok(RAFFLE_GENERATION_CHANCES.unlocked >= 0.3);
  assert.ok(RAFFLE_GENERATION_CHANCES.mint >= 0.1);
  assert.equal(RAFFLE_GENERATION_CHANCES.cardStyle, 1);
});

test("lottery rarity maps preserve valid admin weights", () => {
  const configured = normalizeRaffleGenerationConfig({
    rarity_weights: {
      common: 1,
      uncommon: 2,
      rare: 3,
      legendary: 4,
      masterpiece: 5,
    },
  });
  assert.deepEqual(configured.rarity_weights, {
    common: 1,
    uncommon: 2,
    rare: 3,
    legendary: 4,
    masterpiece: 5,
  });
  assert.deepEqual(
    normalizeRaffleGenerationConfig({
      rarity_weights: {
        common: 0,
        uncommon: 0,
        rare: 0,
        legendary: 0,
        masterpiece: 0,
      },
    }),
    DEFAULT_RAFFLE_GENERATION_CONFIG,
  );
});

test("lottery state preserves buffer entries beyond the default size", async () => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  try {
    await client.connect();
    const database = client.db("expandable-lottery-buffer");
    const prizes = ["prize-1", "prize-2", "prize-3"].map((item_id) => ({
      item_id,
      potency: 1,
    }));
    const buffer = [
      "buffer-1",
      "buffer-2",
      "buffer-3",
      "buffer-4",
      "buffer-5",
    ].map((item_id) => ({ item_id, potency: 1 }));
    await database.collection("items").insertMany(
      [...prizes, ...buffer].map((prize) => ({
        _id: prize.item_id,
        owner: RAFFLE_OWNER_ID,
        lottery: prize.potency,
        card_renderer: "legacy",
      })),
    );
    await database.collection("metadata").insertOne({
      _id: RAFFLE_STATE_ID,
      prizes,
      buffer_prizes: buffer,
      next_draw_at: "2026-10-02T16:00:00.000Z",
      previous_winners: [],
      generation_config: DEFAULT_RAFFLE_GENERATION_CONFIG,
    });

    const state = await ensureRaffleState(
      database,
      DEFAULT_ACTUAL_GAMEPLAY_CONFIG,
      new Date("2026-10-01T16:00:00.000Z"),
    );
    assert.deepEqual(state.buffer_prizes, buffer);
  } finally {
    await client.close();
    await server.stop();
  }
});

test("lottery entry selection is weighted by allocated tickets", () => {
  const entries = [{ tickets: 1 }, { tickets: 9 }];
  assert.equal(selectWeightedRaffleEntry(entries, () => 0), entries[0]);
  assert.equal(selectWeightedRaffleEntry(entries, () => 0.11), entries[1]);
  assert.equal(selectWeightedRaffleEntry(entries, () => 0.99), entries[1]);
});

test("lottery draw outcomes award hits and roll over misses", () => {
  assert.equal(getLotteryPrizeDrawOutcome(10, 1, true), "award");
  assert.equal(getLotteryPrizeDrawOutcome(10, 1, false), "rollover");
  assert.equal(getLotteryPrizeDrawOutcome(10, 10, false), "award");
});

test("unticketed lottery items roll over until level ten then expire", () => {
  assert.equal(getLotteryPrizeDrawOutcome(0, 1, true), "rollover");
  assert.equal(getLotteryPrizeDrawOutcome(0, 9, false), "rollover");
  assert.equal(getLotteryPrizeDrawOutcome(0, 10, true), "replace");
});
