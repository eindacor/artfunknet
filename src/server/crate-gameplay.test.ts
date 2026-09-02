import assert from "node:assert/strict";
import test from "node:test";

import { getCrateOffer, getCratePermission } from "./crate-gameplay.ts";

const offer = {
  id: "gold" as const,
  name: "Gold crate",
  quality: "gold" as const,
  description: "",
  highlights: [],
  itemCount: 6,
  cost: 1_000,
  levelRequirement: 15,
};

test("crate permissions enforce level and price", () => {
  assert.equal(getCratePermission(offer, 14, 10_000).allowed, false);
  assert.equal(getCratePermission(offer, 15, 999).allowed, false);
  assert.deepEqual(getCratePermission(offer, 15, 1_000), { allowed: true });
});

test("crate offers are selected only by known ids", () => {
  assert.equal(
    getCrateOffer(
      [
        {
          ...offer,
          foilProbability: 0,
          unlockedProbability: 0,
        },
      ],
      "gold",
    )?.id,
    "gold",
  );
  assert.equal(getCrateOffer([], "unknown"), null);
});
