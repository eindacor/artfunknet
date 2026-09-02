import assert from "node:assert/strict";
import test from "node:test";

import { isCardRendererActive } from "./card-renderer-settings.ts";

test("card renderer activation uses the supplied active catalog", () => {
  assert.equal(isCardRendererActive("museum", ["legacy", "museum"]), true);
  assert.equal(isCardRendererActive("arcade", ["legacy", "museum"]), false);
});
