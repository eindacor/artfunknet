import {
  ARTWORK_RARITIES,
  type ArtworkRarity,
} from "./gameplay.ts";
import type { NpcQuality } from "./npc-gameplay.ts";

export const KNOWLEDGE_TYPES = [
  "historical_data",
  "contextual_understanding",
  "technical_comprehension",
  "artistic_vision",
] as const;

export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number];
export type KnowledgeReward = Record<KnowledgeType, number>;

const KNOWLEDGE_BASE = 15;
const KNOWLEDGE_UNIT = 4;

const QUALITY_ROLL_REDUCTIONS: Record<NpcQuality, number> = {
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
};

export function calculateArtExpertRollReduction({
  quality,
  ownGallery,
  donorBonusMultiplier,
}: {
  quality: NpcQuality;
  ownGallery: boolean;
  donorBonusMultiplier: number;
}): number {
  let reduction = QUALITY_ROLL_REDUCTIONS[quality];
  if (ownGallery) {
    reduction += 2;
    reduction *= donorBonusMultiplier;
  }
  return Math.max(0, Math.floor(reduction));
}

export function getItemKnowledgeUnitValue(
  rarity: ArtworkRarity,
  level: number,
): number {
  const rarityIndex = ARTWORK_RARITIES.indexOf(rarity);
  const rarityMultiplier = Math.pow(1.1, rarityIndex);
  const levelMultiplier = Math.pow(1.4, level - 1);
  return Math.floor(
    Math.pow(KNOWLEDGE_UNIT, rarityIndex + 1) *
      rarityMultiplier *
      levelMultiplier,
  );
}

export function convertUnitValueToKnowledge(
  unitValue: number,
): KnowledgeReward {
  let remaining = Math.max(0, Math.floor(unitValue));
  const reward = {} as KnowledgeReward;
  for (let index = KNOWLEDGE_TYPES.length - 1; index >= 0; index -= 1) {
    const tierCost = Math.floor(remaining / Math.pow(KNOWLEDGE_BASE, index));
    remaining -= Math.pow(KNOWLEDGE_BASE, index) * tierCost;
    reward[KNOWLEDGE_TYPES[index]] = tierCost;
  }
  return reward;
}

export function calculateArtExpertKnowledge({
  rarity,
  level,
  donorBonusMultiplier,
  randomRoll,
}: {
  rarity: ArtworkRarity;
  level: number;
  donorBonusMultiplier: number;
  randomRoll: number;
}): KnowledgeReward {
  const unitValue =
    getItemKnowledgeUnitValue(rarity, level) * donorBonusMultiplier;
  const modifier =
    0.2 + 0.2 * Math.min(Math.max(randomRoll, 0), 0.999999999999);
  return convertUnitValueToKnowledge(
    Math.max(Math.floor(unitValue * modifier), 2),
  );
}
