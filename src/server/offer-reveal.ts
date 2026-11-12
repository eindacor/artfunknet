export type OfferRevealTier = 0 | 1 | 2 | 3;

export type OfferRevealThresholds = {
  level1: number;
  level2: number;
  level3: number;
};

export const DEFAULT_OFFER_REVEAL_THRESHOLDS: OfferRevealThresholds = {
  level1: 0.001,
  level2: 0.00001,
  level3: 0.0000001,
};

type RevealItem = {
  artwork?: { rarity: string };
  revealed?: boolean;
  status?: string;
  source?: string;
  odds?: string;
  drop_chance_coefficient?: number;
};

export function validateOfferRevealThresholds(
  input: unknown,
): { ok: true; value: OfferRevealThresholds } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Offer reveal cutoffs must be an object." };
  }
  const values = input as Record<string, unknown>;
  for (const level of ["level1", "level2", "level3"] as const) {
    const value = values[level];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      return { ok: false, error: "Offer reveal cutoffs must be numbers from 0 to 1." };
    }
  }
  const thresholds = values as OfferRevealThresholds;
  if (thresholds.level3 > thresholds.level2 || thresholds.level2 > thresholds.level1) {
    return {
      ok: false,
      error: "Offer reveal cutoffs must satisfy Level 3 <= Level 2 <= Level 1.",
    };
  }
  return {
    ok: true,
    value: {
      level1: thresholds.level1,
      level2: thresholds.level2,
      level3: thresholds.level3,
    },
  };
}

export function getOfferRevealTier(
  item: RevealItem,
  thresholds: OfferRevealThresholds = DEFAULT_OFFER_REVEAL_THRESHOLDS,
): OfferRevealTier {
  if (item.artwork?.rarity === "masterpiece") return 3;
  const minimumTier = item.artwork?.rarity === "legendary" ? 2 : 0;
  const coefficient = item.drop_chance_coefficient;
  if (
    typeof coefficient !== "number" ||
    !Number.isFinite(coefficient) ||
    coefficient < 0 ||
    coefficient > 1 ||
    /^(forged|unknown)$/i.test(item.odds?.trim() ?? "")
  ) return minimumTier;
  if (coefficient < thresholds.level3) return 3;
  if (coefficient < thresholds.level2 || minimumTier === 2) return 2;
  if (coefficient < thresholds.level1) return 1;
  return 0;
}

export function getInitialItemRevealState(
  item: RevealItem,
  thresholds: OfferRevealThresholds = DEFAULT_OFFER_REVEAL_THRESHOLDS,
  enableReveals = true,
): boolean {
  return (
    !enableReveals ||
    !(
      ["unclaimed", "won", "for_sale"].includes(item.status ?? "") ||
      (item.status === "auctioned" && item.source === "private auction")
    ) ||
    getOfferRevealTier(item, thresholds) === 0
  );
}

export function isOfferRevealed(
  item: RevealItem,
  thresholds: OfferRevealThresholds = DEFAULT_OFFER_REVEAL_THRESHOLDS,
): boolean {
  if (item.revealed === true || getOfferRevealTier(item, thresholds) === 0) return true;
  if (item.revealed === false) return false;
  // Legacy collections are already known; pending offers can receive their first reveal.
  if (item.status === "auctioned") return true;
  return getInitialItemRevealState(item, thresholds);
}

export function isRevealedForBulkAction(
  item: RevealItem,
  thresholds: OfferRevealThresholds = DEFAULT_OFFER_REVEAL_THRESHOLDS,
): boolean {
  return item.revealed !== false && isOfferRevealed(item, thresholds);
}

export function canQuickSellItem(
  item: RevealItem,
  thresholds: OfferRevealThresholds = DEFAULT_OFFER_REVEAL_THRESHOLDS,
): boolean {
  return isRevealedForBulkAction(item, thresholds);
}
