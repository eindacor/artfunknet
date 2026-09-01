import type { NpcQuality } from "./npc-gameplay.ts";

const OWN_GALLERY_MULTIPLIER = 1.75;

const BENEFACTOR_QUALITY_MULTIPLIERS: Record<NpcQuality, number> = {
  bronze: 0.4,
  silver: 0.6,
  gold: 0.8,
  platinum: 1,
};

const ENTHUSIAST_CHUNK_PERCENTAGES: Record<NpcQuality, number> = {
  bronze: 0.2,
  silver: 0.3,
  gold: 0.4,
  platinum: 0.5,
};

export type NpcRewardInteraction = {
  type: "npc-reward";
  presentation: "popout" | "dialog";
  npcId: string;
  npcName: string;
  quality: NpcQuality;
  rewardType: "money" | "xp";
  rewardAmount: number;
  bonusMoney: number;
};

export function calculateBenefactorReward({
  averageDropValue,
  quality,
  ownGallery,
  visitorCount,
  highConditionItemCount,
  visitorBonus,
  conditionBonus,
  visitorMultiplierPerVisitor,
  conditionMultiplierPerItem,
  randomRoll,
}: {
  averageDropValue: number;
  quality: NpcQuality;
  ownGallery: boolean;
  visitorCount: number;
  highConditionItemCount: number;
  visitorBonus: boolean;
  conditionBonus: boolean;
  visitorMultiplierPerVisitor: number;
  conditionMultiplierPerItem: number;
  randomRoll: number;
}): number {
  const maxDonation = averageDropValue * 4;
  let donation =
    maxDonation * BENEFACTOR_QUALITY_MULTIPLIERS[quality];
  if (ownGallery) {
    donation *= OWN_GALLERY_MULTIPLIER;
    if (visitorBonus) {
      donation *= 1 + visitorCount * visitorMultiplierPerVisitor;
    }
    if (conditionBonus) {
      donation *= 1 + highConditionItemCount * conditionMultiplierPerItem;
    }
  }
  return Math.floor(
    donation + Math.min(Math.max(randomRoll, 0), 0.999999999999) * 0.1 * maxDonation,
  );
}

export function calculateEnthusiastReward({
  xpChunk,
  quality,
  ownGallery,
  visitorCount,
  visitorBonus,
  visitorMultiplierPerVisitor,
}: {
  xpChunk: number;
  quality: NpcQuality;
  ownGallery: boolean;
  visitorCount: number;
  visitorBonus: boolean;
  visitorMultiplierPerVisitor: number;
}): number {
  let chunkPercentage = ENTHUSIAST_CHUNK_PERCENTAGES[quality];
  if (ownGallery) {
    chunkPercentage *= OWN_GALLERY_MULTIPLIER;
    if (visitorBonus) {
      chunkPercentage *= 1 + visitorCount * visitorMultiplierPerVisitor;
    }
  }
  return Math.floor(xpChunk * chunkPercentage);
}
