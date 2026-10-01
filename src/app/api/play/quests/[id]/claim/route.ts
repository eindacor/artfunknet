import { NextResponse } from "next/server";
import { recordEconomyMetricsSafely } from "@/server/economy-metrics";

import {
  calculateHistorianClaimXp,
  getArtHistorianQuestViews,
  type ArtHistorianQuest,
} from "@/server/art-historian-gameplay";
import {
  applyXp,
  getCapsForLevel,
  getXpChunk,
} from "@/server/collection-gameplay";
import {
  getGameplayGenerationMap,
  getGameplaySettings,
} from "@/server/game-settings";
import {
  generateDailyDrop,
  type ArtworkRarity,
  type GameItem,
  type LootData,
} from "@/server/gameplay";
import {
  rollForgeryDetected,
  sanitizePlayerFacingAuthenticity,
} from "@/server/forgery-gameplay";
import { hydrateGameItems } from "@/server/item-artwork";
import {
  getDisplayedLegendaryEffect,
  getLegendaryNumberParameter,
} from "@/server/legendary-attributes";
import {
  createArchiveEntry,
  type ArchiveEntry,
} from "@/server/archive-gameplay";
import {
  getArtworkEffectNumberParameter,
  getDisplayedArtworkEffect,
} from "@/server/artwork-effects";
import {
  addItemToArchiveRecord,
  removeItemFromArchiveRecord,
} from "@/server/archive-storage";
import { MASTERPIECE_EFFECT_CODES } from "@/server/masterpiece-effects";
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

  let generatedRewardItems: GameItem[] = [];
  const archiveContributions: Array<{
    artworkId: string;
    entry: ArchiveEntry;
  }> = [];

  try {
    const fulfilledTargets = claimedQuest.fulfilled_targets ?? [];
    const hydratedCreditedItems = await hydrateGameItems(
      database,
      fulfilledTargets
        .map((target) => target.item_snapshot)
        .filter((item) => item.authenticity.forgery),
    );
    const historianArchiveEffect = await getDisplayedArtworkEffect(
      database,
      player._id,
      MASTERPIECE_EFFECT_CODES.historianArchive,
    );
    const detectionReduction = getArtworkEffectNumberParameter(
      historianArchiveEffect,
      "detection_reduction",
      0.35,
    );
    const caughtForgeries = hydratedCreditedItems.filter((item) =>
      rollForgeryDetected(
        item,
        "quest",
        Math.random,
        false,
        historianArchiveEffect ? detectionReduction : 0,
      ),
    );
    if (historianArchiveEffect) {
      for (const target of fulfilledTargets) {
        const archivedAt = new Date().toISOString();
        const archivedItem = {
          ...target.item_snapshot,
          owner: player._id,
        };
        if (await addItemToArchiveRecord(database, archivedItem, archivedAt)) {
          archiveContributions.push({
            artworkId: archivedItem.artwork_id,
            entry: createArchiveEntry(archivedItem, archivedAt),
          });
        }
      }
    }

    const specialTargetCount = fulfilledTargets.filter(
      (target) => target.special,
    ).length;
    const rewardMultiplier = caughtForgeries.length > 0 ? 0.6 : 1;
    const xpReward = Math.floor(
      calculateHistorianClaimXp(
        claimedQuest.reward.xp,
        questView.progress.fulfilled,
        claimedQuest.min_requirement,
        specialTargetCount,
      ) * rewardMultiplier,
    );
    const moneyForXpEffect = await getDisplayedLegendaryEffect(
      database,
      player._id,
      "MONEY_FOR_XP",
    );
    const moneyPerXp = getLegendaryNumberParameter(
      moneyForXpEffect,
      "money_per_xp",
      moneyForXpEffect ? 2 : 0,
    );
    const moneyForXpBonus = Math.floor(xpReward * moneyPerXp);
    const moneyReward =
      Math.floor(claimedQuest.reward.money * rewardMultiplier) +
      moneyForXpBonus;
    const progress = applyXp(
      player.profile.level,
      player.profile.xp,
      xpReward,
    );
    const caps = getCapsForLevel(progress.level);
    const now = new Date();
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
          generationMap: {
            ...getGameplayGenerationMap(settings.active),
            rarity: singleRarityMap(claimedQuest.reward.item.rarity),
            foil: claimedQuest.reward.item.foil ? 1 : 0,
          },
          mintValueMultiplier: settings.active.mintValueMultiplier,
          debug: settings.debugEnabled,
          useRawRarityMap: true,
          source: "quest",
        },
      );
    }
    const rewardItems =
      generatedRewardItems.length > 0
        ? await hydrateGameItems(database, generatedRewardItems)
        : [];

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
          "profile.playthrough_stats.quests_completed": 1,
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
    await recordEconomyMetricsSafely(database, [
      {
        amount: moneyReward,
        currency: "money",
        direction: "earned",
        source: "quest-reward",
      },
      {
        amount: xpReward / Math.max(1, getXpChunk(player.profile.level)),
        currency: "xp",
        direction: "earned",
        source: "quest-reward",
      },
    ]);
    return NextResponse.json({
      status: "ok",
      message: `Quest complete: $${moneyReward.toLocaleString()} and ${xpReward.toLocaleString()} XP awarded${
        caughtForgeries.length > 0
          ? `; ${caughtForgeries.length} forgery ${caughtForgeries.length === 1 ? "was" : "were"} detected, reducing rewards`
          : ""
      }.`,
      reward: {
        money: moneyReward,
        xp: xpReward,
        items: rewardItems.map((item) =>
          sanitizePlayerFacingAuthenticity(item),
        ),
      },
    });
  } catch (error) {
    const rollbackFailures: unknown[] = [];
    for (const contribution of archiveContributions.reverse()) {
      try {
        await removeItemFromArchiveRecord(
          database,
          player._id,
          contribution.artworkId,
          contribution.entry,
        );
      } catch (rollbackError) {
        rollbackFailures.push(rollbackError);
      }
    }
    const rollbackResults = await Promise.allSettled([
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
    ]);
    rollbackFailures.push(
      ...rollbackResults.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      ),
    );
    console.error("Unable to claim Art Historian quest", error);
    if (rollbackFailures.length > 0) {
      console.error(
        "Unable to completely roll back Art Historian quest claim",
        rollbackFailures,
      );
    }
    return NextResponse.json(
      {
        error:
          rollbackFailures.length > 0
            ? "The quest reward failed and could not be completely restored."
            : error instanceof Error
            ? error.message
            : "The quest reward could not be claimed.",
      },
      { status: 500 },
    );
  }
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
