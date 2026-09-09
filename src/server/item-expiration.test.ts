import assert from "node:assert/strict";
import test from "node:test";

import {
  DEALER_ITEM_EXPIRATION_MS,
  getDealerItemExpiration,
  getExpiredTransientItemFilter,
  getUnclaimedItemExpiration,
  UNCLAIMED_ITEM_EXPIRATION_MS,
} from "./item-expiration.ts";

test("crate and dealer items use the legacy expiration windows", () => {
  const now = new Date("2026-09-09T12:00:00.000Z");

  assert.equal(
    getUnclaimedItemExpiration(now),
    new Date(now.getTime() + UNCLAIMED_ITEM_EXPIRATION_MS).toISOString(),
  );
  assert.equal(
    getDealerItemExpiration(now),
    new Date(now.getTime() + DEALER_ITEM_EXPIRATION_MS).toISOString(),
  );
  assert.equal(UNCLAIMED_ITEM_EXPIRATION_MS, 60 * 60 * 1000);
  assert.equal(DEALER_ITEM_EXPIRATION_MS, 20 * 60 * 1000);
});

test("expiration cleanup is limited to transient item statuses", () => {
  const filter = getExpiredTransientItemFilter(
    new Date("2026-09-09T12:00:00.000Z"),
  );
  const serialized = JSON.stringify(filter);

  assert.match(serialized, /"status":"unclaimed"/);
  assert.match(serialized, /"status":"for_sale"/);
  assert.doesNotMatch(serialized, /"status":"claimed"/);
  assert.doesNotMatch(serialized, /"status":"displayed"/);
});
