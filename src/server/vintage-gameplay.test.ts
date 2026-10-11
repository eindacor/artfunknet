import assert from "node:assert/strict";
import test from "node:test";

import {
  getCommemorateItemLimit,
  getVintagePlaythroughPermission,
  partitionVintageItems,
} from "./vintage-gameplay.ts";

const item = {
  owner: "player",
  status: "claimed" as const,
  original: false,
  vintage: false,
  repairing: false,
};

test("commemoration limits add the configured bonus at rare supporter status", () => {
  const getLimit = (supporterStatus: "common" | "uncommon" | "rare" | "legendary" | "masterpiece" | null) =>
    getCommemorateItemLimit({
      baseCount: 4,
      rareSupporterBonusCount: 8,
      supporterStatus,
    });

  assert.equal(getLimit(null), 4);
  assert.equal(getLimit("common"), 4);
  assert.equal(getLimit("uncommon"), 4);
  assert.equal(getLimit("rare"), 12);
  assert.equal(getLimit("legendary"), 12);
  assert.equal(getLimit("masterpiece"), 12);
});

test("vintage playthroughs require maximum level and no active auctions", () => {
  assert.equal(
    getVintagePlaythroughPermission({
      level: 49,
      activeAuctionCount: 0,
      selectedItem: item,
    }).allowed,
    false,
  );
  assert.equal(
    getVintagePlaythroughPermission({
      level: 50,
      activeAuctionCount: 1,
      selectedItem: item,
    }).allowed,
    false,
  );
  assert.deepEqual(
    getVintagePlaythroughPermission({
      level: 50,
      activeAuctionCount: 0,
      selectedItem: item,
    }),
    { allowed: true },
  );
});

test("vintage selection requires an eligible collected non-vintage item", () => {
  assert.equal(
    getVintagePlaythroughPermission({
      level: 50,
      activeAuctionCount: 0,
      selectedItem: { ...item, vintage: true },
    }).allowed,
    false,
  );
  assert.equal(
    getVintagePlaythroughPermission({
      level: 50,
      activeAuctionCount: 0,
      selectedItem: { ...item, status: "displayed" },
    }).allowed,
    true,
  );
  assert.equal(
    getVintagePlaythroughPermission({
      level: 50,
      activeAuctionCount: 0,
      selectedItem: { ...item, repairing: true },
    }).allowed,
    false,
  );
});

test("every owned vintage item is retained regardless of auction status", () => {
  const items = [
    {
      _id: "selected",
      original: false,
      vintage: false,
      status: "claimed",
    },
    {
      _id: "auction-win",
      original: false,
      vintage: true,
      status: "won",
    },
    {
      _id: "consigned",
      original: false,
      vintage: true,
      status: "auctioned",
    },
    {
      _id: "original",
      original: true,
      vintage: false,
      status: "displayed",
    },
    {
      _id: "ordinary",
      original: false,
      vintage: false,
      status: "claimed",
    },
  ];

  const result = partitionVintageItems(items, "selected");

  assert.deepEqual(
    result.keptItems.map((candidate) => candidate._id),
    ["selected", "auction-win", "consigned", "original"],
  );
  assert.deepEqual(
    result.removedItems.map((candidate) => candidate._id),
    ["ordinary"],
  );
});
