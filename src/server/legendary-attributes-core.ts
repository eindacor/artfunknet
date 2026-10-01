import {
  normalizeLegendaryPair,
  type ArtworkEffectParameter,
} from "./artwork-effects-core.ts";

export type LegendaryAttributeParameter = ArtworkEffectParameter;
export type LegendaryAttribute = {
  _id: string;
  title: string;
  description: string;
  flavor_text: string;
  code: string;
  active: boolean;
  effect_type?: "legendary";
  linked_attributes: [string, string];
  linked_pair?: string;
  parameters: Record<string, LegendaryAttributeParameter>;
  created_at?: string;
  updated_at?: string;
};

export { normalizeLegendaryPair };

export function deriveLegendaryAttributeIds(
  specialAttributeIds: readonly string[],
  attributes: readonly (Pick<LegendaryAttribute, "_id" | "active"> &
    Partial<
      Pick<LegendaryAttribute, "linked_attributes" | "linked_pair">
    >)[],
): string[] {
  const availablePairs = new Map<string, string[]>();
  for (const attribute of attributes.filter((candidate) => candidate.active)) {
    const pair =
      attribute.linked_attributes?.length === 2
        ? normalizeLegendaryPair(attribute.linked_attributes)
        : attribute.linked_pair;
    if (!pair) continue;
    availablePairs.set(pair, [...(availablePairs.get(pair) ?? []), attribute._id]);
  }
  const uniqueIds = [...new Set(specialAttributeIds)];
  const result: string[] = [];

  for (let left = 0; left < uniqueIds.length; left += 1) {
    for (let right = left + 1; right < uniqueIds.length; right += 1) {
      const matches = availablePairs.get(
        normalizeLegendaryPair([uniqueIds[left], uniqueIds[right]]),
      );
      if (matches) result.push(...matches);
    }
  }

  return result;
}

export function selectActiveLegendaryAttribute(
  currentId: string | undefined,
  eligibleIds: readonly string[],
): string | undefined {
  return currentId && eligibleIds.includes(currentId)
    ? currentId
    : eligibleIds[0];
}

export function getLegendaryNumberParameter(
  attribute: LegendaryAttribute | null,
  key: string,
  fallback: number,
): number {
  const value = attribute?.parameters[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}
