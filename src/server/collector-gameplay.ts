import {
  ARTWORK_RARITIES,
  type ArtworkRarity,
  type GameItem,
} from "./gameplay.ts";
import type { NpcQuality } from "./npc-gameplay.ts";

const QUALITY_MULTIPLIERS: Record<NpcQuality, number> = {
  bronze: 1.4,
  silver: 1.48,
  gold: 1.56,
  platinum: 1.64,
};

const OWN_GALLERY_MULTIPLIER = 1.75;
const LEGENDARY_INCREMENT = 0.2;

export const COLLECTOR_MEETING_LIMITS: Record<NpcQuality, number> = {
  bronze: 120,
  silver: 100,
  gold: 80,
  platinum: 60,
};

export function getHighestAvailableCollectorQuality(
  meetings: Partial<Record<NpcQuality, number>>,
): NpcQuality | null {
  for (const quality of ["platinum", "gold", "silver", "bronze"] as const) {
    if ((meetings[quality] ?? 0) < COLLECTOR_MEETING_LIMITS[quality]) {
      return quality;
    }
  }
  return null;
}

export function calculateCollectorReward({
  item,
  quality,
  ownGallery,
  goodConditionBonus,
  rollCountBonus,
  xpOffer,
  xpChunk,
}: {
  item: Pick<GameItem, "condition" | "level" | "roll_count" | "values">;
  quality: NpcQuality;
  ownGallery: boolean;
  goodConditionBonus: boolean;
  rollCountBonus: boolean;
  xpOffer: boolean;
  xpChunk: number;
}): { amount: number; type: "money" | "xp"; multiplier: number } {
  let multiplier = QUALITY_MULTIPLIERS[quality];
  if (ownGallery) multiplier *= OWN_GALLERY_MULTIPLIER;
  if (goodConditionBonus && item.condition > 0.8) {
    multiplier += LEGENDARY_INCREMENT;
  }
  if (rollCountBonus && item.roll_count <= 0) {
    multiplier += LEGENDARY_INCREMENT;
  }

  if (xpOffer) {
    const chunkPercentage = (0.1 + 0.02 * item.level) * multiplier;
    return {
      amount: Math.floor(xpChunk * chunkPercentage),
      type: "xp",
      multiplier,
    };
  }

  return {
    amount: Math.floor(Math.floor(item.values.actual) * multiplier),
    type: "money",
    multiplier,
  };
}

const FORGERY_HEAT_COEFFICIENTS = {
  rarity: 0.85,
  foil: 0.4,
  unlocked: 0.1,
  seasonal: 0.4,
  vintage: 0.3,
  lottery: 0.6,
  level: 0.2,
};

export function getCollectorForgeryHeat(
  item: Pick<
    GameItem,
    | "foil"
    | "unlocked"
    | "seasonal"
    | "vintage"
    | "lottery"
    | "level"
  > & {
    authenticity: Pick<
      GameItem["authenticity"],
      "forgery_quality" | "identified"
    >;
    artwork: { rarity: ArtworkRarity };
  },
  reduced: boolean,
): number {
  let typeCoefficient =
    ((ARTWORK_RARITIES.indexOf(item.artwork.rarity) + 1) /
      ARTWORK_RARITIES.length) *
    FORGERY_HEAT_COEFFICIENTS.rarity;
  if (item.foil) typeCoefficient += FORGERY_HEAT_COEFFICIENTS.foil;
  if (item.unlocked) typeCoefficient += FORGERY_HEAT_COEFFICIENTS.unlocked;
  if (item.seasonal) typeCoefficient += FORGERY_HEAT_COEFFICIENTS.seasonal;
  if (item.vintage) typeCoefficient += FORGERY_HEAT_COEFFICIENTS.vintage;
  if (item.lottery) {
    typeCoefficient +=
      FORGERY_HEAT_COEFFICIENTS.lottery *
      (0.75 + 0.25 * (item.lottery / 10));
  }
  if (item.level > 1) {
    typeCoefficient +=
      FORGERY_HEAT_COEFFICIENTS.level * (item.level / 10);
  }
  typeCoefficient *= 1 - 0.4 * item.authenticity.forgery_quality;

  let heat = 0.3 + (0.99 - 0.3) * Math.min(typeCoefficient, 1);
  if (!item.authenticity.identified) heat *= 0.3;
  if (reduced) heat *= 0.8;
  return Number(heat.toFixed(3));
}
