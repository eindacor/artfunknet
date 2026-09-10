import type { Db } from "mongodb";

import type { ArtHistorianQuest } from "./art-historian-gameplay.ts";
import {
  getDisplayedLegendaryEffect,
  getLegendaryNumberParameter,
  type LegendaryAttribute,
} from "./legendary-attributes.ts";

export type DonorQuestItemEvaluationOptions = {
  questItemEffect?: LegendaryAttribute | null;
  rollOverride?: number;
};

export async function evaluateDonorQuestItemChance(
  database: Db,
  playerId: string,
  options?: DonorQuestItemEvaluationOptions,
): Promise<string | null> {
  const questItemEffect =
    options?.questItemEffect !== undefined
      ? options.questItemEffect
      : await getDisplayedLegendaryEffect(
          database,
          playerId,
          "DONOR_QUEST_ITEM_CHANCE",
        );

  if (!questItemEffect) return null;

  const chance = getLegendaryNumberParameter(
    questItemEffect,
    "chance",
    0.2,
  );
  const roll = options?.rollOverride ?? Math.random();
  if (roll >= chance) return null;

  const activeQuests = await database
    .collection<ArtHistorianQuest>("quests")
    .find({ owner_id: playerId })
    .toArray();

  const activeQuestTargetIds = [
    ...new Set(activeQuests.flatMap((quest) => quest.target ?? [])),
  ];

  if (activeQuestTargetIds.length === 0) return null;

  const selectedIndex = Math.floor(
    Math.random() * activeQuestTargetIds.length,
  );
  return activeQuestTargetIds[selectedIndex];
}
