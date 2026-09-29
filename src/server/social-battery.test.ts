import assert from "node:assert/strict";
import test from "node:test";

import {
  getNextSocialBatteryResetAt,
  getVisitorSocialBatteryCost,
} from "./social-battery.ts";

test("visitor social battery costs are halved in the player's own gallery", () => {
  assert.equal(getVisitorSocialBatteryCost("bronze", false), 12);
  assert.equal(getVisitorSocialBatteryCost("silver", false), 16);
  assert.equal(getVisitorSocialBatteryCost("gold", false), 20);
  assert.equal(getVisitorSocialBatteryCost("platinum", false), 24);
  assert.equal(getVisitorSocialBatteryCost("bronze", true), 6);
  assert.equal(getVisitorSocialBatteryCost("platinum", true), 12);
});

test("social battery resets at the next 7 AM America/New_York boundary", () => {
  assert.equal(
    getNextSocialBatteryResetAt(
      new Date("2026-09-29T10:59:59.000Z"),
    ).toISOString(),
    "2026-09-29T11:00:00.000Z",
  );
  assert.equal(
    getNextSocialBatteryResetAt(
      new Date("2026-09-29T11:00:01.000Z"),
    ).toISOString(),
    "2026-09-30T11:00:00.000Z",
  );
  assert.equal(
    getNextSocialBatteryResetAt(
      new Date("2026-09-29T11:00:00.000Z"),
    ).toISOString(),
    "2026-09-30T11:00:00.000Z",
  );
});

test("social battery reset calculation follows daylight saving time", () => {
  assert.equal(
    getNextSocialBatteryResetAt(
      new Date("2026-12-01T13:00:00.000Z"),
    ).toISOString(),
    "2026-12-02T12:00:00.000Z",
  );
});
