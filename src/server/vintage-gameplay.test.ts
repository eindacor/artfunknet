import assert from "node:assert/strict";
import test from "node:test";

import {
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

test("vintage selection requires an eligible claimed non-vintage item", () => {
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
      selectedItem: { ...item, repairing: true },
    }).allowed,
    false,
  );
});

test("every owned vintage item is retained regardless of auction status", () => {
  const items = [
    { _id: "selected", vintage: false, status: "claimed" },
    { _id: "auction-win", vintage: true, status: "won" },
    { _id: "consigned", vintage: true, status: "auctioned" },
    { _id: "ordinary", vintage: false, status: "claimed" },
  ];

  const result = partitionVintageItems(items, "selected");

  assert.deepEqual(
    result.keptItems.map((candidate) => candidate._id),
    ["selected", "auction-win", "consigned"],
  );
  assert.deepEqual(
    result.removedItems.map((candidate) => candidate._id),
    ["ordinary"],
  );
});
