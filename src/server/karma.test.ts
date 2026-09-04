import assert from "node:assert/strict";
import test from "node:test";

import {
  convertLegacyKnowledgeToKarma,
  normalizeKarmaBalance,
} from "./karma.ts";

test("converts legacy base-15 Knowledge tiers into exact Karma units", () => {
  assert.equal(
    convertLegacyKnowledgeToKarma({
      historical_data: 2,
      contextual_understanding: 3,
      technical_comprehension: 4,
      artistic_vision: 5,
    }),
    17_822,
  );
  assert.equal(convertLegacyKnowledgeToKarma(undefined), 0);
});

test("preserves negative Karma balances", () => {
  assert.equal(normalizeKarmaBalance(-2.4), -3);
  assert.equal(normalizeKarmaBalance(5.9), 5);
  assert.equal(normalizeKarmaBalance(undefined), 0);
});
