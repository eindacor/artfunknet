import assert from "node:assert/strict";
import test from "node:test";

import {
  createDebugCrates,
  getEligibleDebugCrates,
  getCrateOffer,
  getCratePermission,
} from "./crate-gameplay.ts";

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
          generationMap: {
            foil: 0,
            unlocked: 0,
          },
        },
      ],
      "gold",
    )?.id,
    "gold",
  );
  assert.equal(getCrateOffer([], "unknown"), null);
});

test("debug crates isolate their 50 percent generation probabilities", () => {
  const crates = createDebugCrates();

  assert.equal(crates.length, 6);
  assert.deepEqual(
    Object.fromEntries(
      crates
        .filter(
          (crate) =>
            crate.id !== "debug-unlocked" &&
            !crate.generationMap.rarity,
        )
        .map((crate) => [crate.id, crate.generationMap]),
    ),
    {
      "debug-mint": { mint: 0.5 },
      "debug-foil": { foil: 0.5 },
      "debug-card-style": { cardStyle: 0.5 },
    },
  );
  assert.ok(crates.every((crate) => crate.cost === 0));
  assert.ok(crates.every((crate) => crate.levelRequirement === 0));
});

test("debug crates are available only to test accounts", () => {
  assert.deepEqual(getEligibleDebugCrates(false), []);
  assert.equal(getEligibleDebugCrates(true).length, 6);
});

test("debug rarity crates select only their named rarity", () => {
  const crates = createDebugCrates();

  assert.deepEqual(
    getCrateOffer(crates, "debug-unlocked")?.generationMap,
    {
      unlocked: 0.5,
      rarity: {
        common: 0,
        uncommon: 1,
        rare: 0,
        legendary: 0,
        masterpiece: 0,
      },
    },
  );
  assert.deepEqual(
    getCrateOffer(crates, "debug-legendary")?.generationMap.rarity,
    {
      common: 0,
      uncommon: 0,
      rare: 0,
      legendary: 1,
      masterpiece: 0,
    },
  );
  assert.deepEqual(
    getCrateOffer(crates, "debug-masterpiece")?.generationMap.rarity,
    {
      common: 0,
      uncommon: 0,
      rare: 0,
      legendary: 0,
      masterpiece: 1,
    },
  );
});
