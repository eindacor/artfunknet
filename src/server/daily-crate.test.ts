import assert from "node:assert/strict";
import test from "node:test";

import {
  getDailyCratePeriod,
  getDailyCrateState,
  isDailyCrateReady,
  normalizeDailyCrateTimeZone,
} from "./daily-crate.ts";

test("daily crate periods change exactly at local noon, not midnight or 24 hours after claiming", () => {
  const state = { timeZone: "America/New_York", lastClaimedAt: "2026-10-31T23:00:00.000Z" };
  assert.equal(isDailyCrateReady(state, new Date("2026-11-01T16:59:59.999Z")), false);
  assert.equal(isDailyCrateReady(state, new Date("2026-11-01T17:00:00.000Z")), true);
  assert.equal(getDailyCratePeriod(new Date("2026-11-01T05:00:00Z"), state.timeZone), "2026-10-31");
  assert.equal(isDailyCrateReady({
    ...state, lastClaimedAt: "2026-11-01T16:59:59.999Z",
  }, new Date("2026-11-01T17:00:00.000Z")), true);
});

test("local-noon windows follow both 23-hour and 25-hour daylight-saving days", () => {
  const timeZone = "America/New_York";
  for (const [claimed, before, noon] of [
    ["2026-03-07T17:00:00Z", "2026-03-08T15:59:59Z", "2026-03-08T16:00:00Z"],
    ["2026-10-31T16:00:00Z", "2026-11-01T16:59:59Z", "2026-11-01T17:00:00Z"],
  ]) {
    const state = { timeZone, lastClaimedAt: claimed };
    assert.equal(isDailyCrateReady(state, new Date(before)), false);
    assert.equal(isDailyCrateReady(state, new Date(noon)), true);
  }
});

test("noon periods handle fractional offsets, opposing calendar dates and year/leap-day boundaries", () => {
  for (const [instant, timeZone, period] of [
    ["2026-11-01T06:29:59Z", "Asia/Kolkata", "2026-10-31"],
    ["2026-11-01T06:30:00Z", "Asia/Kolkata", "2026-11-01"],
    ["2026-11-01T00:00:00Z", "Pacific/Kiritimati", "2026-11-01"],
    ["2026-11-01T00:00:00Z", "Pacific/Honolulu", "2026-10-31"],
    ["2026-01-01T11:59:59Z", "UTC", "2025-12-31"],
    ["2024-03-01T11:59:59Z", "UTC", "2024-02-29"],
  ]) {
    assert.equal(getDailyCratePeriod(new Date(instant), timeZone), period);
  }
});

test("new accounts must initialize a timezone and future/current claims cannot be repeated", () => {
  assert.equal(isDailyCrateReady(getDailyCrateState(undefined)), false);
  assert.equal(isDailyCrateReady({ timeZone: "UTC", lastClaimedAt: null }), true);
  assert.equal(isDailyCrateReady({
    timeZone: "UTC", lastClaimedAt: "2026-11-02T12:00:00Z",
  }, new Date("2026-11-01T12:00:00Z")), false);
  assert.equal(isDailyCrateReady({
    timeZone: "UTC", lastClaimedAt: "2026-11-01T12:00:00Z",
  }, new Date("2026-11-01T23:59:59Z")), false);
});

test("timezone and claim metadata normalize safely without accepting arbitrary numeric offsets", () => {
  assert.equal(normalizeDailyCrateTimeZone("US/Eastern"), "America/New_York");
  for (const value of ["Not/AZone", "+03:00", "", null, 12]) {
    assert.equal(normalizeDailyCrateTimeZone(value), null);
  }
  assert.deepEqual(getDailyCrateState({ time_zone: "UTC", last_claimed_at: "bad-date" }), {
    timeZone: "UTC", lastClaimedAt: null,
  });
});
