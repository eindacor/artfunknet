import {
  type ArtworkRarity,
  type GameItem,
  getItemValuePropertyMultiplier,
} from "./gameplay.ts";
import type { NpcQuality } from "./npc-gameplay.ts";

export const DONATION_ART_STYLE_MULTIPLIER = 1.5;
export const RARITY_BASE_KARMA: Record<ArtworkRarity, number> = {
  common: 4,
  uncommon: 17,
  rare: 77,
  legendary: 340,
  masterpiece: 1499,
};

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

export function getItemKarmaValue(
  rarity: ArtworkRarity,
  level: number,
): number {
  const levelMultiplier = Math.pow(1.4, level - 1);
  return Math.floor(RARITY_BASE_KARMA[rarity] * levelMultiplier);
}

export function calculateArtExpertKarma({
  rarity,
  level,
  donorBonusMultiplier,
  randomRoll,
}: {
  rarity: ArtworkRarity;
  level: number;
  donorBonusMultiplier: number;
  randomRoll: number;
}): number {
  const unitValue =
    getItemKarmaValue(rarity, level) * donorBonusMultiplier;
  const modifier =
    0.2 + 0.2 * Math.min(Math.max(randomRoll, 0), 0.999999999999);
  return Math.max(Math.floor(unitValue * modifier), 2);
}

export function calculateDonationKarma({
  rarity,
  level,
  valueProperties,
  hasArtStyle = false,
  randomRoll,
}: {
  rarity: ArtworkRarity;
  level: number;
  valueProperties?: Pick<
    GameItem,
    | "foil"
    | "seasonal"
    | "lottery"
    | "original"
    | "vintage"
    | "unlocked"
    | "mint"
    | "mint_value_multiplier"
  >;
  hasArtStyle?: boolean;
  randomRoll: number;
}): number {
  const modifier =
    1 + (0.5 - Math.min(Math.max(randomRoll, 0), 0.999999999999)) * 0.2;
  const propertyMultiplier = valueProperties
    ? getItemValuePropertyMultiplier(valueProperties, rarity)
    : 1;
  const artStyleMultiplier = hasArtStyle
    ? DONATION_ART_STYLE_MULTIPLIER
    : 1;
  return Math.floor(
    getItemKarmaValue(rarity, level) *
      propertyMultiplier *
      artStyleMultiplier *
      modifier,
  );
}
