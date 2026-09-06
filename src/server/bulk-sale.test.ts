import assert from "node:assert/strict";
import test from "node:test";

import { shouldPreserveBulkSaleItem } from "./bulk-sale.ts";

const protections = {
  keepLegendaries: true,
  keepMasterpieces: true,
  keepUnarchived: true,
};

test("bulk sale protections preserve selected rarity tiers", () => {
  assert.equal(
    shouldPreserveBulkSaleItem(
      {
        artwork: { rarity: "legendary" },
        archivePermission: { allowed: false, reason: "Already archived." },
      },
      protections,
    ),
    true,
  );
  assert.equal(
    shouldPreserveBulkSaleItem(
      {
        artwork: { rarity: "masterpiece" },
        archivePermission: { allowed: false, reason: "Already archived." },
      },
      protections,
    ),
    true,
  );
});

test("bulk sale protection preserves archive-eligible variants", () => {
  assert.equal(
    shouldPreserveBulkSaleItem(
      {
        artwork: { rarity: "common" },
        archivePermission: { allowed: true },
      },
      protections,
    ),
    true,
  );
  assert.equal(
    shouldPreserveBulkSaleItem(
      {
        artwork: { rarity: "common" },
        archivePermission: { allowed: false, reason: "Already archived." },
      },
      protections,
    ),
    false,
  );
});
