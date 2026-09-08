import assert from "node:assert/strict";
import test from "node:test";

import {
  createDebugCrates,
  DEFAULT_PURCHASABLE_CRATE_ITEM_COUNT,
  estimateCrateSellValue,
  FEATURED_CRATES,
  getConfiguredCrateCost,
  getCrateCost,
  getEligibleDebugCrates,
  getFeaturedCrateGenerationMap,
  getCrateOffer,
  getCratePermission,
  getVisibleCrateOffers,
} from "./crate-gameplay.ts";
import { DEFAULT_ACTUAL_GAMEPLAY_CONFIG } from "./game-settings.ts";
import {
  ARTWORK_RARITIES,
  calculateItemValues,
  getConfiguredRarityMap,
  rollWeighted,
  type Artwork,
  type ArtworkRarity,
  type ItemAttribute,
  type LootData,
} from "./gameplay.ts";

const offer = {
  id: "unlocked" as const,
  name: "Unlocked crate",
  quality: "unlocked" as const,
  description: "",
  highlights: [],
  itemCount: 6,
  cost: 1_000,
  levelRequirement: 15,
};

test("crate permissions enforce level and price", () => {
  assert.equal(getCratePermission(offer, 14, 10_000).allowed, false);
  assert.equal(getCratePermission(offer, 15, 999).allowed, false);
  assert.deepEqual(getCratePermission(offer, 15, 1_000), { allowed: true });
});

test("only the unlocked crate requires level five", () => {
  assert.equal(
    FEATURED_CRATES.find((crate) => crate.id === "unlocked")
      ?.levelRequirement,
    5,
  );
  assert.ok(
    FEATURED_CRATES.filter((crate) => crate.id !== "unlocked").every(
      (crate) => crate.levelRequirement === 0,
    ),
  );
});

test("default purchasable crates contain six items", () => {
  assert.equal(DEFAULT_PURCHASABLE_CRATE_ITEM_COUNT, 6);
});

test("crate offers are selected only by known ids", () => {
  assert.equal(
    getCrateOffer(
      [
        {
          ...offer,
          generationMap: {
            foil: 0,
            unlocked: 0,
          },
        },
      ],
      "unlocked",
    )?.id,
    "unlocked",
  );
  assert.equal(getCrateOffer([], "unknown"), null);
});

test("crates above the player's level are hidden", () => {
  const locked = { ...offer, generationMap: {} };
  const visible = {
    ...locked,
    id: "foil" as const,
    quality: "foil" as const,
    levelRequirement: 0,
  };

  assert.deepEqual(getVisibleCrateOffers([visible, locked], 14), [visible]);
  assert.deepEqual(getVisibleCrateOffers([visible, locked], 15), [
    visible,
    locked,
  ]);
});

test("debug crates isolate their 50 percent generation probabilities", () => {
  const crates = createDebugCrates();

  assert.equal(crates.length, 6);
  assert.deepEqual(
    Object.fromEntries(
      crates
        .filter(
          (crate) =>
            crate.id !== "debug-unlocked" &&
            !crate.generationMap.rarity,
        )
        .map((crate) => [crate.id, crate.generationMap]),
    ),
    {
      "debug-mint": { mint: 0.5 },
      "debug-foil": { foil: 0.5 },
      "debug-card-style": { cardStyle: 0.5 },
    },
  );
  assert.ok(crates.every((crate) => crate.cost === 0));
  assert.ok(crates.every((crate) => crate.levelRequirement === 0));
});

test("debug crates are available only to test accounts", () => {
  assert.deepEqual(getEligibleDebugCrates(false), []);
  assert.equal(getEligibleDebugCrates(true).length, 6);
});

test("debug rarity crates select only their named rarity", () => {
  const crates = createDebugCrates();

  assert.deepEqual(
    getCrateOffer(crates, "debug-unlocked")?.generationMap,
    {
      unlocked: 0.5,
      rarity: {
        common: 0,
        uncommon: 1,
        rare: 0,
        legendary: 0,
        masterpiece: 0,
      },
    },
  );
  assert.deepEqual(
    getCrateOffer(crates, "debug-legendary")?.generationMap.rarity,
    {
      common: 0,
      uncommon: 0,
      rare: 0,
      legendary: 1,
      masterpiece: 0,
    },
  );
  assert.deepEqual(
    getCrateOffer(crates, "debug-masterpiece")?.generationMap.rarity,
    {
      common: 0,
      uncommon: 0,
      rare: 0,
      legendary: 0,
      masterpiece: 1,
    },
  );
});

test("estimated crate sell value tracks simulated crates across player levels", () => {
  const cratesToOpen = 25_000;
  const itemsPerCrate = 12;
  const seasonalItems = Object.fromEntries(
    ARTWORK_RARITIES.map((rarity) => [rarity, [`${rarity}-seasonal`]]),
  ) as LootData["seasonal_items"];
  const lootData: LootData = {
    rarity_values: {
      common: { min: 5_000, max: 25_000 },
      uncommon: { min: 25_000, max: 65_000 },
      rare: { min: 65_000, max: 225_000 },
      legendary: { min: 225_000, max: 1_505_000 },
      masterpiece: { min: 1_505_000, max: 21_985_000 },
    },
    basic_crate_cost: 30_000_000,
    items_per_basic_crate: itemsPerCrate,
    crate_expense_per_masterpiece: 3_600_000_000,
    seasonal_items: seasonalItems,
    global_foil_chance: 0.005,
    global_patreon_chance: 0.05,
    global_unlocked_chance: 0.05,
    global_misprint_chance: 0.0001,
  };
  const artworks = ARTWORK_RARITIES.flatMap((rarity) =>
    Array.from({ length: 4 }, (_, index) => ({
      _id: index === 0 ? `${rarity}-seasonal` : `${rarity}-${index}`,
      rarity,
    })),
  );
  const generationMap = {
    rarity: DEFAULT_ACTUAL_GAMEPLAY_CONFIG.rarityWeights,
    foil: DEFAULT_ACTUAL_GAMEPLAY_CONFIG.foilProbability,
    mint: DEFAULT_ACTUAL_GAMEPLAY_CONFIG.mintProbability,
    unlocked: DEFAULT_ACTUAL_GAMEPLAY_CONFIG.unlockedProbability,
  };

  for (const level of [0, 5, 15, 30, 50]) {
    const estimated = estimateCrateSellValue({
      artworks,
      generationMap,
      itemCount: itemsPerCrate,
      lootData,
      mintValueMultiplier:
        DEFAULT_ACTUAL_GAMEPLAY_CONFIG.mintValueMultiplier,
      playerLevel: level,
    });

    const simulated = simulateCrateSellValue({
      cratesToOpen,
      generationMap,
      itemsPerCrate,
      level,
      lootData,
      seed: level + 1,
    });
    const relativeError = Math.abs(simulated - estimated) / estimated;
    assert.ok(
      relativeError < 0.08,
      `level ${level}: estimated ${estimated}, simulated ${simulated}, error ${relativeError}`,
    );
  }
});

test("crate cost is expected total sell value multiplied by one scalar", () => {
  const scalar = 12.5;
  assert.equal(getCrateCost(2_400_000, scalar), 30_000_000);
  assert.equal(getCrateCost(1_200_000, scalar), 15_000_000);
});

test("designer crate cost scalar applies only to designer crates", () => {
  const config = {
    crateValueScalar: 3,
    standardCrateCostScalar: 1,
    foilCrateCostScalar: 2,
    unlockedCrateCostScalar: 3,
    designerCrateCostScalar: 2,
    ultimateCrateCostScalar: 4,
  };

  assert.equal(getConfiguredCrateCost(100, config, "standard"), 300);
  assert.equal(getConfiguredCrateCost(100, config, "foil"), 600);
  assert.equal(getConfiguredCrateCost(100, config, "unlocked"), 900);
  assert.equal(getConfiguredCrateCost(100, config, "designer"), 600);
  assert.equal(getConfiguredCrateCost(100, config, "ultimate"), 1_200);
});

test("featured crates apply only their configured chance scalars", () => {
  const config = DEFAULT_ACTUAL_GAMEPLAY_CONFIG;

  assert.deepEqual(getFeaturedCrateGenerationMap("foil", config), {
    foil: config.foilProbability * config.foilCrateChanceScalar,
  });

  assert.deepEqual(getFeaturedCrateGenerationMap("unlocked", config), {
    unlocked:
      config.unlockedProbability * config.unlockedCrateChanceScalar,
  });
  assert.deepEqual(getFeaturedCrateGenerationMap("designer", config), {
    cardStyle:
      config.cardRendererProbability * config.artStyleCrateChanceScalar,
  });
  assert.deepEqual(getFeaturedCrateGenerationMap("ultimate", config), {
    foil: config.foilProbability * config.ultimateFoilChanceScalar,
    unlocked:
      config.unlockedProbability * config.ultimateUnlockedChanceScalar,
    mint: config.mintProbability * config.ultimateMintChanceScalar,
    cardStyle:
      config.cardRendererProbability *
      config.ultimateArtStyleChanceScalar,
    seasonal: config.ultimateSeasonalChanceScalar,
  });
});

test("ultimate crate expected value exceeds foil crate expected value", () => {
  const config = DEFAULT_ACTUAL_GAMEPLAY_CONFIG;
  const lootData: LootData = {
    rarity_values: {
      common: { min: 5_000, max: 25_000 },
      uncommon: { min: 25_000, max: 65_000 },
      rare: { min: 65_000, max: 225_000 },
      legendary: { min: 225_000, max: 1_505_000 },
      masterpiece: { min: 1_505_000, max: 21_985_000 },
    },
    basic_crate_cost: 30_000_000,
    items_per_basic_crate: 6,
    crate_expense_per_masterpiece: 3_600_000_000,
    seasonal_items: {
      common: [],
      uncommon: ["seasonal"],
      rare: [],
      legendary: [],
      masterpiece: [],
    },
    global_foil_chance: 0.005,
    global_patreon_chance: 0.05,
    global_unlocked_chance: 0.05,
    global_misprint_chance: 0.0001,
  };
  const artworks = [
    { _id: "standard", rarity: "uncommon" as const },
    { _id: "seasonal", rarity: "uncommon" as const },
  ];
  const baseMap = {
    rarity: {
      common: 0,
      uncommon: 1,
      rare: 0,
      legendary: 0,
      masterpiece: 0,
    },
    foil: config.foilProbability,
    mint: config.mintProbability,
    unlocked: config.unlockedProbability,
  };
  const foil = estimateCrateSellValue({
    artworks,
    generationMap: {
      ...baseMap,
      ...getFeaturedCrateGenerationMap("foil", config),
    },
    itemCount: 6,
    lootData,
    mintValueMultiplier: config.mintValueMultiplier,
    playerLevel: 50,
    useRawRarityMap: true,
  });
  const ultimate = estimateCrateSellValue({
    artworks,
    generationMap: {
      ...baseMap,
      ...getFeaturedCrateGenerationMap("ultimate", config),
    },
    itemCount: 6,
    lootData,
    mintValueMultiplier: config.mintValueMultiplier,
    playerLevel: 50,
    useRawRarityMap: true,
  });

  assert.ok(ultimate > foil);
});

test("unlocked crate costs more once unlocked items are level-eligible", () => {
  const config = DEFAULT_ACTUAL_GAMEPLAY_CONFIG;
  const lootData: LootData = {
    rarity_values: {
      common: { min: 5_000, max: 25_000 },
      uncommon: { min: 25_000, max: 65_000 },
      rare: { min: 65_000, max: 225_000 },
      legendary: { min: 225_000, max: 1_505_000 },
      masterpiece: { min: 1_505_000, max: 21_985_000 },
    },
    basic_crate_cost: 30_000_000,
    items_per_basic_crate: 6,
    crate_expense_per_masterpiece: 3_600_000_000,
    seasonal_items: {
      common: [],
      uncommon: [],
      rare: [],
      legendary: [],
      masterpiece: [],
    },
    global_foil_chance: 0.005,
    global_patreon_chance: 0.05,
    global_unlocked_chance: 0.05,
    global_misprint_chance: 0.0001,
  };
  const artworks = [
    { _id: "common", rarity: "common" as const },
    { _id: "uncommon", rarity: "uncommon" as const },
  ];
  const baseMap = {
    rarity: config.rarityWeights,
    foil: config.foilProbability,
    mint: config.mintProbability,
    unlocked: config.unlockedProbability,
  };
  const standard = estimateCrateSellValue({
    artworks,
    generationMap: baseMap,
    itemCount: 6,
    lootData,
    mintValueMultiplier: config.mintValueMultiplier,
    playerLevel: 5,
  });
  const unlocked = estimateCrateSellValue({
    artworks,
    generationMap: {
      ...baseMap,
      ...getFeaturedCrateGenerationMap("unlocked", config),
    },
    itemCount: 6,
    lootData,
    mintValueMultiplier: config.mintValueMultiplier,
    playerLevel: 5,
  });

  assert.ok(
    getCrateCost(unlocked, config.crateValueScalar) >
      getCrateCost(standard, config.crateValueScalar),
  );
});

function simulateCrateSellValue({
  cratesToOpen,
  generationMap,
  itemsPerCrate,
  level,
  lootData,
  seed,
}: {
  cratesToOpen: number;
  generationMap: {
    rarity: Record<ArtworkRarity, number>;
    foil: number;
    mint: number;
    unlocked: number;
  };
  itemsPerCrate: number;
  level: number;
  lootData: LootData;
  seed: number;
}): number {
  const random = createSeededRandom(seed);
  const rarityMap = getConfiguredRarityMap(
    level,
    lootData,
    generationMap.rarity,
  );
  let total = 0;
  for (let crate = 0; crate < cratesToOpen; crate += 1) {
    for (let itemIndex = 0; itemIndex < itemsPerCrate; itemIndex += 1) {
      const rarity = rollWeighted(
        ARTWORK_RARITIES.filter((candidate) => rarityMap[candidate] > 0).map(
          (candidate) => ({
            value: candidate,
            weight: rarityMap[candidate],
          }),
        ),
        random,
      );
      const foil = random() < generationMap.foil;
      const mint = random() < generationMap.mint;
      const unlocked =
        rarity !== "common" && random() < generationMap.unlocked;
      const seasonal = random() < 0.25;
      total += calculateItemValues(
        {
          condition: mint ? 1 : 0.5,
          mint,
          mint_value_multiplier: mint
            ? DEFAULT_ACTUAL_GAMEPLAY_CONFIG.mintValueMultiplier
            : 1,
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
        createEstimatedArtwork(rarity),
        lootData,
      ).sell;
    }
  }
  return total / cratesToOpen;
}

function createEstimatedArtwork(rarity: ArtworkRarity): Artwork {
  return {
    _id: `estimated-${rarity}`,
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
  };
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const ESTIMATED_ATTRIBUTE: ItemAttribute = {
  _id: "estimated",
  title: "Estimated",
  type: "estimated",
  description: "",
  icon: "",
  npc_name: "Estimated",
  active: true,
  value: 0.5,
};
