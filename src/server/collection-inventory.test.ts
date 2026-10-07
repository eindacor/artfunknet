import assert from "node:assert/strict";
import test from "node:test";

import {
  filterCollectionItems,
  getDefaultCollectionFilters,
  getInventoryComparator,
  type CollectionInventoryItem,
} from "./collection-inventory.ts";

function item(
  overrides: Partial<CollectionInventoryItem> & {
    _id: string;
    artwork_id: string;
  },
): CollectionInventoryItem {
  return {
    _id: overrides._id,
    artwork_id: overrides.artwork_id,
    status: "claimed",
    date_received: "2026-09-30T12:00:00.000Z",
    condition: 1,
    level: 0,
    repairing: false,
    mint: false,
    foil: false,
    unlocked: false,
    seasonal: false,
    lottery: 0,
    original: false,
    vintage: false,
    tags: [],
    attributes: { locked: [], unlocked: [], special: [] },
    authenticity: {
      forgery: false,
      forgery_quality: 0,
      liable: "",
      liability_pending: false,
      identified: false,
      fee: 0,
      original_owner: "",
    },
    values: {
      sell: 0,
      purchase: 0,
      actual: 100,
      auction_min: 0,
      collector: 0,
      dealer: 0,
    },
    artwork: {
      title: "Untitled",
      artist: "Unknown",
      rarity: "common",
      date: "1900",
    },
    ...overrides,
  };
}

test("collection search restores text, hashtag, and keyword filtering", () => {
  const first = item({
    _id: "first",
    artwork_id: "shared",
    tags: ["primary"],
    artwork: {
      title: "Sunflowers",
      artist: "Vincent van Gogh",
      rarity: "rare",
      date: "1888",
    },
  });
  const second = item({
    _id: "second",
    artwork_id: "shared",
    tags: ["secondary"],
  });
  const third = item({ _id: "third", artwork_id: "unique" });

  const filters = getDefaultCollectionFilters();
  filters.search = "sunflowers, #primary, *dupes";
  assert.deepEqual(
    filterCollectionItems([first, second, third], filters).map(
      (candidate) => candidate._id,
    ),
    ["first"],
  );
});

test("collection filters support status, rarity, flags, and attributes", () => {
  const matching = item({
    _id: "matching",
    artwork_id: "matching-art",
    status: "displayed",
    card_renderer: "arcade",
    foil: true,
    artwork: {
      title: "Match",
      artist: "Artist",
      rarity: "legendary",
      date: "2000",
    },
    attributes: {
      locked: [
        {
          _id: "a",
          title: "A",
          type: "standard",
          description: "",
          icon: "",
          npc_name: "A",
          active: true,
        },
      ],
      unlocked: [],
      special: [
        {
          _id: "special",
          title: "Special",
          type: "special",
          description: "",
          icon: "",
          npc_name: "Special",
          active: true,
        },
      ],
    },
  });
  const filters = getDefaultCollectionFilters();
  filters.statuses = ["displayed"];
  filters.rarities = ["legendary"];
  filters.artStyle = "arcade";
  filters.flags.foil = "only";
  filters.attributeIds = ["a"];
  filters.specialAttributeIds = ["special"];
  assert.deepEqual(filterCollectionItems([matching], filters), [matching]);
  filters.artStyle = "museum";
  assert.deepEqual(filterCollectionItems([matching], filters), []);
  filters.artStyle = "arcade";
  filters.flags.foil = "exclude";
  assert.deepEqual(filterCollectionItems([matching], filters), []);
});

test("collection property filters include Mint items", () => {
  const mint = item({
    _id: "mint",
    artwork_id: "mint-art",
    mint: true,
  });
  const standard = item({
    _id: "standard",
    artwork_id: "standard-art",
  });
  const filters = getDefaultCollectionFilters();

  filters.flags.mint = "only";
  assert.deepEqual(filterCollectionItems([mint, standard], filters), [mint]);

  filters.flags.mint = "exclude";
  assert.deepEqual(filterCollectionItems([mint, standard], filters), [
    standard,
  ]);
});

test("duplicate filtering respects the selected collection statuses", () => {
  const claimed = item({
    _id: "claimed",
    artwork_id: "shared",
    status: "claimed",
  });
  const displayed = item({
    _id: "displayed",
    artwork_id: "shared",
    status: "displayed",
  });
  const filters = getDefaultCollectionFilters();
  filters.search = "*dupes";
  filters.statuses = ["claimed"];
  assert.deepEqual(filterCollectionItems([claimed, displayed], filters), []);
  filters.statuses = ["claimed", "displayed"];
  assert.deepEqual(
    filterCollectionItems([claimed, displayed], filters).map(
      (candidate) => candidate._id,
    ),
    ["claimed", "displayed"],
  );
});

test("inventory sorting supports restored reverse and level choices", () => {
  const low = item({
    _id: "low",
    artwork_id: "low-art",
    level: 1,
    artwork: {
      title: "A",
      artist: "A",
      rarity: "common",
      date: "1900",
    },
  });
  const high = item({
    _id: "high",
    artwork_id: "high-art",
    level: 10,
    artwork: {
      title: "Z",
      artist: "Z",
      rarity: "masterpiece",
      date: "2020",
    },
  });
  assert.deepEqual(
    [low, high].sort(getInventoryComparator("level-high")).map(
      (candidate) => candidate._id,
    ),
    ["high", "low"],
  );
  assert.deepEqual(
    [low, high].sort(getInventoryComparator("title-desc")).map(
      (candidate) => candidate._id,
    ),
    ["high", "low"],
  );
});
