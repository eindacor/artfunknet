import assert from "node:assert/strict";
import test from "node:test";

import {
  getCardRendererPrice,
  isCardRendererActive,
} from "./card-renderer-settings.ts";

test("card renderer activation uses the supplied active catalog", () => {
  assert.equal(isCardRendererActive("museum", ["legacy", "museum"]), true);
  assert.equal(isCardRendererActive("arcade", ["legacy", "museum"]), false);
});

test("card renderer prices use configured values with catalog fallbacks", () => {
  assert.equal(getCardRendererPrice("legacy", {}), 10_000_000_000);
  assert.equal(getCardRendererPrice("legacy", { legacy: 250_000 }), 250_000);
  assert.equal(getCardRendererPrice("museum", { museum: 0 }), 0);
});
