import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePreservationistRepair,
  getCompletedRepairIntervals,
} from "./preservationist-gameplay.ts";

test("Preservationist repairs preserve quality and own-gallery scaling", () => {
  assert.deepEqual(
    calculatePreservationistRepair({
      condition: 0.5,
      quality: "bronze",
      ownGallery: false,
    }),
    { condition: 0.58, repairedAmount: 0.08 },
  );
  assert.deepEqual(
    calculatePreservationistRepair({
      condition: 0.8,
      quality: "platinum",
      ownGallery: true,
    }),
    { condition: 1, repairedAmount: 0.2 },
  );
});

test("manual repairs advance once per completed hour", () => {
  const started = "2026-09-02T08:00:00.000Z";
  assert.equal(
    getCompletedRepairIntervals(
      started,
      new Date("2026-09-02T08:59:59.999Z"),
      60,
    ),
    0,
  );
  assert.equal(
    getCompletedRepairIntervals(
      started,
      new Date("2026-09-02T11:15:00.000Z"),
      60,
    ),
    3,
  );
});

test("manual repair intervals use the configured duration", () => {
  assert.equal(
    getCompletedRepairIntervals(
      "2026-09-02T08:00:00.000Z",
      new Date("2026-09-02T08:15:00.000Z"),
      5,
    ),
    3,
  );
});
