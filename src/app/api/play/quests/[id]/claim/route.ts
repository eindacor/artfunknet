import { NextResponse } from "next/server";

import {
  calculateHistorianClaimXp,
  getArtHistorianQuestViews,
  type ArtHistorianQuest,
} from "@/server/art-historian-gameplay";
import {
  applyXp,
  getCapsForLevel,
} from "@/server/collection-gameplay";
import { getGameplaySettings } from "@/server/game-settings";
import {
  calculateItemValues,
  generateDailyDrop,
  type Artwork,
  type ArtworkRarity,
  type GameItem,
  type LootData,
} from "@/server/gameplay";
import {
  punishForgeryQuality,
  rollForgeryDetected,
  sanitizePlayerFacingAuthenticity,
} from "@/server/forgery-gameplay";
import { hydrateGameItems } from "@/server/item-artwork";
import {
  getDisplayedLegendaryEffect,
  getLegendaryNumberParameter,
} from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type Player = {
  _id: string;
  active: boolean;
  profile: {
    bank_balance: number;
    completed_quests?: number;
    level: number;
    xp: number;
    lottery_tickets: number;
  };
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const database = await getDatabase();
  const [player, questView] = await Promise.all([
    database.collection<Player>("players").findOne({
      _id: auth.session.playerId,
      active: true,
    }),
    getArtHistorianQuestViews(database, auth.session.playerId).then(
      (quests) => quests.find((quest) => quest._id === id),
    ),
  ]);
  if (!player || !questView) {
    return NextResponse.json(
      { error: "This Art Historian objective is unavailable." },
      { status: 404 },
    );
  }
  if (!questView.progress.canClaim) {
    return NextResponse.json(
      {
        error: `Collect at least ${questView.min_requirement} requested artworks before claiming this reward.`,
      },
      { status: 409 },
    );
  }

  const claimedQuest = await database
    .collection<ArtHistorianQuest>("quests")
    .findOneAndDelete({ _id: id, owner_id: player._id });
  if (!claimedQuest) {
    return NextResponse.json(
      { error: "This objective has already been claimed or cancelled." },
      { status: 409 },
    );
  }

  const creditedItemIds = questView.targets.flatMap((target) =>
    target.owned && target.itemId ? [target.itemId] : [],
  );
  const creditedItems = await database.collection<GameItem>("items").find({
    _id: { $in: creditedItemIds },
    owner: player._id,
    status: { $in: ["claimed", "displayed"] },
    "authenticity.forgery": true,
  }).toArray();
  const hydratedCreditedItems = await hydrateGameItems(database, creditedItems);
  const caughtForgeries = hydratedCreditedItems.filter((item) =>
    rollForgeryDetected(item, "quest"),
  );
  for (const item of caughtForgeries) {
    await database.collection<GameItem>("items").updateOne(
      { _id: item._id, owner: player._id },
      {
        $set: {
          status: "claimed",
          "authenticity.liable": player._id,
          "authenticity.liability_pending": false,
          "authenticity.identified": true,
          "authenticity.forgery_quality": punishForgeryQuality(item.authenticity.forgery_quality),
        },
      },
    );
  }

  const specialTargetCount = questView.targets.filter(
    (target) => target.owned && target.special,
  ).length;
  const rewardMultiplier = caughtForgeries.length > 0 ? 0.75 : 1;
  const xpReward = Math.floor(calculateHistorianClaimXp(
    claimedQuest.reward.xp,
    questView.progress.owned,
    claimedQuest.min_requirement,
    specialTargetCount,
  ) * rewardMultiplier);
  const moneyReward = Math.floor(claimedQuest.reward.money * rewardMultiplier);
  const progress = applyXp(
    player.profile.level,
    player.profile.xp,
    xpReward,
  );
  const caps = getCapsForLevel(progress.level);
  const now = new Date();
  let generatedRewardItems: GameItem[] = [];
  let restoredConditionTarget: number | null = null;
  const conditionRollbacks: Array<{
    itemId: string;
    previousCondition: number;
    previousValues: GameItem["values"];
    updatedCondition: number;
    updatedValues: GameItem["values"];
  }> = [];

  try {
    const conditionEffect = await getDisplayedLegendaryEffect(
      database,
      player._id,
      "QUEST_TARGET_CONDITION_INCREASE",
    );
    if (conditionEffect) {
      const conditionTarget = Math.min(
        Math.max(
          getLegendaryNumberParameter(
            conditionEffect,
            "condition_target",
            0.9,
          ),
          0,
        ),
        1,
      );
      restoredConditionTarget = conditionTarget;
      const creditedItemIds = questView.targets.flatMap((target) =>
        target.owned && target.itemId ? [target.itemId] : [],
      );
      const targetItems = await database.collection<GameItem>("items").find({
        owner: player._id,
        status: { $in: ["claimed", "displayed"] },
        _id: { $in: creditedItemIds },
        condition: { $lt: conditionTarget },
      }).toArray();
      if (targetItems.length > 0) {
        const [metadata, artworks] = await Promise.all([
          database
            .collection<{ _id: string; loot_data: LootData }>("metadata")
            .findOne({ _id: "loot-data" }),
          database.collection<Artwork>("artworks").find({
            _id: {
              $in: [...new Set(targetItems.map((item) => item.artwork_id))],
            },
          }).toArray(),
        ]);
        if (!metadata) throw new Error("Loot metadata is not configured.");
        const artworkMap = new Map(
          artworks.map((artwork) => [artwork._id, artwork]),
        );
        for (const item of targetItems) {
          const artwork = artworkMap.get(item.artwork_id);
          if (!artwork) continue;
          const values = calculateItemValues(
            { ...item, condition: conditionTarget },
            { ...artwork, ...item.artwork_overrides },
            metadata.loot_data,
          );
          const updated = await database.collection<GameItem>("items").updateOne(
            {
              _id: item._id,
              owner: player._id,
              status: { $in: ["claimed", "displayed"] },
              condition: item.condition,
            },
            { $set: { condition: conditionTarget, values } },
          );
          if (updated.modifiedCount === 1) {
            conditionRollbacks.push({
              itemId: item._id,
              previousCondition: item.condition,
              previousValues: item.values,
              updatedCondition: conditionTarget,
              updatedValues: values,
            });
          }
        }
      }
    }

    if (claimedQuest.reward.item) {
      const [settings, metadata] = await Promise.all([
        getGameplaySettings(database),
        database
          .collection<{ _id: string; loot_data: LootData }>("metadata")
          .findOne({ _id: "loot-data" }),
      ]);
      if (!metadata) throw new Error("Loot metadata is not configured.");
      generatedRewardItems = await generateDailyDrop(
        database,
        player._id,
        player.profile.level,
        {
          now,
          itemCount: 1,
          rarityWeights: singleRarityMap(
            claimedQuest.reward.item.rarity,
          ),
          cardRendererProbability:
            settings.active.cardRendererProbability,
          cardStyleWeights: settings.active.cardStyleWeights,
          foilProbability: claimedQuest.reward.item.foil ? 1 : 0,
          mintProbability: settings.active.mintProbability,
          mintValueMultiplier: settings.active.mintValueMultiplier,
          unlockedProbability: settings.active.unlockedProbability,
          debug: settings.debugEnabled,
          useRawRarityMap: true,
          source: "quest",
        },
      );
    }

    const playerResult = await database.collection<Player>("players").updateOne(
      {
        _id: player._id,
        active: true,
        "profile.level": player.profile.level,
        "profile.xp": player.profile.xp,
      },
      {
        $inc: {
          "profile.bank_balance": moneyReward,
          "profile.completed_quests": 1,
          "profile.lottery_tickets": progress.lotteryTickets,
        },
        $set: {
          "profile.level": progress.level,
          "profile.xp": progress.xp,
          "profile.last_activity": now.toISOString(),
          ...Object.fromEntries(
            Object.entries(caps).map(([key, value]) => [
              `profile.${key}`,
              value,
            ]),
          ),
        },
      },
    );
    if (playerResult.modifiedCount !== 1) {
      throw new Error(
        "Your player record changed before the quest reward was applied.",
      );
    }
  } catch (error) {
    await Promise.all([
      generatedRewardItems.length > 0
        ? database.collection<GameItem>("items").deleteMany({
            _id: { $in: generatedRewardItems.map((item) => item._id) },
            owner: player._id,
            source: "quest",
          })
        : Promise.resolve(),
      database
        .collection<ArtHistorianQuest>("quests")
        .insertOne(claimedQuest),
      ...conditionRollbacks.map((rollback) =>
        database.collection<GameItem>("items").updateOne(
          {
            _id: rollback.itemId,
            owner: player._id,
            status: { $in: ["claimed", "displayed"] },
            condition: rollback.updatedCondition,
            values: rollback.updatedValues,
          },
          {
            $set: {
              condition: rollback.previousCondition,
              values: rollback.previousValues,
            },
          },
        ),
      ),
    ]);
    console.error("Unable to claim Art Historian quest", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The quest reward could not be claimed.",
      },
      { status: 500 },
    );
  }

  const rewardItems =
    generatedRewardItems.length > 0
      ? await hydrateGameItems(database, generatedRewardItems)
      : [];
  return NextResponse.json({
    status: "ok",
    message: `Quest complete: $${moneyReward.toLocaleString()} and ${xpReward.toLocaleString()} XP awarded${
      conditionRollbacks.length > 0
        ? `; ${conditionRollbacks.length} target ${conditionRollbacks.length === 1 ? "item was" : "items were"} restored to ${Math.floor((restoredConditionTarget ?? 0.9) * 100)}% condition`
        : ""
    }${caughtForgeries.length > 0 ? `; ${caughtForgeries.length} forgery ${caughtForgeries.length === 1 ? "was" : "were"} detected, reducing rewards to 75%` : ""}.`,
    reward: {
      money: moneyReward,
      xp: xpReward,
      items: rewardItems.map((item) =>
        sanitizePlayerFacingAuthenticity(item),
      ),
    },
  });
}

function singleRarityMap(
  rarity: ArtworkRarity,
): Record<ArtworkRarity, number> {
  return {
    common: rarity === "common" ? 1 : 0,
    uncommon: rarity === "uncommon" ? 1 : 0,
    rare: rarity === "rare" ? 1 : 0,
    legendary: rarity === "legendary" ? 1 : 0,
    masterpiece: rarity === "masterpiece" ? 1 : 0,
  };
}
