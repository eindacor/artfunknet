import type { Db } from "mongodb";

import type { Artwork, GameItem } from "./gameplay";
import {
  deriveLegendaryAttributeIds,
  normalizeLegendaryPair,
  selectActiveLegendaryAttribute,
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

export const MARKETING_MANAGER_ATTRIBUTE_ID = "9aC5ZcgsepsRjuihA";
export const BENEFACTOR_ATTRIBUTE_ID = "Lacw8fkPYvSQrmpQN";
export const ART_ENTHUSIAST_ATTRIBUTE_ID = "T8v35e75v4Hh2JpxQ";
export const ART_COLLECTOR_ATTRIBUTE_ID = "dTSjqBx45mRTvFJeh";
export const ART_DONOR_ATTRIBUTE_ID = "Yk2kk2mZtHetvbrY5";
export const ART_DEALER_ATTRIBUTE_ID = "mZH58WpgbKP9o9WZR";
export const ART_EXPERT_ATTRIBUTE_ID = "nwMiN3DFBgsKBNSar";
export const AUCTIONEER_ATTRIBUTE_ID = "FgRMQA6s24wmTRyrx";
export const MARKET_EXPERT_ATTRIBUTE_ID = "t2fCtFr2GGGhAzDmT";

export async function getLegendaryAttributes(
  database: Db,
  ids?: readonly string[],
): Promise<LegendaryAttribute[]> {
  if (ids && ids.length === 0) return [];
  return database
    .collection<LegendaryAttribute>("unique_attributes")
    .find(ids ? { _id: { $in: [...ids] } } : {})
    .sort({ title: 1 })
    .toArray();
}

export async function deriveArtworkLegendaryAttributeIds(
  database: Db,
  specialAttributeIds: readonly string[],
): Promise<string[]> {
  if (specialAttributeIds.length < 2) return [];
  const linkedPairs = new Set<string>();
  const uniqueIds = [...new Set(specialAttributeIds)];
  for (let left = 0; left < uniqueIds.length; left += 1) {
    for (let right = left + 1; right < uniqueIds.length; right += 1) {
      linkedPairs.add(
        normalizeLegendaryPair([uniqueIds[left], uniqueIds[right]]),
      );
    }
  }

  const matches = await database
    .collection<LegendaryAttribute>("unique_attributes")
    .find({ active: true, linked_pair: { $in: [...linkedPairs] } })
    .toArray();
  return deriveLegendaryAttributeIds(specialAttributeIds, matches);
}

export async function getDisplayedLegendaryEffect(
  database: Db,
  playerId: string,
  code: string,
): Promise<LegendaryAttribute | null> {
  const items = await database
    .collection<GameItem>("items")
    .find({
      owner: playerId,
      status: "displayed",
      active_unique_attribute: { $type: "string" },
    })
    .project<Pick<GameItem, "active_unique_attribute">>({
      active_unique_attribute: 1,
    })
    .toArray();
  const activeIds = items
    .map((item) => item.active_unique_attribute)
    .filter((id): id is string => Boolean(id));
  if (activeIds.length === 0) return null;

  return database.collection<LegendaryAttribute>("unique_attributes").findOne({
    _id: { $in: activeIds },
    code,
    active: true,
  });
}

export async function recomputeLegendaryAssignments(
  database: Db,
): Promise<void> {
  const legendaryAttributes = await getLegendaryAttributes(database);
  const artworks = await database
    .collection<Artwork>("artworks")
    .find({})
    .project<Pick<Artwork, "_id" | "special_attributes">>({
      special_attributes: 1,
    })
    .toArray();

  for (const artwork of artworks) {
    const uniqueAttributes = deriveLegendaryAttributeIds(
      artwork.special_attributes ?? [],
      legendaryAttributes,
    );
    await database
      .collection<Artwork>("artworks")
      .updateOne(
        { _id: artwork._id },
        { $set: { unique_attributes: uniqueAttributes } },
      );

    const items = await database
      .collection<GameItem>("items")
      .find({ artwork_id: artwork._id })
      .project<Pick<GameItem, "_id" | "active_unique_attribute">>({
        active_unique_attribute: 1,
      })
      .toArray();
    for (const item of items) {
      const activeUniqueAttribute = selectActiveLegendaryAttribute(
        item.active_unique_attribute,
        uniqueAttributes,
      );
      await database.collection<GameItem>("items").updateOne(
        { _id: item._id },
        activeUniqueAttribute
          ? { $set: { active_unique_attribute: activeUniqueAttribute } }
          : { $unset: { active_unique_attribute: "" } },
      );
    }
  }
}
