import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_ITEM_TAG_LENGTH,
  MAX_ITEM_TAGS,
  normalizeItemTags,
  parseItemTagInput,
} from "./item-tags.ts";

test("item tags are normalized, deduplicated, and empty tags are removed", () => {
  assert.deepEqual(
    normalizeItemTags([" Primary ", "primary", "", "For   Sale"]),
    {
      ok: true,
      tags: ["primary", "for sale"],
    },
  );
  assert.deepEqual(parseItemTagInput("primary, to auction, foils"), [
    "primary",
    "to auction",
    "foils",
  ]);
});

test("item tag limits reject oversized values", () => {
  assert.equal(
    normalizeItemTags(["x".repeat(MAX_ITEM_TAG_LENGTH + 1)]).ok,
    false,
  );
  assert.equal(
    normalizeItemTags(
      Array.from({ length: MAX_ITEM_TAGS + 1 }, (_, index) => `tag-${index}`),
    ).ok,
    false,
  );
});
