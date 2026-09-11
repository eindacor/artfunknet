import type { Db } from "mongodb";

import type { ArtHistorianQuest } from "./art-historian-gameplay.ts";
import {
  getDisplayedLegendaryEffect,
  getLegendaryNumberParameter,
  type LegendaryAttribute,
} from "./legendary-attributes.ts";

export type QuestItemSellEvaluationOptions = {
  questSellEffect?: LegendaryAttribute | null;
  activeQuestTargetIds?: Set<string>;
};

export async function getActiveQuestTargetIds(
  database: Db,
  playerId: string,
): Promise<Set<string>> {
  const activeQuests = await database
    .collection<ArtHistorianQuest>("quests")
    .find({ owner_id: playerId })
    .project<Pick<ArtHistorianQuest, "target">>({ target: 1 })
    .toArray();

  return new Set(
    activeQuests.flatMap((quest) =>
      Array.isArray(quest.target)
        ? quest.target.filter(
            (artworkId): artworkId is string => typeof artworkId === "string",
          )
        : [],
    ),
  );
}

export async function evaluateQuestItemSellBonus(
  database: Db,
  playerId: string,
  artworkId: string,
  options?: QuestItemSellEvaluationOptions,
): Promise<{ effect: LegendaryAttribute | null; multiplier: number }> {
  const questSellEffect =
    options?.questSellEffect !== undefined
      ? options.questSellEffect
      : await getDisplayedLegendaryEffect(
          database,
          playerId,
          "QUEST_ITEM_SELL_BONUS",
        );

  if (!questSellEffect) {
    return { effect: null, multiplier: 1 };
  }

  const activeQuestTargetIds =
    options?.activeQuestTargetIds ??
    (await getActiveQuestTargetIds(database, playerId));

  if (!activeQuestTargetIds.has(artworkId)) {
    return { effect: questSellEffect, multiplier: 1 };
  }

  const multiplier = getLegendaryNumberParameter(
    questSellEffect,
    "sell_multiplier",
    2,
  );

  return { effect: questSellEffect, multiplier };
}
