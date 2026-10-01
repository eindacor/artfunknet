import assert from "node:assert/strict";
import test from "node:test";

import {
  getBulkAcquisitionRequirements,
  selectBulkPurchaseItems,
} from "./bulk-acquisition.ts";

function item(
  id: string,
  actual: number,
  dealer: number,
  options: { original?: boolean; vintage?: boolean } = {},
) {
  return {
    _id: id,
    original: options.original ?? false,
    vintage: options.vintage ?? false,
    values: { actual, dealer },
  };
}

test("bulk purchase prioritizes actual value within slot and bank limits", () => {
  const result = selectBulkPurchaseItems(
    [
      item("highest", 500, 80),
      item("middle", 300, 50),
      item("lowest", 100, 20),
    ],
    2,
    100,
    (candidate) => candidate.values.dealer,
  );

  assert.deepEqual(
    result.items.map((candidate) => candidate._id),
    ["highest", "lowest"],
  );
  assert.equal(result.totalCost, 100);
});

test("bulk purchase does not spend inventory slots on originals or vintage items", () => {
  const result = selectBulkPurchaseItems(
    [
      item("original", 600, 20, { original: true }),
      item("vintage", 500, 20, { vintage: true }),
      item("regular", 400, 20),
    ],
    0,
    100,
    (candidate) => candidate.values.dealer,
  );

  assert.deepEqual(
    result.items.map((candidate) => candidate._id),
    ["original", "vintage"],
  );
});

test("bulk acquisition requirements include every purchase and regular slot", () => {
  assert.deepEqual(
    getBulkAcquisitionRequirements(
      [
        item("regular", 400, 50),
        item("original", 300, 25, { original: true }),
      ],
      (candidate) => candidate.values.dealer * 0.8,
    ),
    { requiredSlots: 1, totalCost: 60 },
  );
});
