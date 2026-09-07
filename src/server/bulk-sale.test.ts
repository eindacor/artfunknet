import assert from "node:assert/strict";
import test from "node:test";

import { shouldPreserveBulkSaleItem } from "./bulk-sale.ts";

const protections = {
  keepArtStyles: true,
  keepLegendaries: true,
  keepMasterpieces: true,
  keepUnfoundQuestTargets: true,
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

test("bulk sale protection preserves unfound quest targets", () => {
  assert.equal(
    shouldPreserveBulkSaleItem(
      {
        artwork: { rarity: "common" },
        unfoundQuestTarget: true,
      },
      protections,
    ),
    true,
  );
  assert.equal(
    shouldPreserveBulkSaleItem(
      {
        artwork: { rarity: "common" },
        unfoundQuestTarget: false,
      },
      { ...protections, keepArtStyles: false, keepUnarchived: false },
    ),
    false,
  );
});

test("bulk sale protection preserves applied art styles", () => {
  assert.equal(
    shouldPreserveBulkSaleItem(
      {
        artwork: { rarity: "common" },
        card_renderer: "zine",
      },
      protections,
    ),
    true,
  );
  assert.equal(
    shouldPreserveBulkSaleItem(
      {
        artwork: { rarity: "common" },
        card_renderer: "museum",
      },
      { ...protections, keepUnarchived: false },
    ),
    false,
  );
});
