import assert from "node:assert/strict";
import test from "node:test";

import {
  RAFFLE_BUFFER_COUNT,
  getNextRaffleDrawAt,
  getLotteryPrizeDrawOutcome,
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

test("lottery keeps three replacement items buffered", () => {
  assert.equal(RAFFLE_BUFFER_COUNT, 3);
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
