import assert from "node:assert/strict";
import test from "node:test";

import {
  getSupporterAdjustedCardStyleWeights,
  isCardRendererActive,
} from "./card-renderer-settings.ts";

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
