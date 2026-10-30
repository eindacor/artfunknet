import assert from "node:assert/strict";
import test from "node:test";

import {
  getCardStyleProbabilities,
  getSupporterAdjustedCardStyleWeights,
  isCardRendererActive,
} from "./card-renderer-settings.ts";

test("style probabilities cache by active weights and refresh when settings change", () => {
  const weights = { legacy: 3, postcard: 1, arcade: 0, gilded: 100 };
  const active = ["museum", "legacy", "postcard", "arcade"];
  const probabilities = getCardStyleProbabilities(active, weights);
  assert.deepEqual(probabilities, { legacy: 0.75, postcard: 0.25 });
  assert.equal(getCardStyleProbabilities([...active], { ...weights }), probabilities);
  assert.deepEqual(getCardStyleProbabilities(active, {
    ...weights, postcard: 3,
  }), { legacy: 0.5, postcard: 0.5 });
  assert.deepEqual(getCardStyleProbabilities(["legacy"], weights), { legacy: 1 });
  assert.deepEqual(getCardStyleProbabilities(["museum", "arcade"], weights), {});
});
test("card renderer activation uses the supplied active catalog", () => {
  assert.equal(isCardRendererActive("museum", ["legacy", "museum"]), true);
  assert.equal(isCardRendererActive("arcade", ["legacy", "museum"]), false);
});

test("supporter card renderer weights are unchanged for supporters", () => {
  const weights = { comic: 3, museum: 2 };

  assert.equal(
    getSupporterAdjustedCardStyleWeights(weights, ["comic"], true),
    weights,
  );
});

test("supporter card renderer weights are zeroed for non-supporters", () => {
  assert.deepEqual(
    getSupporterAdjustedCardStyleWeights(
      { comic: 3, museum: 2 },
      ["comic"],
      false,
    ),
    { comic: 0, museum: 2 },
  );
  assert.deepEqual(
    getSupporterAdjustedCardStyleWeights(undefined, ["comic"], false),
    { comic: 0 },
  );
});
