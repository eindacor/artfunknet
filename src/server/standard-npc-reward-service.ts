import type { Db } from "mongodb";
import { recordEconomyMetricsSafely } from "./economy-metrics.ts";

import {
  applyXp,
  getAverageDropValueForLevel,
  getCapsForLevel,
  getXpChunk,
} from "./collection-gameplay.ts";
import type { GameItem } from "./gameplay.ts";
import {
  ART_ENTHUSIAST_ATTRIBUTE_ID,
  BENEFACTOR_ATTRIBUTE_ID,
  getDisplayedLegendaryEffect,
  getLegendaryNumberParameter,
} from "./legendary-attributes.ts";
import type { GalleryNpc, NpcQuality } from "./npc-gameplay.ts";
import {
  calculateBenefactorReward,
  calculateEnthusiastReward,
  type NpcRewardInteraction,
} from "./standard-npc-rewards.ts";

type RewardPlayer = {
  _id: string;
  active: boolean;
  profile: {
    bank_balance: number;
    level: number;
    xp: number;
    lottery_tickets: number;
    npcs_met?: Partial<Record<NpcQuality, number>>;
  };
};

export function isStandardRewardNpc(attributeId: string): boolean {
  return (
    attributeId === BENEFACTOR_ATTRIBUTE_ID ||
    attributeId === ART_ENTHUSIAST_ATTRIBUTE_ID
  );
}

export async function grantStandardNpcReward(
  database: Db,
  player: RewardPlayer,
  npc: GalleryNpc,
  now: Date,
): Promise<NpcRewardInteraction> {
  if (npc.attribute_id === BENEFACTOR_ATTRIBUTE_ID) {
    return grantBenefactorReward(database, player, npc, now);
  }
  if (npc.attribute_id === ART_ENTHUSIAST_ATTRIBUTE_ID) {
    return grantEnthusiastReward(database, player, npc, now);
  }
  throw new Error("This visitor does not grant a standard reward.");
}

async function grantBenefactorReward(
  database: Db,
  player: RewardPlayer,
  npc: GalleryNpc,
  now: Date,
): Promise<NpcRewardInteraction> {
  const ownGallery = npc.owner_id === player._id;
  const [averageDropValue, visitorBonus, conditionBonus, visitorCount] =
    await Promise.all([
      getAverageDropValueForLevel(database, player.profile.level),
      ownGallery
        ? getDisplayedLegendaryEffect(
            database,
            player._id,
            "BENEFACTOR_VISITOR_COUNT_BONUS",
          )
        : null,
      ownGallery
        ? getDisplayedLegendaryEffect(
            database,
            player._id,
            "BENEFACTOR_CONDITION_BONUS",
          )
        : null,
      ownGallery
        ? database.collection<GalleryNpc>("npcs").countDocuments({
            owner_id: player._id,
            expiration: { $gt: now },
          })
        : 0,
    ]);
  const conditionMinimum = getLegendaryNumberParameter(
    conditionBonus,
    "condition_minimum",
    0.9,
  );
  const highConditionItemCount = conditionBonus
    ? await database.collection<GameItem>("items").countDocuments({
        owner: player._id,
        status: "displayed",
        condition: { $gt: conditionMinimum },
      })
    : 0;
  const rewardAmount = calculateBenefactorReward({
    averageDropValue,
    quality: npc.quality,
    ownGallery,
    visitorCount,
    highConditionItemCount,
    visitorBonus: Boolean(visitorBonus),
    conditionBonus: Boolean(conditionBonus),
    visitorMultiplierPerVisitor: getLegendaryNumberParameter(
      visitorBonus,
      "multiplier_per_visitor",
      0.1,
    ),
    conditionMultiplierPerItem: getLegendaryNumberParameter(
      conditionBonus,
      "multiplier_per_item",
      0.05,
    ),
    randomRoll: Math.random(),
  });
  const result = await database.collection<RewardPlayer>("players").updateOne(
    { _id: player._id, active: true },
    { $inc: { "profile.bank_balance": rewardAmount } },
  );
  if (result.modifiedCount !== 1) {
    throw new Error("The Benefactor donation could not be applied.");
  }
  await recordEconomyMetricsSafely(database, {
    amount: rewardAmount,
    currency: "money",
    direction: "earned",
    source: "benefactor-reward",
  });

  return createRewardInteraction(npc, "money", rewardAmount, 0);
}

async function grantEnthusiastReward(
  database: Db,
  player: RewardPlayer,
  npc: GalleryNpc,
  now: Date,
): Promise<NpcRewardInteraction> {
  const ownGallery = npc.owner_id === player._id;
  const [visitorBonus, visitorCount, moneyForXp] = await Promise.all([
    ownGallery
      ? getDisplayedLegendaryEffect(
          database,
          player._id,
          "ENTHUSIAST_VISITOR_COUNT_BONUS",
        )
      : null,
    ownGallery
      ? database.collection<GalleryNpc>("npcs").countDocuments({
          owner_id: player._id,
          expiration: { $gt: now },
        })
      : 0,
    ownGallery
      ? getDisplayedLegendaryEffect(database, player._id, "MONEY_FOR_XP")
      : null,
  ]);
  const rewardAmount = calculateEnthusiastReward({
    xpChunk: getXpChunk(player.profile.level),
    quality: npc.quality,
    ownGallery,
    visitorCount,
    visitorBonus: Boolean(visitorBonus),
    visitorMultiplierPerVisitor: getLegendaryNumberParameter(
      visitorBonus,
      "multiplier_per_visitor",
      0.05,
    ),
  });
  const progress = applyXp(
    player.profile.level,
    player.profile.xp,
    rewardAmount,
  );
  const bonusMoney = Math.floor(
    rewardAmount *
      getLegendaryNumberParameter(
        moneyForXp,
        "money_per_xp",
        moneyForXp ? 2 : 0,
      ),
  );
  const result = await database.collection<RewardPlayer>("players").updateOne(
    {
      _id: player._id,
      active: true,
      "profile.level": player.profile.level,
      "profile.xp": player.profile.xp,
    },
    {
      $set: {
        "profile.level": progress.level,
        "profile.xp": progress.xp,
        ...Object.fromEntries(
          Object.entries(getCapsForLevel(progress.level)).map(
            ([key, value]) => [`profile.${key}`, value],
          ),
        ),
      },
      $inc: {
        "profile.lottery_tickets": progress.lotteryTickets,
        "profile.bank_balance": bonusMoney,
      },
    },
  );
  if (result.modifiedCount !== 1) {
    throw new Error("The Art Enthusiast XP reward could not be applied.");
  }
  await recordEconomyMetricsSafely(database, [
    {
      amount: rewardAmount / Math.max(1, getXpChunk(player.profile.level)),
      currency: "xp",
      direction: "earned",
      source: "enthusiast-reward",
    },
    {
      amount: bonusMoney,
      currency: "money",
      direction: "earned",
      source: "enthusiast-reward",
    },
  ]);

  return createRewardInteraction(npc, "xp", rewardAmount, bonusMoney);
}

function createRewardInteraction(
  npc: GalleryNpc,
  rewardType: "money" | "xp",
  rewardAmount: number,
  bonusMoney: number,
): NpcRewardInteraction {
  return {
    type: "npc-reward",
    // Future Legendary effects can select "dialog" here without changing reward transactions.
    presentation: "popout",
    npcId: npc._id,
    npcName: npc.npc_name,
    quality: npc.quality,
    rewardType,
    rewardAmount,
    bonusMoney,
  };
}
