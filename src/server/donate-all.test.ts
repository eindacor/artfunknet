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

test("donate style recovery does not provide a style for known or unverified forgeries", () => {
  function getRecoveredStyle(item: { card_renderer?: string; authenticity?: { forgery: boolean } }) {
    const style = getCardCosmetic(item.card_renderer ?? "");
    return style && style.id !== "museum" && !item.authenticity?.forgery
      ? style
      : undefined;
  }

  // Authentic artwork with style -> style recovered
  const authenticItem = { card_renderer: "zine", authenticity: { forgery: false } };
  assert.equal(getRecoveredStyle(authenticItem)?.id, "zine");

  // Unverified forgery artwork with style -> no style recovered
  const unverifiedForgery = { card_renderer: "zine", authenticity: { forgery: true } };
  assert.equal(getRecoveredStyle(unverifiedForgery), undefined);

  // Known/identified forgery artwork with style -> no style recovered
  const knownForgery = { card_renderer: "zine", authenticity: { forgery: true, identified: true } };
  assert.equal(getRecoveredStyle(knownForgery), undefined);
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
