import type { Db } from "mongodb";

import type { ArtHistorianQuest } from "./art-historian-gameplay.ts";
import {
  getDisplayedLegendaryEffect,
  getLegendaryNumberParameter,
  type LegendaryAttribute,
} from "./legendary-attributes.ts";

export type NpcQuestItemEvaluationOptions = {
  questItemEffect?: LegendaryAttribute | null;
  rollOverride?: number;
};

export async function evaluateNpcQuestItemChance(
  database: Db,
  playerId: string,
  effectCode: string,
  options?: NpcQuestItemEvaluationOptions,
): Promise<string | null> {
  const questItemEffect =
    options?.questItemEffect !== undefined
      ? options.questItemEffect
      : await getDisplayedLegendaryEffect(
          database,
          playerId,
          effectCode,
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

export function evaluateDonorQuestItemChance(
  database: Db,
  playerId: string,
  options?: NpcQuestItemEvaluationOptions,
): Promise<string | null> {
  return evaluateNpcQuestItemChance(
    database,
    playerId,
    "DONOR_QUEST_ITEM_CHANCE",
    options,
  );
}

export function evaluateDealerQuestItemChance(
  database: Db,
  playerId: string,
  options?: NpcQuestItemEvaluationOptions,
): Promise<string | null> {
  return evaluateNpcQuestItemChance(
    database,
    playerId,
    "DEALER_QUEST_ITEM_CHANCE",
    options,
  );
}
