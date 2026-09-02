import assert from "node:assert/strict";
import test from "node:test";

import {
  getSeasonalArtworkSelections,
  toSeasonalArtworkMap,
  validateSeasonalArtworkSelections,
} from "./seasonal-artwork.ts";

const artworks = [
  { _id: "common-art", rarity: "common" as const, active: true },
  { _id: "rare-art", rarity: "rare" as const, active: true },
  { _id: "inactive-art", rarity: "legendary" as const, active: false },
];

test("seasonal artwork selections preserve one artwork per rarity", () => {
  const selections = getSeasonalArtworkSelections({
    seasonal_items: {
      common: ["common-art", "old-common-art"],
      uncommon: [],
      rare: ["rare-art"],
      legendary: [],
      masterpiece: [],
    },
  });

  assert.deepEqual(selections, {
    common: "common-art",
    uncommon: null,
    rare: "rare-art",
    legendary: null,
    masterpiece: null,
  });
  assert.deepEqual(toSeasonalArtworkMap(selections), {
    common: ["common-art"],
    uncommon: [],
    rare: ["rare-art"],
    legendary: [],
    masterpiece: [],
  });
});

test("seasonal artwork selections require an active artwork of matching rarity", () => {
  const valid = validateSeasonalArtworkSelections(
    {
      common: "common-art",
      uncommon: null,
      rare: "rare-art",
      legendary: null,
      masterpiece: null,
    },
    artworks,
  );
  assert.equal(valid.ok, true);

  const wrongRarity = validateSeasonalArtworkSelections(
    {
      common: "rare-art",
      uncommon: null,
      rare: null,
      legendary: null,
      masterpiece: null,
    },
    artworks,
  );
  assert.deepEqual(wrongRarity, {
    ok: false,
    error: "The selected common artwork is unavailable.",
  });
});
