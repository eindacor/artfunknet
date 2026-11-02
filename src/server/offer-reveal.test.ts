import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_OFFER_REVEAL_THRESHOLDS as cutoffs,
  canQuickSellItem,
  getInitialItemRevealState,
  getOfferRevealTier,
  isOfferRevealed,
  validateOfferRevealThresholds,
} from "./offer-reveal.ts";

test("offer tiers use current odds, strict cutoffs, and include valid zero probability", () => {
  for (const [coefficient, tier] of [
    [0.1, 0], [cutoffs.level1, 0], [cutoffs.level1 / 2, 1],
    [cutoffs.level2, 1], [cutoffs.level2 / 2, 2],
    [cutoffs.level3, 2], [cutoffs.level3 / 2, 3], [0, 3],
  ] as const) {
    assert.equal(getOfferRevealTier({ drop_chance_coefficient: coefficient }), tier);
  }
  const item = { drop_chance_coefficient: 0.1, original_drop_chance_coefficient: 1e-12 };
  assert.equal(getOfferRevealTier(item), 0);
  assert.equal(getOfferRevealTier({ ...item, drop_chance_coefficient: 1e-12 }), 3);
});

test("quick sell always preserves sealed items regardless of cutoffs or forgery identification", () => {
  const sealed = { revealed: false, status: "unclaimed", drop_chance_coefficient: 1e-12 };
  assert.equal(canQuickSellItem(sealed), false);
  assert.equal(canQuickSellItem({ ...sealed, status: "claimed" }), false);
  assert.equal(canQuickSellItem(sealed, { level1: 0, level2: 0, level3: 0 }), false);
  assert.equal(canQuickSellItem({ ...sealed, odds: "unknown" }), false);
  assert.equal(canQuickSellItem({ ...sealed, revealed: true }), true);
  assert.equal(canQuickSellItem({ status: "unclaimed", drop_chance_coefficient: 1e-12 }), false);
  assert.equal(canQuickSellItem({ status: "unclaimed", drop_chance_coefficient: 0.1 }), true);
  assert.equal(canQuickSellItem({ status: "claimed", drop_chance_coefficient: 1e-12 }), true);
});

test("Masterpieces always use Level 3 without re-masking revealed items", () => {
  const item = { artwork: { rarity: "masterpiece" }, status: "unclaimed" };
  const disabled = { level1: 0, level2: 0, level3: 0 };
  for (const coefficient of [1, 0.1, cutoffs.level1, 0, undefined]) {
    assert.equal(getOfferRevealTier({ ...item, drop_chance_coefficient: coefficient }), 3);
    assert.equal(getOfferRevealTier({ ...item, drop_chance_coefficient: coefficient }, disabled), 3);
  }
  assert.equal(getOfferRevealTier({ ...item, odds: "unknown" }), 3);
  assert.equal(getOfferRevealTier({ ...item, odds: "forged" }), 3);
  assert.equal(getOfferRevealTier({ ...item, artwork: { rarity: "rare" }, drop_chance_coefficient: 0.1 }), 0);
  assert.equal(getInitialItemRevealState(item, disabled), false);
  assert.equal(getInitialItemRevealState({ ...item, status: "auctioned", source: "private auction" }, disabled), false);
  assert.equal(isOfferRevealed({ ...item, revealed: true }, disabled), true);
  assert.equal(isOfferRevealed({ ...item, status: "claimed" }, disabled), true);
  assert.equal(isOfferRevealed({ ...item, status: "claimed", revealed: false }, disabled), false);
  assert.equal(canQuickSellItem(item, disabled), false);
});

test("Legendaries have a Level 2 floor but can still reach Level 3", () => {
  const item = { artwork: { rarity: "legendary" }, status: "unclaimed" };
  const disabled = { level1: 0, level2: 0, level3: 0 };
  for (const coefficient of [1, 0.1, cutoffs.level1, cutoffs.level3, undefined]) {
    assert.equal(getOfferRevealTier({ ...item, drop_chance_coefficient: coefficient }), 2);
    assert.equal(getOfferRevealTier({ ...item, drop_chance_coefficient: coefficient }, disabled), 2);
  }
  assert.equal(getOfferRevealTier({ ...item, drop_chance_coefficient: cutoffs.level3 / 2 }), 3);
  assert.equal(getOfferRevealTier({ ...item, drop_chance_coefficient: 0 }), 3);
  assert.equal(getOfferRevealTier({ ...item, odds: "unknown" }), 2);
  assert.equal(getInitialItemRevealState(item, disabled), false);
  assert.equal(isOfferRevealed({ ...item, revealed: true }, disabled), true);
  assert.equal(isOfferRevealed({ ...item, status: "claimed" }, disabled), true);
  assert.equal(isOfferRevealed({ ...item, status: "claimed", revealed: false }, disabled), false);
  assert.equal(canQuickSellItem(item, disabled), false);
});

test("lower rarities with masked authenticity odds or invalid probabilities never advertise a reveal tier", () => {
  for (const odds of ["unknown", "forged", " UNKNOWN ", "Forged"]) {
    assert.equal(getOfferRevealTier({ odds, drop_chance_coefficient: 0 }), 0);
  }
  for (const coefficient of [undefined, NaN, Infinity, -1, 1.1]) {
    assert.equal(getOfferRevealTier({ drop_chance_coefficient: coefficient }), 0);
  }
});

test("ordered cutoffs support skipped or disabled tiers and reject malformed configurations", () => {
  assert.equal(validateOfferRevealThresholds(cutoffs).ok, true);
  assert.equal(getOfferRevealTier({ drop_chance_coefficient: 0 }, { level1: 0, level2: 0, level3: 0 }), 0);
  assert.equal(getOfferRevealTier({ drop_chance_coefficient: 0.005 }, { level1: 0.01, level2: 0.01, level3: 0 }), 2);
  for (const value of [
    undefined, [], { ...cutoffs, level1: "0.001" }, { ...cutoffs, level3: NaN },
    { ...cutoffs, level3: -1 }, { ...cutoffs, level1: 1.1 },
    { ...cutoffs, level3: 0.01 }, { ...cutoffs, level2: 0.1 },
  ]) assert.equal(validateOfferRevealThresholds(value).ok, false);
});

test("reveal state stays with an item and never re-masks known items", () => {
  const item = { status: "unclaimed", drop_chance_coefficient: 1e-12 };
  assert.equal(getInitialItemRevealState(item), false);
  assert.equal(isOfferRevealed(item), false);
  assert.equal(isOfferRevealed({ ...item, status: "claimed" }), true);
  assert.equal(isOfferRevealed({ ...item, status: "auctioned" }), true);
  assert.equal(getInitialItemRevealState({ ...item, status: "auctioned", source: "private auction" }), false);
  assert.equal(isOfferRevealed({ ...item, status: "auctioned", source: "private auction" }), true);
  assert.equal(isOfferRevealed({ ...item, status: "claimed", revealed: false }), false);
  assert.equal(isOfferRevealed({ ...item, revealed: true }, { level1: 1, level2: 1, level3: 1 }), true);
  assert.equal(getInitialItemRevealState({ ...item, status: "claimed" }), true);
  assert.equal(getInitialItemRevealState({ status: "unclaimed", drop_chance_coefficient: 0.2 }), true);
});

test("disabling player reveals starts offers revealed across all reveal tiers", () => {
  for (const artwork of [{ rarity: "rare" }, { rarity: "legendary" }, { rarity: "masterpiece" }]) {
    for (const status of ["unclaimed", "for_sale", "auctioned"]) {
      const item = { artwork, status, source: "private auction", drop_chance_coefficient: cutoffs.level1 / 2 };
      assert.equal(getInitialItemRevealState(item), false);
      const revealed = getInitialItemRevealState(item, cutoffs, false);
      assert.equal(revealed, true);
      assert.equal(canQuickSellItem({ ...item, revealed }), true);
    }
  }
});
