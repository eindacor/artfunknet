import assert from "node:assert/strict";
import test from "node:test";

import {
  CRATE_ITEM_EXPIRATION_MS,
  getCrateItemExpiration,
  getExpiredTransientItemFilter,
  getNpcOfferItemExpiration,
  getUnclaimedItemExpiration,
  NPC_OFFER_ITEM_EXPIRATION_MS,
  UNCLAIMED_ITEM_EXPIRATION_MS,
} from "./item-expiration.ts";

test("transient items use their configured expiration windows", () => {
  const now = new Date("2026-09-09T12:00:00.000Z");

  assert.equal(
    getUnclaimedItemExpiration(now),
    new Date(now.getTime() + UNCLAIMED_ITEM_EXPIRATION_MS).toISOString(),
  );
  assert.equal(
    getCrateItemExpiration(now),
    new Date(now.getTime() + CRATE_ITEM_EXPIRATION_MS).toISOString(),
  );
  assert.equal(
    getNpcOfferItemExpiration(now),
    new Date(now.getTime() + NPC_OFFER_ITEM_EXPIRATION_MS).toISOString(),
  );
  assert.equal(UNCLAIMED_ITEM_EXPIRATION_MS, 60 * 60 * 1000);
  assert.equal(CRATE_ITEM_EXPIRATION_MS, 30 * 60 * 1000);
  assert.equal(NPC_OFFER_ITEM_EXPIRATION_MS, 10 * 60 * 1000);
});

test("expiration cleanup is limited to transient item statuses", () => {
  const filter = getExpiredTransientItemFilter(
    new Date("2026-09-09T12:00:00.000Z"),
  );
  const serialized = JSON.stringify(filter);

  assert.match(serialized, /"status":"unclaimed"/);
  assert.match(serialized, /"status":"for_sale"/);
  assert.match(serialized, /art donor/);
  assert.match(serialized, /art dealer/);
  assert.doesNotMatch(serialized, /"status":"claimed"/);
  assert.doesNotMatch(serialized, /"status":"displayed"/);
});
