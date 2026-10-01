import type { GameItem } from "./gameplay.ts";

type BulkAcquisitionCandidate = Pick<
  GameItem,
  "_id" | "original" | "vintage" | "values"
>;

export function getBulkAcquisitionRequirements<T extends BulkAcquisitionCandidate>(
  items: readonly T[],
  getPurchaseCost: (item: T) => number,
): {
  requiredSlots: number;
  totalCost: number;
} {
  return {
    requiredSlots: items.filter((item) => !item.original && !item.vintage)
      .length,
    totalCost: items.reduce(
      (sum, item) => sum + normalizePurchaseCost(getPurchaseCost(item)),
      0,
    ),
  };
}

export function selectBulkPurchaseItems<T extends BulkAcquisitionCandidate>(
  items: readonly T[],
  availableSlots: number,
  budget: number,
  getPurchaseCost: (item: T) => number,
): {
  items: T[];
  totalCost: number;
} {
  const ordered = [...items].sort(
    (left, right) =>
      right.values.actual - left.values.actual ||
      left._id.localeCompare(right._id),
  );
  let remainingSlots = Math.max(0, Math.floor(availableSlots));
  let remainingBudget = Math.max(0, Math.floor(budget));
  let totalCost = 0;
  const selected: T[] = [];

  for (const item of ordered) {
    const purchaseCost = normalizePurchaseCost(getPurchaseCost(item));
    const consumesSlot = !item.original && !item.vintage;
    if (purchaseCost > remainingBudget || (consumesSlot && remainingSlots < 1)) {
      continue;
    }
    selected.push(item);
    totalCost += purchaseCost;
    remainingBudget -= purchaseCost;
    if (consumesSlot) remainingSlots -= 1;
  }

  return { items: selected, totalCost };
}

function normalizePurchaseCost(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
