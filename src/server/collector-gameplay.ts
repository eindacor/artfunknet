import type { ArtworkRarity, GameItem } from "./gameplay.ts";
import { calculateForgeryHeat } from "./forgery-gameplay.ts";
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

export function getCollectorForgeryHeat(
  item: Pick<
    GameItem,
    | "mint"
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
    > & { forgery?: boolean };
    artwork: { rarity: ArtworkRarity };
  },
  reduced: boolean,
): number {
  return calculateForgeryHeat(item, "collector", reduced);
}
