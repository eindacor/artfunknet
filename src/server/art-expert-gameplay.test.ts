import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateArtExpertKarma,
  calculateDonationKarma,
  calculateArtExpertRollReduction,
  DONATION_ART_STYLE_MULTIPLIER,
  getItemKarmaValue,
  RARITY_BASE_KARMA,
} from "./art-expert-gameplay.ts";
import {
  ARTWORK_RARITIES,
  getItemValuePropertyMultiplier,
} from "./gameplay.ts";

test("Art Expert roll reduction preserves quality and own-gallery bonuses", () => {
  assert.equal(
    calculateArtExpertRollReduction({
      quality: "bronze",
      ownGallery: false,
      donorBonusMultiplier: 1,
    }),
    1,
  );
  assert.equal(
    calculateArtExpertRollReduction({
      quality: "platinum",
      ownGallery: true,
      donorBonusMultiplier: 2,
    }),
    12,
  );
});

test("Art Expert Karma preserves legacy item unit values", () => {
  assert.equal(getItemKarmaValue("common", 1), 4);
  assert.equal(
    calculateArtExpertKarma({
      rarity: "common",
      level: 1,
      donorBonusMultiplier: 1,
      randomRoll: 0,
    }),
    2,
  );
});

test("donation Karma preserves the original 90% to 110% item value roll", () => {
  assert.equal(
    calculateDonationKarma({
      rarity: "rare",
      level: 2,
      randomRoll: 0,
    }),
    Math.floor(getItemKarmaValue("rare", 2) * 1.1),
  );
  assert.equal(
    calculateDonationKarma({
      rarity: "rare",
      level: 2,
      randomRoll: 0.999999,
    }),
    Math.floor(getItemKarmaValue("rare", 2) * 0.9000002),
  );
});

test("donation Karma increases with every artwork rarity tier", () => {
  const rewards = ARTWORK_RARITIES.map((rarity) =>
    calculateDonationKarma({
      rarity,
      level: 1,
      randomRoll: 0.5,
    }),
  );

  assert.deepEqual(
    rewards,
    ARTWORK_RARITIES.map((rarity) => RARITY_BASE_KARMA[rarity]),
  );
  for (let index = 1; index < rewards.length; index += 1) {
    assert.ok(rewards[index] > rewards[index - 1]);
  }
});

test("donation Karma scales with collectible value properties", () => {
  const neutralProperties = {
    foil: false,
    seasonal: false,
    lottery: 0,
    original: false,
    vintage: false,
    unlocked: false,
    mint: false,
    mint_value_multiplier: 1,
  };
  const featuredProperties = {
    ...neutralProperties,
    foil: true,
    unlocked: true,
    mint: true,
    mint_value_multiplier: 2,
  };
  assert.equal(
    getItemValuePropertyMultiplier(featuredProperties, "common"),
    15,
  );
  assert.equal(
    calculateDonationKarma({
      rarity: "common",
      level: 1,
      valueProperties: featuredProperties,
      hasArtStyle: true,
      randomRoll: 0.5,
    }),
    60 * DONATION_ART_STYLE_MULTIPLIER,
  );

  const otherValueProperties = {
    ...neutralProperties,
    seasonal: true,
    lottery: 3,
    vintage: true,
  };
  assert.equal(
    getItemValuePropertyMultiplier(otherValueProperties, "rare"),
    104,
  );
  assert.equal(
    calculateDonationKarma({
      rarity: "rare",
      level: 1,
      valueProperties: otherValueProperties,
      randomRoll: 0.5,
    }),
    getItemKarmaValue("rare", 1) * 104,
  );
});
