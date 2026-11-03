import assert from "node:assert/strict";
import test from "node:test";

import {
  getArchivePermission,
  getDisplayPermission,
  getItemDisposalPermission,
  getPlayerFacingArchivePermission,
  type ItemDisposalAction,
} from "./item-permissions.ts";
import { getPermanentCollectionPermission } from "./permanent-collection.ts";

const item = {
  _id: "inventory-copy",
  artwork_id: "artwork",
  status: "claimed" as const,
  repairing: false,
  permanent: false,
};

test("destructive permissions share protected-work messages for every sale and disposal action", () => {
  const verbs: Record<ItemDisposalAction, string> = {
    sell: "sold", donate: "donated", historian: "sent to the Historian",
    "collector-sale": "sold to Art Collectors", auction: "auctioned",
  };
  for (const action of Object.keys(verbs) as ItemDisposalAction[]) {
    assert.deepEqual(getItemDisposalPermission(item, action), { allowed: true });
    for (const flags of [
      { status: "displayed", permanent: false },
      { status: "claimed", permanent: true },
      { status: "displayed", permanent: true, original: true },
    ] as const) {
      assert.deepEqual(getItemDisposalPermission({ ...item, ...flags }, action), {
        allowed: false,
        reason: `Featured works and works in your permanent collection can't be ${verbs[action]}.`,
      });
    }
  }
});

test("shared disposal gates retain Original, repair, offer and auction eligibility", () => {
  for (const action of ["sell", "donate", "collector-sale"] as const) {
    assert.match(getItemDisposalPermission({ ...item, original: true }, action).reason!, /Original artwork/);
  }
  for (const action of ["historian", "auction"] as const) {
    assert.equal(getItemDisposalPermission({ ...item, original: true }, action).allowed, true);
    assert.match(getItemDisposalPermission({ ...item, repairing: true }, action).reason!, /being repaired/);
  }
  assert.equal(getItemDisposalPermission({ ...item, status: "for_sale" }, "donate").allowed, true);
  assert.equal(getItemDisposalPermission({ ...item, status: "for_sale" }, "historian").allowed, true);
  assert.equal(getItemDisposalPermission({ ...item, status: "won" }, "collector-sale").allowed, true);
  for (const action of ["sell", "donate", "historian", "collector-sale", "auction"] as const) {
    assert.equal(getItemDisposalPermission({ ...item, status: "auctioned" }, action).allowed, false);
  }
});

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
      reason: "An item of this artwork is already featured or in your permanent collection.",
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
          permanent: true,
        },
      ],
      1,
    ),
    {
      allowed: false,
      reason: "You have reached your featured-work limit.",
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
      [{ ...item, _id: "permanent-copy", permanent: true }],
      5,
    ).reason,
    "An item of this artwork is already featured or in your permanent collection.",
  );
  assert.deepEqual(getDisplayPermission(item, [item], 5), { allowed: true });
  const permanent = { ...item, permanent: true };
  assert.deepEqual(getDisplayPermission(permanent, [permanent], 5), { allowed: true });
});

test("permanent collection accepts collected or promoted artwork and honors duplicates and capacity", () => {
  assert.deepEqual(getPermanentCollectionPermission(item, [item], 12), { allowed: true });
  for (const status of ["unclaimed", "for_sale", "auctioned"] as const) {
    assert.equal(getPermanentCollectionPermission({ ...item, status }, [item], 12).allowed, false);
  }
  assert.equal(getPermanentCollectionPermission({ ...item, status: "displayed" }, [item], 1).allowed, true);
  for (const duplicate of [
    { ...item, _id: "other", permanent: true },
    { ...item, _id: "other", status: "displayed" as const },
  ]) {
    assert.equal(getPermanentCollectionPermission(item, [item, duplicate], 12).allowed, false);
  }
  const permanent = { ...item, _id: "other", artwork_id: "other-art", permanent: true };
  assert.equal(getPermanentCollectionPermission(item, [item, permanent], 1).allowed, false);
  assert.deepEqual(getPermanentCollectionPermission(permanent, [item, permanent], 0), { allowed: true });
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
  assert.deepEqual(getArchivePermission({ ...archiveItem, status: "displayed" }, [], []), { allowed: true });
  assert.equal(getArchivePermission({ ...archiveItem, status: "displayed", original: true }, [], []).allowed, false);
  assert.equal(getArchivePermission({ ...archiveItem, status: "displayed", repairing: true }, [], []).allowed, false);
  assert.deepEqual(getArchivePermission({ ...archiveItem, permanent: true }, [], []), {
    allowed: false,
    reason: "Works in your permanent collection can't be archived.",
  });
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

test("known forgeries cannot be archived but unknown forgeries can be inspected", () => {
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
    {
      allowed: false,
      reason:
        "This item's modifiers and art style are already represented in the archive.",
    },
  );
  assert.deepEqual(
    getPlayerFacingArchivePermission(
      forgery,
      ["mint"],
      ["abstract"],
    ),
    {
      allowed: false,
      reason:
        "This item's modifiers and art style are already represented in the archive.",
    },
  );
  assert.deepEqual(
    getPlayerFacingArchivePermission(legitimate, [], ["abstract"]),
    { allowed: true },
  );
  assert.deepEqual(
    getPlayerFacingArchivePermission(forgery, [], ["abstract"]),
    { allowed: true },
  );
});
