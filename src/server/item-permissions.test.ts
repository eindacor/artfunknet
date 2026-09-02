import assert from "node:assert/strict";
import test from "node:test";

import {
  getArchivePermission,
  getDisplayPermission,
  getPlayerFacingArchivePermission,
} from "./item-permissions.ts";

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

const archiveItem = {
  status: "claimed" as const,
  repairing: false,
  original: false,
  mint: true,
  foil: false,
  unlocked: false,
  seasonal: false,
  lottery: 0,
  vintage: false,
  card_renderer: "abstract",
  authenticity: {
    forgery: false,
    identified: false,
    forgery_quality: 1,
    liable: "",
    liability_pending: false,
    fee: 0,
    original_owner: "",
  },
};

test("archive permission requires a new modifier or art style", () => {
  assert.deepEqual(getArchivePermission(archiveItem, ["mint"], ["abstract"]), {
    allowed: false,
    reason:
      "This item's modifiers and art style are already represented in the archive.",
  });
  assert.deepEqual(getArchivePermission(archiveItem, [], ["abstract"]), {
    allowed: true,
  });
  assert.deepEqual(getArchivePermission(archiveItem, ["mint"], []), {
    allowed: true,
  });
});

test("known forgeries cannot be archived but unidentified ones can be inspected", () => {
  assert.deepEqual(
    getArchivePermission(
      {
        ...archiveItem,
        authenticity: {
          ...archiveItem.authenticity,
          forgery: true,
          identified: true,
        },
      },
      [],
      [],
    ),
    {
      allowed: false,
      reason: "A known forgery cannot be archived.",
    },
  );
  assert.deepEqual(
    getArchivePermission(
      {
        ...archiveItem,
        authenticity: {
          ...archiveItem.authenticity,
          forgery: true,
          identified: false,
        },
      },
      [],
      [],
    ),
    { allowed: true },
  );
});

test("unauthenticated archive permission does not reveal hidden forgery status", () => {
  const legitimate = {
    ...archiveItem,
    authenticity: {
      ...archiveItem.authenticity,
      forgery: false,
      identified: false,
    },
  };
  const forgery = {
    ...legitimate,
    authenticity: {
      ...legitimate.authenticity,
      forgery: true,
    },
  };
  assert.deepEqual(
    getPlayerFacingArchivePermission(
      legitimate,
      ["mint"],
      ["abstract"],
    ),
    { allowed: true },
  );
  assert.deepEqual(
    getPlayerFacingArchivePermission(
      forgery,
      ["mint"],
      ["abstract"],
    ),
    { allowed: true },
  );
});
