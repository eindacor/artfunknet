import type { GameItem } from "./gameplay.ts";

type BulkClaimCandidate = Pick<
  GameItem,
  "_id" | "original" | "vintage" | "values"
>;

export function selectBulkClaimItems<T extends BulkClaimCandidate>(
  items: readonly T[],
  availableSlots: number,
): T[] {
  const byValue = (left: T, right: T) =>
    right.values.actual - left.values.actual ||
    left._id.localeCompare(right._id);
  const capacityFree = items
    .filter((item) => item.original || item.vintage)
    .sort(byValue);
  const inventoryItems = items
    .filter((item) => !item.original && !item.vintage)
    .sort(byValue)
    .slice(0, Math.max(0, Math.floor(availableSlots)));

  return [...capacityFree, ...inventoryItems];
}
