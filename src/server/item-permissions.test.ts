import assert from "node:assert/strict";
import test from "node:test";

import { getDisplayPermission } from "./item-permissions.ts";

const item = {
  _id: "inventory-copy",
  artwork_id: "artwork",
  status: "claimed" as const,
  repairing: false,
  permanent: false,
};

test("display permission explains duplicate artwork and capacity failures", () => {
  assert.deepEqual(
    getDisplayPermission(
      item,
      [
        item,
        {
          _id: "displayed-copy",
          artwork_id: "artwork",
          status: "displayed",
          permanent: false,
        },
      ],
      5,
    ),
    {
      allowed: false,
      reason: "An item of this artwork is already on display.",
    },
  );

  assert.deepEqual(
    getDisplayPermission(
      item,
      [
        item,
        {
          _id: "other",
          artwork_id: "other-artwork",
          status: "displayed",
          permanent: false,
        },
      ],
      1,
    ),
    {
      allowed: false,
      reason: "You have reached your display limit.",
    },
  );
});

test("display permission preserves repairing and permanent-copy restrictions", () => {
  assert.equal(
    getDisplayPermission({ ...item, repairing: true }, [item], 5).reason,
    "This item is currently being repaired.",
  );
  assert.equal(
    getDisplayPermission(
      item,
      [{ ...item, permanent: true }],
      5,
    ).reason,
    "An item of this artwork is already on display.",
  );
  assert.deepEqual(getDisplayPermission(item, [item], 5), { allowed: true });
});
