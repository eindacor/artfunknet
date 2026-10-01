import assert from "node:assert/strict";
import test from "node:test";

import { selectBulkClaimItems } from "./bulk-claim.ts";

function item(
  id: string,
  actual: number,
  options: { original?: boolean; vintage?: boolean } = {},
) {
  return {
    _id: id,
    original: options.original ?? false,
    vintage: options.vintage ?? false,
    values: {
      actual,
      sell: 0,
      purchase: 0,
      auction_min: 0,
      collector: 0,
      dealer: 0,
    },
  };
}

test("bulk claims the most valuable items that fit in inventory", () => {
  const selected = selectBulkClaimItems(
    [item("low", 100), item("highest", 900), item("middle", 500)],
    2,
  );

  assert.deepEqual(
    selected.map((candidate) => candidate._id),
    ["highest", "middle"],
  );
});

test("original and vintage items do not consume bulk claim capacity", () => {
  const selected = selectBulkClaimItems(
    [
      item("regular", 900),
      item("original", 100, { original: true }),
      item("vintage", 50, { vintage: true }),
    ],
    0,
  );

  assert.deepEqual(
    selected.map((candidate) => candidate._id),
    ["original", "vintage"],
  );
});
