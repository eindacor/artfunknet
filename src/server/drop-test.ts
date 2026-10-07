import {
  ARTWORK_RARITIES,
  getConfiguredRarityMap,
  getVisitorRarityMap,
  rollAvailableRarity,
  type ArtworkRarity,
  type LootData,
} from "./gameplay.ts";
import {
  NPC_QUALITIES,
  type NpcQuality,
} from "./npc-gameplay.ts";

export const DROP_TEST_ROLL_COUNT = 100_000;
export const DROP_TEST_SOURCES = [
  "standard",
  "donor",
  "dealer",
  "auctioneer",
] as const;

export type DropTestSource = (typeof DROP_TEST_SOURCES)[number];

export type DropTestResult = {
  source: DropTestSource;
  quality: NpcQuality | null;
  amplifier: number | null;
  playerLevel: number;
  rolls: number;
  counts: Record<ArtworkRarity, number>;
};

export function isDropTestSource(value: unknown): value is DropTestSource {
  return (
    typeof value === "string" &&
    DROP_TEST_SOURCES.includes(value as DropTestSource)
  );
}

export function isNpcQuality(value: unknown): value is NpcQuality {
  return (
    typeof value === "string" &&
    NPC_QUALITIES.includes(value as NpcQuality)
  );
}

export function getDropTestRarityMap({
  source,
  quality,
  playerLevel,
  lootData,
  configuredWeights,
  visitorRarityAmplifiers,
}: {
  source: DropTestSource;
  quality?: NpcQuality;
  playerLevel: number;
  lootData: Pick<
    LootData,
    "basic_crate_cost" | "crate_expense_per_masterpiece" | "items_per_basic_crate"
  >;
  configuredWeights: Record<ArtworkRarity, number>;
  visitorRarityAmplifiers: Record<NpcQuality, number>;
}): Record<ArtworkRarity, number> {
  if (source === "standard") {
    return getConfiguredRarityMap(
      playerLevel,
      lootData,
      configuredWeights,
    );
  }
  if (!quality) {
    throw new Error("Visitor quality is required for visitor drop tests.");
  }

  return getConfiguredRarityMap(
    playerLevel,
    lootData,
    getVisitorRarityMap(
      playerLevel,
      lootData,
      configuredWeights,
      visitorRarityAmplifiers[quality],
    ),
    true,
  );
}

export function simulateDropRarities({
  source,
  quality,
  playerLevel,
  lootData,
  configuredWeights,
  visitorRarityAmplifiers,
  availableRarities,
  rolls = DROP_TEST_ROLL_COUNT,
  random = Math.random,
}: {
  source: DropTestSource;
  quality?: NpcQuality;
  playerLevel: number;
  lootData: Pick<
    LootData,
    "basic_crate_cost" | "crate_expense_per_masterpiece" | "items_per_basic_crate"
  >;
  configuredWeights: Record<ArtworkRarity, number>;
  visitorRarityAmplifiers: Record<NpcQuality, number>;
  availableRarities: Iterable<ArtworkRarity>;
  rolls?: number;
  random?: () => number;
}): DropTestResult {
  const rarityMap = getDropTestRarityMap({
    source,
    quality,
    playerLevel,
    lootData,
    configuredWeights,
    visitorRarityAmplifiers,
  });
  const available = [...new Set(availableRarities)];
  const counts = Object.fromEntries(
    ARTWORK_RARITIES.map((rarity) => [rarity, 0]),
  ) as Record<ArtworkRarity, number>;

  for (let index = 0; index < rolls; index += 1) {
    counts[rollAvailableRarity(rarityMap, available, random)] += 1;
  }

  return {
    source,
    quality: source === "standard" ? null : (quality ?? null),
    amplifier:
      source === "standard" || !quality
        ? null
        : visitorRarityAmplifiers[quality],
    playerLevel,
    rolls,
    counts,
  };
}
