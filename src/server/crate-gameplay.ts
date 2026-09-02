import type { Db } from "mongodb";

import {
  getAverageDropValueForLevel,
  MAX_PLAYER_LEVEL,
} from "./collection-gameplay.ts";
import {
  amplifyRarityMap,
  getRarityMap,
  type ArtworkRarity,
  type LootData,
} from "./gameplay.ts";
import type { GameplayConfig } from "./game-settings.ts";

export type CrateQuality =
  | "standard"
  | "bronze"
  | "silver"
  | "gold"
  | "platinum";

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
  rarityWeights?: Record<ArtworkRarity, number>;
  foilProbability: number;
  unlockedProbability: number;
};

const FEATURED_CRATES = [
  {
    id: "bronze",
    name: "Bronze discovery crate",
    description: "A compact crate for expanding a young collection.",
    highlights: ["6 artworks", "Accessible at every level"],
    levelRequirement: 0,
    rarityAmplifier: 1,
    featureMultiplier: 1.6,
    costMultiplier: 0.55,
  },
  {
    id: "silver",
    name: "Silver foil crate",
    description: "Polished stock with improved rarity and foil odds.",
    highlights: ["6 artworks", "1.8x foil chance", "Improved rarity odds"],
    levelRequirement: 5,
    rarityAmplifier: 1.2,
    featureMultiplier: 1.8,
    costMultiplier: 0.78,
  },
  {
    id: "gold",
    name: "Gold unlocked crate",
    description: "Curated works with stronger rarity and unlocked-property odds.",
    highlights: ["6 artworks", "2x unlocked chance", "Stronger rarity odds"],
    levelRequirement: 15,
    rarityAmplifier: 1.5,
    featureMultiplier: 2,
    costMultiplier: 1.05,
  },
  {
    id: "platinum",
    name: "Platinum collector crate",
    description: "Premium stock with the strongest modifier and rarity boosts.",
    highlights: [
      "6 artworks",
      "2.2x foil and unlocked chance",
      "Best rarity odds",
    ],
    levelRequirement: 30,
    rarityAmplifier: 2,
    featureMultiplier: 2.2,
    costMultiplier: 1.4,
  },
] as const;

export async function getPurchasableCrateOffers(
  database: Db,
  playerLevel: number,
  config: GameplayConfig,
): Promise<CrateOffer[]> {
  const metadata = await database
    .collection<{ _id: string; loot_data: LootData }>("metadata")
    .findOne({ _id: "loot-data" });
  if (!metadata) {
    throw new Error("Loot metadata has not been seeded.");
  }

  const basicCost = await getBasicCrateCost(
    database,
    playerLevel,
    metadata.loot_data,
  );
  const itemCount = metadata.loot_data.items_per_basic_crate;
  const standard: CrateOffer = {
    id: "standard",
    name: "Standard collection crate",
    quality: "standard",
    description: "The original full-size crate, priced for your current level.",
    highlights: [`${itemCount} artworks`, "Level-adjusted rarity pool"],
    itemCount,
    cost: basicCost,
    levelRequirement: 0,
    foilProbability: config.foilProbability,
    unlockedProbability: config.unlockedProbability,
  };

  const baseRarityMap = getRarityMap(playerLevel, metadata.loot_data);
  return [
    standard,
    ...FEATURED_CRATES.map<CrateOffer>((crate) => ({
      id: crate.id,
      name: crate.name,
      quality: crate.id,
      description: crate.description,
      highlights: [...crate.highlights],
      itemCount: 6,
      cost: Math.max(
        1,
        Math.floor(
          basicCost *
            (6 / Math.max(1, itemCount)) *
            crate.costMultiplier,
        ),
      ),
      levelRequirement: crate.levelRequirement,
      rarityWeights: amplifyRarityMap(
        baseRarityMap,
        crate.rarityAmplifier,
      ),
      foilProbability: Math.min(
        1,
        config.foilProbability *
          (crate.id === "silver" || crate.id === "platinum"
            ? crate.featureMultiplier
            : 1),
      ),
      unlockedProbability: Math.min(
        1,
        config.unlockedProbability *
          (crate.id === "gold" || crate.id === "platinum"
            ? crate.featureMultiplier
            : 1),
      ),
    })),
  ];
}

export function getCrateOffer(
  offers: CrateOffer[],
  id: string,
): CrateOffer | null {
  return offers.find((offer) => offer.id === id) ?? null;
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

async function getBasicCrateCost(
  database: Db,
  playerLevel: number,
  lootData: LootData,
): Promise<number> {
  if (playerLevel >= MAX_PLAYER_LEVEL) {
    return lootData.basic_crate_cost;
  }

  const [averageAtLevel, averageAtMaximum] = await Promise.all([
    getAverageDropValueForLevel(database, playerLevel),
    getAverageDropValueForLevel(database, MAX_PLAYER_LEVEL),
  ]);
  const itemCount = Math.max(1, lootData.items_per_basic_crate);
  if (averageAtLevel <= 0 || averageAtMaximum <= 0) {
    return lootData.basic_crate_cost;
  }

  const maximumUpcharge =
    lootData.basic_crate_cost / (averageAtMaximum * itemCount);
  const minimumUpcharge = Math.max(maximumUpcharge / 10, 2);
  const upcharge =
    minimumUpcharge +
    (playerLevel / MAX_PLAYER_LEVEL) *
      (maximumUpcharge - minimumUpcharge);
  return Math.max(1, Math.floor(itemCount * averageAtLevel * upcharge));
}
