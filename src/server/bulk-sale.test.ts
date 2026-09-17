import assert from "node:assert/strict";
import test from "node:test";

import {
  getBulkForgeryDialog,
  getBulkForgeryMessage,
  parseBulkSaleProtections,
  shouldPreserveBulkSaleItem,
} from "./bulk-sale.ts";

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

test("parseBulkSaleProtections handles valid JSON and invalid bodies safely", () => {
  const valid = parseBulkSaleProtections(JSON.stringify({ keepLegendaries: true }));
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.protections.keepLegendaries, true);
    assert.equal(valid.protections.keepMasterpieces, false);
  }

  const invalid = parseBulkSaleProtections("{invalid-json");
  assert.equal(invalid.ok, false);
});

test("getBulkForgeryMessage formats messages for sale and donation actions", () => {
  const saleMsg = getBulkForgeryMessage(1, 2, true, "sale");
  assert.equal(
    saleMsg,
    "The sale failed. 1 known forgery was detected and destroyed; 2 previously unknown forgeries were detected and returned to inventory.",
  );

  const donationMsg = getBulkForgeryMessage(2, 0, true, "donation");
  assert.equal(
    donationMsg,
    "The donation failed. 2 known forgeries were detected and destroyed.",
  );
});

test("getBulkForgeryDialog assigns correct dialog variants", () => {
  assert.equal(getBulkForgeryDialog(1, 1, "test").variant, "mixed");
  assert.equal(getBulkForgeryDialog(1, 0, "test").variant, "destroyed");
  assert.equal(getBulkForgeryDialog(0, 1, "test").variant, "returned");
});
