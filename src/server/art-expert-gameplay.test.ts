import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateArtExpertKnowledge,
  calculateDonationKnowledge,
  calculateArtExpertRollReduction,
  convertUnitValueToKnowledge,
  getItemKnowledgeUnitValue,
} from "./art-expert-gameplay.ts";

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
