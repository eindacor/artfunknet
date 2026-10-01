import type { Db } from "mongodb";

import type { ArtworkEffect } from "./artwork-effects-core.ts";
import {
  getArtworkEffects,
  getDisplayedArtworkEffect,
} from "./artwork-effects.ts";
import {
  deriveLegendaryAttributeIds,
  type LegendaryAttribute,
} from "./legendary-attributes-core.ts";

export {
  deriveLegendaryAttributeIds,
  getLegendaryNumberParameter,
  normalizeLegendaryPair,
  selectActiveLegendaryAttribute,
  type LegendaryAttribute,
  type LegendaryAttributeParameter,
} from "./legendary-attributes-core.ts";

export const BENEFACTOR_ATTRIBUTE_ID = "Lacw8fkPYvSQrmpQN";
export const ART_ENTHUSIAST_ATTRIBUTE_ID = "T8v35e75v4Hh2JpxQ";
export const ART_COLLECTOR_ATTRIBUTE_ID = "dTSjqBx45mRTvFJeh";
export const ART_DONOR_ATTRIBUTE_ID = "Yk2kk2mZtHetvbrY5";
export const ART_DEALER_ATTRIBUTE_ID = "mZH58WpgbKP9o9WZR";
export const ART_EXPERT_ATTRIBUTE_ID = "nwMiN3DFBgsKBNSar";
export const AUCTIONEER_ATTRIBUTE_ID = "FgRMQA6s24wmTRyrx";
export const ART_HISTORIAN_ATTRIBUTE_ID = "Z7wY5jXkDeckwfFLs";
export const PRESERVATIONIST_ATTRIBUTE_ID = "zR2KgxYe4LQZKBAiE";

export async function getLegendaryAttributes(
  database: Db,
  ids?: readonly string[],
): Promise<LegendaryAttribute[]> {
  const effects = await getArtworkEffects(database, ids);
  return effects.filter(
    (effect) =>
      effect.effect_type === "legendary" &&
      effect.linked_attributes.length === 2,
  ) as LegendaryAttribute[];
}

export async function deriveArtworkLegendaryAttributeIds(
  database: Db,
  specialAttributeIds: readonly string[],
): Promise<string[]> {
  if (specialAttributeIds.length < 2) return [];
  const uniqueIds = [...new Set(specialAttributeIds)];

  const matches = await database
    .collection<ArtworkEffect>("artwork_effects")
    .find({
      effect_type: "legendary",
      active: true,
      linked_attributes: { $all: uniqueIds, $size: 2 },
    })
    .toArray();
  return deriveLegendaryAttributeIds(
    specialAttributeIds,
    matches.filter(
      (effect) =>
        effect.effect_type === "legendary" &&
        effect.linked_attributes.length === 2,
    ) as LegendaryAttribute[],
  );
}

export async function getDisplayedLegendaryEffect(
  database: Db,
  playerId: string,
  code: string,
): Promise<LegendaryAttribute | null> {
  return (await getDisplayedArtworkEffect(
    database,
    playerId,
    code,
  )) as LegendaryAttribute | null;
}
