export type LegendaryAttributeParameter = boolean | number | string;

export type LegendaryAttribute = {
  _id: string;
  title: string;
  description: string;
  flavor_text: string;
  code: string;
  active: boolean;
  linked_attributes: [string, string];
  linked_pair: string;
  parameters: Record<string, LegendaryAttributeParameter>;
  created_at?: string;
  updated_at?: string;
};

export function normalizeLegendaryPair(
  attributeIds: readonly string[],
): string {
  if (
    attributeIds.length !== 2 ||
    attributeIds.some((id) => !id) ||
    attributeIds[0] === attributeIds[1]
  ) {
    throw new Error(
      "Legendary attributes must link two distinct attribute IDs.",
    );
  }

  return [...attributeIds].sort().join(":");
}

export function deriveLegendaryAttributeIds(
  specialAttributeIds: readonly string[],
  attributes: readonly Pick<
    LegendaryAttribute,
    "_id" | "active" | "linked_pair"
  >[],
): string[] {
  const availablePairs = new Map(
    attributes
      .filter((attribute) => attribute.active)
      .map((attribute) => [attribute.linked_pair, attribute._id]),
  );
  const uniqueIds = [...new Set(specialAttributeIds)];
  const result: string[] = [];

  for (let left = 0; left < uniqueIds.length; left += 1) {
    for (let right = left + 1; right < uniqueIds.length; right += 1) {
      const match = availablePairs.get(
        normalizeLegendaryPair([uniqueIds[left], uniqueIds[right]]),
      );
      if (match) result.push(match);
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
