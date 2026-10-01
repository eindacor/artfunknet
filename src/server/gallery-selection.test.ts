import assert from "node:assert/strict";
import test from "node:test";

import { planGallerySelection } from "./gallery-selection.ts";

function item(
  id: string,
  artworkId: string,
  status: "claimed" | "displayed" | "auctioned",
  repairing = false,
) {
  return {
    _id: id,
    artwork_id: artworkId,
    permanent: false,
    repairing,
    status,
  };
}

test("set gallery keeps selected displayed items and replaces the rest", () => {
  const kept = item("kept", "art-a", "displayed");
  const removed = item("removed", "art-b", "displayed");
  const added = item("added", "art-c", "claimed");

  assert.deepEqual(
    planGallerySelection([kept, added], [kept, removed], 3),
    {
      ok: true,
      takeDownIds: ["removed"],
      displayIds: ["added"],
    },
  );
});

test("set gallery rejects selections over capacity or with duplicate artworks", () => {
  assert.deepEqual(
    planGallerySelection(
      [item("a", "same", "claimed"), item("b", "same", "claimed")],
      [],
      2,
    ),
    {
      ok: false,
      reason: "The gallery cannot display two copies of the same artwork.",
    },
  );
  assert.deepEqual(
    planGallerySelection(
      [item("a", "a", "claimed"), item("b", "b", "claimed")],
      [],
      1,
    ),
    {
      ok: false,
      reason: "Your gallery can display at most 1 artwork.",
    },
  );
});

test("set gallery rejects permanent artwork conflicts", () => {
  const selected = item("selected", "art-a", "claimed");
  const permanent = {
    ...item("permanent", "art-a", "claimed"),
    permanent: true,
  };

  assert.deepEqual(planGallerySelection([selected], [selected, permanent], 2), {
    ok: false,
    reason: "A selected artwork is already represented by a permanent copy.",
  });
});
