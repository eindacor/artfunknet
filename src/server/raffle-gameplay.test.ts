import assert from "node:assert/strict";
import test from "node:test";

import {
  getLotteryPrizeDrawOutcome,
  RAFFLE_DRAW_INTERVAL_MS,
  selectWeightedRaffleEntry,
} from "./raffle-gameplay.ts";

test("lottery drawings use a daily interval", () => {
  assert.equal(RAFFLE_DRAW_INTERVAL_MS, 24 * 60 * 60 * 1000);
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
