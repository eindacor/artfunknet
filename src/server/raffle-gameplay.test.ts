import assert from "node:assert/strict";
import test from "node:test";

import { selectWeightedRaffleEntry } from "./raffle-gameplay.ts";

test("raffle entry selection is weighted by allocated tickets", () => {
  const entries = [{ tickets: 1 }, { tickets: 9 }];
  assert.equal(selectWeightedRaffleEntry(entries, () => 0), entries[0]);
  assert.equal(selectWeightedRaffleEntry(entries, () => 0.11), entries[1]);
  assert.equal(selectWeightedRaffleEntry(entries, () => 0.99), entries[1]);
});
