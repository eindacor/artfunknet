import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateArtExpertKnowledge,
  calculateDonationKnowledge,
  calculateArtExpertRollReduction,
  convertUnitValueToKnowledge,
  DONATION_ART_STYLE_MULTIPLIER,
  getItemKnowledgeUnitValue,
} from "./art-expert-gameplay.ts";
import { getItemValuePropertyMultiplier } from "./gameplay.ts";

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

test("Art Expert knowledge preserves legacy item unit values and base-15 tiers", () => {
  assert.equal(getItemKnowledgeUnitValue("common", 1), 4);
  assert.deepEqual(convertUnitValueToKnowledge(3377), {
    historical_data: 2,
    contextual_understanding: 0,
    technical_comprehension: 0,
    artistic_vision: 1,
  });

  assert.deepEqual(
    calculateArtExpertKnowledge({
      rarity: "common",
      level: 1,
      donorBonusMultiplier: 1,
      randomRoll: 0,
    }),
    {
      historical_data: 2,
      contextual_understanding: 0,
      technical_comprehension: 0,
      artistic_vision: 0,
    },
  );
});

test("donation knowledge preserves the original 90% to 110% item value roll", () => {
  assert.deepEqual(
    calculateDonationKnowledge({
      rarity: "rare",
      level: 2,
      randomRoll: 0,
    }),
    convertUnitValueToKnowledge(
      Math.floor(getItemKnowledgeUnitValue("rare", 2) * 1.1),
    ),
  );
  assert.deepEqual(
    calculateDonationKnowledge({
      rarity: "rare",
      level: 2,
      randomRoll: 0.999999,
    }),
    convertUnitValueToKnowledge(
      Math.floor(getItemKnowledgeUnitValue("rare", 2) * 0.9000002),
    ),
  );
});

test("donation knowledge scales with collectible value properties", () => {
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
  assert.deepEqual(
    calculateDonationKnowledge({
      rarity: "common",
      level: 1,
      valueProperties: featuredProperties,
      hasArtStyle: true,
      randomRoll: 0.5,
    }),
    convertUnitValueToKnowledge(
      60 * DONATION_ART_STYLE_MULTIPLIER,
    ),
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
  assert.deepEqual(
    calculateDonationKnowledge({
      rarity: "rare",
      level: 1,
      valueProperties: otherValueProperties,
      randomRoll: 0.5,
    }),
    convertUnitValueToKnowledge(
      getItemKnowledgeUnitValue("rare", 1) * 104,
    ),
  );
});
