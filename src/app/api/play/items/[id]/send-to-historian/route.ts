import { NextResponse } from "next/server";

import {
  type Artwork,
  type GameItem,
} from "@/server/gameplay";
import {
  calculateHistorianConditionSubmissionBonus,
  isHistorianSpecialItem,
  type ArtHistorianFulfilledTarget,
  type ArtHistorianQuest,
} from "@/server/art-historian-gameplay";
import { getItemKarmaValue } from "@/server/art-expert-gameplay";
import { deleteCommunityReactions } from "@/server/community-reaction-cleanup";
import { recordEconomyMetricsSafely } from "@/server/economy-metrics";
import { refreshGalleryMetadata } from "@/server/gallery-metadata";
import {
  restoreTransferredHallOfFameItem,
  transferIfHallOfFameItem,
} from "@/server/hall-of-fame";
import {
  getDisplayedLegendaryEffect,
  getLegendaryNumberParameter,
} from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type SendToHistorianRequest = {
  questId?: unknown;
};

type HistorianPlayer = {
  _id: string;
  active: boolean;
  profile: {
    karma?: number;
    bank_balance: number;
    last_activity?: string;
  };
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as
    | SendToHistorianRequest
    | null;
  const questId =
    typeof body?.questId === "string" ? body.questId.trim() : "";
  if (!questId) {
    return NextResponse.json(
      { error: "Choose an Art Historian quest for this item." },
      { status: 400 },
    );
  }

  const { id } = await params;
  const database = await getDatabase();
  const item = await database.collection<GameItem>("items").findOne({
    _id: id,
    owner: auth.session.playerId,
    status: { $in: ["claimed", "displayed"] },
    permanent: { $ne: true },
    original: { $ne: true },
    repairing: { $ne: true },
  });
  if (!item) {
    return NextResponse.json(
      { error: "This item must be in your collection before it can be sent." },
      { status: 409 },
    );
  }

  const quest = await database
    .collection<ArtHistorianQuest>("quests")
    .findOne({
      _id: questId,
      owner_id: auth.session.playerId,
      target: item.artwork_id,
      "fulfilled_targets.artwork_id": { $ne: item.artwork_id },
    });
  if (!quest) {
    return NextResponse.json(
      { error: "This item is not an unfulfilled target for that quest." },
      { status: 409 },
    );
  }

  const [conditionBonusEffect, karmaEffect, artwork] = await Promise.all([
    getDisplayedLegendaryEffect(
      database,
      auth.session.playerId,
      "QUEST_COMLETION_CONDITION_BONUS",
    ),
    getDisplayedLegendaryEffect(
      database,
      auth.session.playerId,
      "KNOWLEDGE_FOR_QUESTS",
    ),
    database.collection<Artwork>("artworks").findOne({ _id: item.artwork_id }),
  ]);
  if (karmaEffect && !artwork) {
    return NextResponse.json(
      { error: "The artwork data required for this submission is unavailable." },
      { status: 500 },
    );
  }
  const karma = karmaEffect && artwork
    ? getItemKarmaValue(artwork.rarity, item.level)
    : 0;
  const conditionMinimum = getLegendaryNumberParameter(
    conditionBonusEffect,
    "condition_minimum",
    0.6,
  );
  const rewardCoefficient = getLegendaryNumberParameter(
    conditionBonusEffect,
    "reward_coefficient",
    0.1,
  );
  const moneyBonus = conditionBonusEffect
    ? calculateHistorianConditionSubmissionBonus({
        condition: item.condition,
        questMoney: quest.reward.money,
        conditionMinimum,
        rewardCoefficient,
      })
    : 0;
  const fulfilledTarget: ArtHistorianFulfilledTarget = {
    artwork_id: item.artwork_id,
    item_id: item._id,
    item_snapshot: item,
    fulfilled_at: new Date().toISOString(),
    special: isHistorianSpecialItem(item),
  };
  const fulfilled = await database
    .collection<ArtHistorianQuest>("quests")
    .updateOne(
      {
        _id: quest._id,
        owner_id: auth.session.playerId,
        target: item.artwork_id,
        "fulfilled_targets.artwork_id": { $ne: item.artwork_id },
      },
      { $push: { fulfilled_targets: fulfilledTarget } },
    );
  if (fulfilled.modifiedCount !== 1) {
    return NextResponse.json(
      { error: "That quest target was fulfilled by another action." },
      { status: 409 },
    );
  }

  let preserved = false;
  let removed = false;
  let submissionRewardApplied = false;
  try {
    preserved = await transferIfHallOfFameItem(database, item);
    if (!preserved) {
      const removal = await database.collection<GameItem>("items").deleteOne({
        _id: item._id,
        owner: auth.session.playerId,
        status: item.status,
        permanent: { $ne: true },
        original: { $ne: true },
        repairing: { $ne: true },
      });
      if (removal.deletedCount !== 1) {
        throw new Error("The item changed before the Historian received it.");
      }
      removed = true;
    }

    if (karma > 0 || moneyBonus > 0) {
      const playerUpdated = await database
        .collection<HistorianPlayer>("players")
        .updateOne(
          { _id: auth.session.playerId, active: true },
          {
            $inc: {
              "profile.karma": karma,
              "profile.bank_balance": moneyBonus,
            },
            $set: { "profile.last_activity": new Date().toISOString() },
          },
        );
      if (playerUpdated.modifiedCount !== 1) {
        throw new Error("The Historian submission reward could not be applied.");
      }
      submissionRewardApplied = true;
    }

    if (!preserved) {
      await deleteCommunityReactions(database, "item", [item._id]).catch(
        (error) => {
          console.error(
            `Unable to remove reactions for Historian item ${item._id}`,
            error,
          );
        },
      );
    }
  } catch (error) {
    let rollbackFailed = false;
    try {
      if (submissionRewardApplied) {
        const rewardRollback = await database
          .collection<HistorianPlayer>("players")
          .updateOne(
            { _id: auth.session.playerId },
            {
              $inc: {
                "profile.karma": -karma,
                "profile.bank_balance": -moneyBonus,
              },
            },
          );
        rollbackFailed ||= rewardRollback.modifiedCount !== 1;
      }
      if (preserved) {
        await restoreTransferredHallOfFameItem(database, item);
      } else if (removed) {
        await database.collection<GameItem>("items").insertOne(item);
      }
      const questRollback = await database
        .collection<ArtHistorianQuest>("quests")
        .updateOne(
          { _id: quest._id, owner_id: auth.session.playerId },
          { $pull: { fulfilled_targets: { item_id: item._id } } },
        );
      rollbackFailed ||= questRollback.modifiedCount !== 1;
    } catch (rollbackError) {
      rollbackFailed = true;
      console.error(
        `Unable to roll back Historian submission for item ${item._id}`,
        rollbackError,
      );
    }
    return NextResponse.json(
      {
        error: rollbackFailed
          ? "The Historian submission failed and could not be fully rolled back."
          : error instanceof Error
            ? error.message
            : "The item could not be sent to the Historian.",
      },
      { status: rollbackFailed ? 500 : 409 },
    );
  }

  if (item.status === "displayed") {
    await refreshGalleryMetadata(database, auth.session.playerId);
  }
  if (moneyBonus > 0) {
    await recordEconomyMetricsSafely(database, {
      amount: moneyBonus,
      currency: "money",
      direction: "earned",
      source: "quest-condition-submission-bonus",
    });
  }
  const fulfilledCount = (quest.fulfilled_targets?.length ?? 0) + 1;
  const fullyComplete = fulfilledCount >= quest.target.length;
  return NextResponse.json({
    status: "ok",
    karma,
    moneyBonus,
    autoClaimQuestId: fullyComplete ? quest._id : null,
    message: fullyComplete
      ? `The final requested artwork was sent to the Art Historian${formatSubmissionRewards(karma, moneyBonus)}.`
      : `Artwork sent to the Art Historian (${fulfilledCount}/${quest.target.length})${formatSubmissionRewards(karma, moneyBonus)}.`,
  });
}

function formatSubmissionRewards(karma: number, money: number): string {
  const rewards = [
    ...(karma > 0 ? [`${karma.toLocaleString()} Karma`] : []),
    ...(money > 0 ? [`$${money.toLocaleString()}`] : []),
  ];
  return rewards.length > 0 ? ` and earned ${rewards.join(" and ")}` : "";
}
