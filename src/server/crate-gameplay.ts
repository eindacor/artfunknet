import type { Db } from "mongodb";

import {
  applyItemGenerationProbabilityMultipliers,
  ARTWORK_RARITIES,
  calculateItemValues,
  getConfiguredRarityMap,
  getRarityMap,
  type Artwork,
  type ArtworkRarity,
  type ItemAttribute,
  type ItemGenerationMap,
  type LootData,
} from "./gameplay.ts";
import {
  getGameplayGenerationMap,
  type GameplayConfig,
} from "./game-settings.ts";

export type CrateQuality =
  | "standard"
  | "foil"
  | "unlocked"
  | "designer"
  | "ultimate"
  | "debug-mint"
  | "debug-foil"
  | "debug-unlocked"
  | "debug-card-style"
  | "debug-legendary"
  | "debug-masterpiece";

export type CrateOfferView = {
  id: CrateQuality;
  name: string;
  quality: CrateQuality;
  description: string;
  highlights: string[];
  itemCount: number;
  cost: number;
  levelRequirement: number;
};

export type CrateOffer = CrateOfferView & {
  generationMap: Partial<ItemGenerationMap>;
};

export const DEFAULT_PURCHASABLE_CRATE_ITEM_COUNT = 6;

export const FEATURED_CRATES = [
  {
    id: "foil",
    name: "Foil crate",
    description: "A collection with an increased chance of foil artwork.",
    levelRequirement: 0,
  },
  {
    id: "unlocked",
    name: "Unlocked crate",
    description: "A collection with an increased chance of unlocked artwork.",
    levelRequirement: 5,
  },
  {
    id: "designer",
    name: "Designer crate",
    description: "A collection with an increased chance of alternate card styles.",
    levelRequirement: 0,
  },
  {
    id: "ultimate",
    name: "Ultimate crate",
    description: "A collection with every featured modifier chance increased.",
    levelRequirement: 0,
  },
] as const;

type FeaturedCrateQuality = (typeof FEATURED_CRATES)[number]["id"];

export async function getPurchasableCrateOffers(
  database: Db,
  playerLevel: number,
  config: GameplayConfig,
  includeDebugCrates = false,
): Promise<CrateOffer[]> {
  const metadata = await database
    .collection<{ _id: string; loot_data: LootData }>("metadata")
    .findOne({ _id: "loot-data" });
  if (!metadata) {
    throw new Error("Loot metadata has not been seeded.");
  }

  const artworks = await database
    .collection<Pick<Artwork, "_id" | "rarity">>("artworks")
    .find({ active: true })
    .project<Pick<Artwork, "_id" | "rarity">>({
      _id: 1,
      rarity: 1,
    })
    .toArray();
  const itemCount = DEFAULT_PURCHASABLE_CRATE_ITEM_COUNT;
  const baseGenerationMap = getGameplayGenerationMap(config);
  const standardExpectedValue = estimateCrateSellValue({
    artworks,
    generationMap: baseGenerationMap,
    itemCount,
    lootData: metadata.loot_data,
    mintValueMultiplier: config.mintValueMultiplier,
    playerLevel,
  });
  const standard: CrateOffer = {
    id: "standard",
    name: "Standard collection crate",
    quality: "standard",
    description: "A standard collection priced for your current level.",
    highlights: [`${itemCount} artworks`, "Level-adjusted rarity pool"],
    itemCount,
    cost: getConfiguredCrateCost(
      standardExpectedValue,
      config,
      "standard",
    ),
    levelRequirement: 0,
    generationMap: {},
  };

  const featured = FEATURED_CRATES.map((crate) => {
    const generationMap = getFeaturedCrateGenerationMap(crate.id, config);
    const expectedValue = estimateCrateSellValue({
      artworks,
      generationMap: {
        ...baseGenerationMap,
        ...generationMap,
      },
      itemCount: DEFAULT_PURCHASABLE_CRATE_ITEM_COUNT,
      lootData: metadata.loot_data,
      mintValueMultiplier: config.mintValueMultiplier,
      playerLevel,
    });
    return {
      id: crate.id,
      name: crate.name,
      quality: crate.id,
      description: crate.description,
      highlights: getFeaturedCrateHighlights(crate.id, config),
      itemCount: DEFAULT_PURCHASABLE_CRATE_ITEM_COUNT,
      cost: getConfiguredCrateCost(expectedValue, config, crate.id),
      levelRequirement: crate.levelRequirement,
      generationMap,
    } satisfies CrateOffer;
  });
  return [
    standard,
    ...featured,
    ...getEligibleDebugCrates(includeDebugCrates),
  ];
}

export function getFeaturedCrateGenerationMap(
  quality: FeaturedCrateQuality,
  config: Pick<
    GameplayConfig,
    | "foilProbability"
    | "unlockedProbability"
    | "cardRendererProbability"
    | "foilCrateChanceScalar"
    | "unlockedCrateChanceScalar"
    | "artStyleCrateChanceScalar"
    | "ultimateArtStyleChanceScalar"
    | "mintProbability"
    | "ultimateFoilChanceScalar"
    | "ultimateUnlockedChanceScalar"
    | "ultimateMintChanceScalar"
    | "ultimateSeasonalChanceScalar"
  >,
): Partial<ItemGenerationMap> {
  if (quality === "foil") {
    return applyItemGenerationProbabilityMultipliers(
      { foil: config.foilProbability },
      { foil: config.foilCrateChanceScalar },
    );
  }
  if (quality === "unlocked") {
    return applyItemGenerationProbabilityMultipliers(
      { unlocked: config.unlockedProbability },
      { unlocked: config.unlockedCrateChanceScalar },
    );
  }
  if (quality === "designer") {
    return applyItemGenerationProbabilityMultipliers(
      { cardStyle: config.cardRendererProbability },
      { cardStyle: config.artStyleCrateChanceScalar },
    );
  }
  return {
    ...applyItemGenerationProbabilityMultipliers(
      {
        foil: config.foilProbability,
        unlocked: config.unlockedProbability,
        mint: config.mintProbability,
        cardStyle: config.cardRendererProbability,
      },
      {
        foil: config.ultimateFoilChanceScalar,
        unlocked: config.ultimateUnlockedChanceScalar,
        mint: config.ultimateMintChanceScalar,
        cardStyle: config.ultimateArtStyleChanceScalar,
      },
    ),
    seasonal: config.ultimateSeasonalChanceScalar,
  };
}

function getFeaturedCrateHighlights(
  quality: FeaturedCrateQuality,
  config: GameplayConfig,
): string[] {
  const highlights = [
    `${DEFAULT_PURCHASABLE_CRATE_ITEM_COUNT} artworks`,
  ];
  if (quality === "foil") {
    highlights.push(`${config.foilCrateChanceScalar}x foil chance`);
  }
  if (quality === "unlocked") {
    highlights.push(`${config.unlockedCrateChanceScalar}x unlocked chance`);
  }
  if (quality === "designer") {
    highlights.push(`${config.artStyleCrateChanceScalar}x art style chance`);
  }
  if (quality === "ultimate") {
    highlights.push(
      `${config.ultimateFoilChanceScalar}x foil chance`,
      `${config.ultimateUnlockedChanceScalar}x unlocked chance`,
      `${config.ultimateMintChanceScalar}x Mint chance`,
      `${config.ultimateSeasonalChanceScalar}x seasonal chance`,
      `${config.ultimateArtStyleChanceScalar}x art style chance`,
    );
  }
  return highlights;
}

export function getEligibleDebugCrates(
  isTestAccount: boolean,
): CrateOffer[] {
  return isTestAccount ? createDebugCrates() : [];
}

export function createDebugCrates(): CrateOffer[] {
  const itemCount = 10;
  const common = {
    description: "Free debug crate for exercising one generation probability.",
    itemCount,
    cost: 0,
    levelRequirement: 0,
  };

  return [
    {
      ...common,
      id: "debug-mint",
      name: "DEBUG: 50% mint crate",
      quality: "debug-mint",
      highlights: [`${itemCount} artworks`, "50% mint chance"],
      generationMap: { mint: 0.5 },
    },
    {
      ...common,
      id: "debug-foil",
      name: "DEBUG: 50% foil crate",
      quality: "debug-foil",
      highlights: [`${itemCount} artworks`, "50% foil chance"],
      generationMap: { foil: 0.5 },
    },
    {
      ...common,
      id: "debug-unlocked",
      name: "DEBUG: 50% unlocked crate",
      quality: "debug-unlocked",
      highlights: [
        `${itemCount} uncommon artworks`,
        "50% unlocked chance",
      ],
      generationMap: {
        unlocked: 0.5,
        rarity: {
          common: 0,
          uncommon: 1,
          rare: 0,
          legendary: 0,
          masterpiece: 0,
        },
      },
    },
    {
      ...common,
      id: "debug-card-style",
      name: "DEBUG: 50% art style crate",
      quality: "debug-card-style",
      highlights: [`${itemCount} artworks`, "50% art style chance"],
      generationMap: { cardStyle: 0.5 },
    },
    {
      ...common,
      id: "debug-legendary",
      name: "DEBUG: Legendary-only crate",
      quality: "debug-legendary",
      highlights: [`${itemCount} artworks`, "Legendary artwork only"],
      generationMap: {
        rarity: {
          common: 0,
          uncommon: 0,
          rare: 0,
          legendary: 1,
          masterpiece: 0,
        },
      },
    },
    {
      ...common,
      id: "debug-masterpiece",
      name: "DEBUG: Masterpiece-only crate",
      quality: "debug-masterpiece",
      highlights: [`${itemCount} artworks`, "Masterpiece artwork only"],
      generationMap: {
        rarity: {
          common: 0,
          uncommon: 0,
          rare: 0,
          legendary: 0,
          masterpiece: 1,
        },
      },
    },
  ];
}

export function getCrateOffer(
  offers: CrateOffer[],
  id: string,
): CrateOffer | null {
  return offers.find((offer) => offer.id === id) ?? null;
}

export function getVisibleCrateOffers<T extends CrateOfferView>(
  offers: readonly T[],
  playerLevel: number,
): T[] {
  return offers.filter((offer) => playerLevel >= offer.levelRequirement);
}

export function getCratePermission(
  offer: CrateOfferView,
  level: number,
  bankBalance: number,
):
  | { allowed: true }
  | { allowed: false; reason: string } {
  if (level < offer.levelRequirement) {
    return {
      allowed: false,
      reason: `Reach level ${offer.levelRequirement} to open this crate.`,
    };
  }
  if (bankBalance < offer.cost) {
    return {
      allowed: false,
      reason: "You do not have enough money to open this crate.",
    };
  }
  return { allowed: true };
}

export function estimateCrateSellValue({
  artworks,
  generationMap,
  itemCount,
  lootData,
  mintValueMultiplier,
  playerLevel,
  useRawRarityMap = false,
}: {
  artworks: ReadonlyArray<Pick<Artwork, "_id" | "rarity">>;
  generationMap: Partial<ItemGenerationMap>;
  itemCount: number;
  lootData: LootData;
  mintValueMultiplier: number;
  playerLevel: number;
  useRawRarityMap?: boolean;
}): number {
  const rarityMap = generationMap.rarity
    ? getConfiguredRarityMap(
        playerLevel,
        lootData,
        generationMap.rarity,
        useRawRarityMap,
      )
    : getRarityMap(playerLevel, lootData);
  const artworkCounts = getArtworkCountsByRarity(artworks, lootData);
  const availableWeight = ARTWORK_RARITIES.reduce(
    (sum, rarity) =>
      sum + (artworkCounts[rarity].total > 0 ? rarityMap[rarity] : 0),
    0,
  );
  if (availableWeight <= 0) return 0;

  const foilProbability = clampProbability(generationMap.foil ?? 0.005);
  const mintProbability = clampProbability(generationMap.mint ?? 0);
  const unlockedProbability = clampProbability(
    generationMap.unlocked ?? 0.05,
  );
  const seasonalScalar = Math.max(0, generationMap.seasonal ?? 1);
  const averagePerItem = ARTWORK_RARITIES.reduce((total, rarity) => {
    const counts = artworkCounts[rarity];
    if (counts.total === 0 || rarityMap[rarity] <= 0) return total;
    const rarityProbability = rarityMap[rarity] / availableWeight;
    const seasonalProbability = getSeasonalProbability(
      counts,
      seasonalScalar,
    );
    const rarityUnlockedProbability =
      rarity === "common" ? 0 : unlockedProbability;
    const expectedSellValue = getExpectedItemSellValue({
      foilProbability,
      lootData,
      mintProbability,
      mintValueMultiplier,
      rarity,
      seasonalProbability,
      unlockedProbability: rarityUnlockedProbability,
    });
    return total + rarityProbability * expectedSellValue;
  }, 0);
  return averagePerItem * Math.max(1, itemCount);
}

function getSeasonalProbability(
  counts: { total: number; seasonal: number },
  seasonalScalar: number,
): number {
  const seasonalWeight = counts.seasonal * seasonalScalar;
  const totalWeight = seasonalWeight + counts.total - counts.seasonal;
  return totalWeight > 0 ? seasonalWeight / totalWeight : 0;
}

export function getCrateCost(
  expectedSellValue: number,
  scalar: number,
): number {
  return Math.max(1, Math.floor(expectedSellValue * scalar));
}

export function getConfiguredCrateCost(
  expectedSellValue: number,
  config: Pick<
    GameplayConfig,
    | "crateValueScalar"
    | "standardCrateCostScalar"
    | "foilCrateCostScalar"
    | "unlockedCrateCostScalar"
    | "designerCrateCostScalar"
    | "ultimateCrateCostScalar"
  >,
  quality: CrateQuality,
): number {
  const featureCostScalar =
    quality === "standard"
      ? config.standardCrateCostScalar
      : quality === "foil"
        ? config.foilCrateCostScalar
        : quality === "unlocked"
          ? config.unlockedCrateCostScalar
          : quality === "designer"
            ? config.designerCrateCostScalar
            : quality === "ultimate"
              ? config.ultimateCrateCostScalar
              : 1;
  return getCrateCost(
    expectedSellValue,
    config.crateValueScalar * featureCostScalar,
  );
}

function getArtworkCountsByRarity(
  artworks: ReadonlyArray<Pick<Artwork, "_id" | "rarity">>,
  lootData: Pick<LootData, "seasonal_items">,
): Record<ArtworkRarity, { total: number; seasonal: number }> {
  const counts = Object.fromEntries(
    ARTWORK_RARITIES.map((rarity) => [
      rarity,
      { total: 0, seasonal: 0 },
    ]),
  ) as Record<ArtworkRarity, { total: number; seasonal: number }>;
  const seasonalIds = Object.fromEntries(
    ARTWORK_RARITIES.map((rarity) => [
      rarity,
      new Set(lootData.seasonal_items[rarity] ?? []),
    ]),
  ) as Record<ArtworkRarity, Set<string>>;
  for (const artwork of artworks) {
    counts[artwork.rarity].total += 1;
    if (seasonalIds[artwork.rarity].has(artwork._id)) {
      counts[artwork.rarity].seasonal += 1;
    }
  }
  return counts;
}

function getExpectedItemSellValue({
  foilProbability,
  lootData,
  mintProbability,
  mintValueMultiplier,
  rarity,
  seasonalProbability,
  unlockedProbability,
}: {
  foilProbability: number;
  lootData: LootData;
  mintProbability: number;
  mintValueMultiplier: number;
  rarity: ArtworkRarity;
  seasonalProbability: number;
  unlockedProbability: number;
}): number {
  let expected = 0;
  for (const foil of [false, true]) {
    for (const mint of [false, true]) {
      for (const seasonal of [false, true]) {
        for (const unlocked of [false, true]) {
          const probability =
            getOutcomeProbability(foil, foilProbability) *
            getOutcomeProbability(mint, mintProbability) *
            getOutcomeProbability(seasonal, seasonalProbability) *
            getOutcomeProbability(unlocked, unlockedProbability);
          if (probability === 0) continue;
          expected +=
            probability *
            calculateItemValues(
              {
                condition: mint ? 1 : 0.5,
                mint,
                mint_value_multiplier: mint ? mintValueMultiplier : 1,
                attributes: {
                  locked: [],
                  unlocked: [ESTIMATED_ATTRIBUTE],
                  special: [],
                },
                foil,
                seasonal,
                lottery: 0,
                original: false,
                vintage: false,
                unlocked,
                level: 1,
              },
              {
                _id: "estimated",
                artist_id: "estimated",
                artist: "Estimated",
                title: "Estimated",
                date: 0,
                genre: "Estimated",
                medium: "Estimated",
                rarity,
                value_scale: 0.5,
                height: 1,
                width: 1,
                active: true,
              },
              lootData,
            ).sell;
        }
      }
    }
  }
  return expected;
}

function getOutcomeProbability(outcome: boolean, probability: number): number {
  return outcome ? probability : 1 - probability;
}

function clampProbability(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

const ESTIMATED_ATTRIBUTE: ItemAttribute = {
  _id: "estimated",
  title: "Estimated",
  type: "estimated",
  description: "Expected-value placeholder.",
  icon: "",
  npc_name: "Estimated",
  active: true,
  value: 0.5,
};
