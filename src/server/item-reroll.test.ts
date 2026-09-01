import assert from "node:assert/strict";
import test from "node:test";

import {
  findAttributeType,
  getRerollCost,
  getRerollMinimum,
} from "./item-reroll.ts";

const rarityValues = {
  common: { min: 100, max: 200 },
  uncommon: { min: 200, max: 300 },
  rare: { min: 300, max: 400 },
  legendary: { min: 400, max: 500 },
  masterpiece: { min: 500, max: 600 },
};

test("reroll costs preserve rarity growth and ignore negative roll credits", () => {
  assert.equal(getRerollCost({ roll_count: -5 }, "common", { rarity_values: rarityValues }), 10);
  assert.equal(getRerollCost({ roll_count: 2 }, "rare", { rarity_values: rarityValues }), 37);
});

test("reroll minimums preserve type, Patreon, and item-level bonuses", () => {
  assert.equal(getRerollMinimum({ level: 1, patreon: false }, "unlocked"), 0);
  assert.equal(getRerollMinimum({ level: 1, patreon: false }, "locked"), 0.5);
  assert.equal(getRerollMinimum({ level: 1, patreon: false }, "special"), 0.8);
  assert.equal(getRerollMinimum({ level: 1, patreon: true }, "locked"), 0.55);
  assert.equal(getRerollMinimum({ level: 10, patreon: false }, "locked"), 0.75);
});

test("attribute lookup identifies each reroll category", () => {
  const item = {
    attributes: {
      unlocked: [{ _id: "u" }],
      locked: [{ _id: "l" }],
      special: [{ _id: "s" }],
    },
  };
  assert.equal(findAttributeType(item, "u"), "unlocked");
  assert.equal(findAttributeType(item, "l"), "locked");
  assert.equal(findAttributeType(item, "s"), "special");
  assert.equal(findAttributeType(item, "missing"), null);
});
