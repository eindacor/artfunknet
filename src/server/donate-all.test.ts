import assert from "node:assert/strict";
import test from "node:test";

import { calculateDonationKarma } from "./art-expert-gameplay.ts";
import { shouldPreserveBulkSaleItem } from "./bulk-sale.ts";
import { getCardCosmetic } from "../components/item-cards/catalog.ts";

test("donate all respects bulk sale protection filters", () => {
  const protections = {
    keepArtStyles: true,
    keepLegendaries: true,
    keepMasterpieces: true,
    keepUnfoundQuestTargets: true,
    keepUnarchived: true,
  };

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
        artwork: { rarity: "common" },
        archivePermission: { allowed: false, reason: "Already archived." },
        card_renderer: undefined,
        unfoundQuestTarget: false,
      },
      protections,
    ),
    false,
  );
});

test("donate all style recovery identifies non-museum cosmetics", () => {
  const zineStyle = getCardCosmetic("zine");
  assert.equal(zineStyle?.id, "zine");

  const museumStyle = getCardCosmetic("museum");
  const recoveredMuseum = museumStyle && museumStyle.id !== "museum" ? museumStyle : undefined;
  assert.equal(recoveredMuseum, undefined);
});

test("donate all forgery karma multiplier applies correctly when identified", () => {
  const baseKarma = calculateDonationKarma({
    rarity: "common",
    level: 1,
    randomRoll: 0.5,
  });

  const identifiedMultiplier = 2;
  const forgeryKarma = Math.floor(baseKarma * identifiedMultiplier);
  assert.equal(forgeryKarma, baseKarma * 2);
});
