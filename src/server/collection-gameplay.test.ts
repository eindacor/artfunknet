import assert from "node:assert/strict";
import test from "node:test";

import {
  applyXp,
  getCapsForLevel,
  getXpChunk,
  getXpGoal,
} from "./collection-gameplay.ts";

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
