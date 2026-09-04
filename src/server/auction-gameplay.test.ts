import assert from "node:assert/strict";
import test from "node:test";

import {
  getPublicAuctionReplenishmentCount,
  PUBLIC_AUCTION_TARGET,
} from "./auction-population.ts";

test("public auctions replenish only the missing system lots", () => {
  assert.equal(PUBLIC_AUCTION_TARGET, 20);
  assert.equal(getPublicAuctionReplenishmentCount(0), 20);
  assert.equal(getPublicAuctionReplenishmentCount(7), 13);
  assert.equal(getPublicAuctionReplenishmentCount(20), 0);
  assert.equal(getPublicAuctionReplenishmentCount(24), 0);
});
