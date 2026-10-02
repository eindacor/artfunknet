import assert from "node:assert/strict";
import test from "node:test";

import {
  getDailyEventDayIndex,
  getDailyEventWeekKey,
  getMostRecentDailyEventAt,
  getNextDailyEventAt,
  isDailyEventDay,
} from "./daily-event-time.ts";

test("daily event weekdays use America/New_York", () => {
  const sundayEvening = new Date("2026-10-05T02:00:00.000Z");
  assert.equal(getDailyEventDayIndex(sundayEvening), 0);
  assert.equal(isDailyEventDay(0, sundayEvening), true);
  assert.equal(getDailyEventWeekKey(sundayEvening), "2026-10-04");
});

test("weekly noon schedules cross daylight saving boundaries", () => {
  assert.equal(
    getNextDailyEventAt(2, 12, new Date("2026-10-28T12:00:00.000Z"))
      .toISOString(),
    "2026-11-03T17:00:00.000Z",
  );
  assert.equal(
    getMostRecentDailyEventAt(
      4,
      12,
      new Date("2026-11-06T12:00:00.000Z"),
    ).toISOString(),
    "2026-11-05T17:00:00.000Z",
  );
});
