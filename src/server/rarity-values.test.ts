import assert from "node:assert/strict";
import test from "node:test";

import { validateRarityValueRanges } from "./rarity-values.ts";

const ranges = {
  common: { min: 5_000, max: 25_000 },
  uncommon: { min: 25_000, max: 65_000 },
  rare: { min: 65_000, max: 225_000 },
  legendary: { min: 225_000, max: 1_505_000 },
  masterpiece: { min: 1_505_000, max: 21_985_000 },
};

test("rarity value ranges accept ordered non-overlapping tiers", () => {
  assert.deepEqual(validateRarityValueRanges(ranges), {
    ok: true,
    value: ranges,
  });
});

test("rarity value ranges require every known tier and exact range keys", () => {
  assert.equal(
    validateRarityValueRanges({ ...ranges, rare: undefined }).ok,
    false,
  );
  assert.equal(
    validateRarityValueRanges({ ...ranges, mythic: { min: 1, max: 2 } }).ok,
    false,
  );
  assert.equal(
    validateRarityValueRanges({
      ...ranges,
      rare: { ...ranges.rare, average: 100_000 },
    }).ok,
    false,
  );
});

test("rarity value ranges reject invalid and overlapping values", () => {
  assert.equal(
    validateRarityValueRanges({
      ...ranges,
      rare: { min: 64_999, max: 225_000 },
    }).ok,
    false,
  );
  assert.equal(
    validateRarityValueRanges({
      ...ranges,
      rare: { min: 65_000, max: 64_999 },
    }).ok,
    false,
  );
  assert.equal(
    validateRarityValueRanges({
      ...ranges,
      common: { min: 5_000.5, max: 25_000 },
    }).ok,
    false,
  );
  assert.equal(
    validateRarityValueRanges({
      ...ranges,
      common: { min: 0, max: 25_000 },
    }).ok,
    false,
  );
});
