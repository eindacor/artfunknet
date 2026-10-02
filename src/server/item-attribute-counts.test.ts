import assert from "node:assert/strict";
import test from "node:test";

import { getItemAttributeCounts } from "./item-attribute-counts.ts";

test("item attribute counts match current generation rules", () => {
  assert.deepEqual(getItemAttributeCounts("common", false), {
    locked: 0,
    unlocked: 1,
  });
  assert.deepEqual(getItemAttributeCounts("legendary", false), {
    locked: 1,
    unlocked: 1,
  });
  assert.deepEqual(getItemAttributeCounts("legendary", true), {
    locked: 0,
    unlocked: 2,
  });
  assert.deepEqual(getItemAttributeCounts("masterpiece", false), {
    locked: 1,
    unlocked: 3,
  });
  assert.deepEqual(getItemAttributeCounts("masterpiece", true), {
    locked: 0,
    unlocked: 4,
  });
});
