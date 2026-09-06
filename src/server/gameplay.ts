import { randomUUID } from "node:crypto";

import type { Db } from "mongodb";

import { getCardRendererSettings } from "./card-renderer-settings.ts";
import { getRerollCost } from "./item-reroll.ts";

export const ARTWORK_RARITIES = [
  "common",
  "uncommon",
  "rare",
  "legendary",
  "masterpiece",
] as const;

export const LOTTERY_LEVEL_MAX = 10;

export type ArtworkRarity = (typeof ARTWORK_RARITIES)[number];


const PLAYER_LEVEL_MAX = 50;
const RARITY_LEVEL_RESTRICTIONS: Record<ArtworkRarity, number> = {
  common: 0,
  uncommon: 5,
  rare: 15,
  legendary: 30,
  masterpiece: 50,
};
const MAX_DROP_PORTION_COEFFICIENTS: Partial<
  Record<ArtworkRarity, number>
> = {
  uncommon: 0.3,
  rare: 0.1,
  legendary: 0.01,
};

export type LootData = {
  rarity_values: Record<ArtworkRarity, { min: number; max: number }>;
  basic_crate_cost: number;
  items_per_basic_crate: number;
  crate_expense_per_masterpiece: number;
  seasonal_items: Record<ArtworkRarity, string[]>;
  global_foil_chance: number;
  global_patreon_chance: number;
  global_unlocked_chance: number;
  global_misprint_chance: number;
};

export type Artwork = {
  _id: string;
  artist_id: string;
  artist: string;
  title: string;
  date: number;
  genre: string;
  medium: string;
  rarity: ArtworkRarity;
  value_scale: number;
  height: number;
  width: number;
  active: boolean;
  special_attributes?: string[];
  unique_attributes?: string[];
};

export function isSeasonalArtwork(
  lootData: Pick<LootData, "seasonal_items">,
  artwork: Pick<Artwork, "_id" | "rarity">,
): boolean {
  return lootData.seasonal_items[artwork.rarity]?.includes(artwork._id) ?? false;
}

export type ArtworkOverrides = Partial<Pick<Artwork, "artist" | "title">>;

export type ItemTransaction = {
  type: "generation" | "transfer" | "auction";
  from_owner: string | null;
  to_owner: string;
  occurred_at: string;
  source: string;
  amount?: number;
};

export type ItemAttribute = {
  _id: string;
  title: string;
  type: string;
  description: string;
  icon: string;
  npc_name: string;
  active: boolean;
  value?: number;
};

export type GameItem = {
  _id: string;
  artwork_id: string;
  condition: number;
  mint: boolean;
  mint_value_multiplier: number;
  attributes: {
    locked: ItemAttribute[];
    unlocked: ItemAttribute[];
    special: ItemAttribute[];
  };
  active_unique_attribute?: string;
  card_renderer?: string;
  owner: string;
  // TODO AI: Auction and trade owner changes must append a transfer entry atomically with the owner update.
  transaction_history: ItemTransaction[];
  status:
    | "unclaimed"
    | "for_sale"
    | "claimed"
    | "displayed"
    | "collector_pending"
    | "auctioned"
    | "bulk_sale_pending";
  source: string;
  date_created: string;
  date_received: string;
  level: number;
  roll_count: number;
  reroll_spent: number;
  foil: boolean;
  unlocked: boolean;
  seasonal: boolean;
  lottery: number;
  original: boolean;
  patreon: boolean;
  vintage: boolean;
  authenticity: {
    forgery: boolean;
    forgery_quality: number;
    liable: string;
    liability_pending: boolean;
    identified: boolean;
    fee: number;
    original_owner: string;
  };
  tags: string[];
  artwork_overrides?: ArtworkOverrides;
  misprint: boolean;
  permanent: boolean;
  repairing: boolean;
  repair_tick_at?: string;
  debug: boolean;
  bulk_sale_operation?: string;
  time_displayed?: string;
  odds: string;
  values: {
    sell: number;
    purchase: number;
    actual: number;
    auction_min: number;
    collector: number;
    dealer: number;
  };
  reroll_cost: number;
};

export function getRarityMap(
  playerLevel: number,
  lootData: Pick<
    LootData,
    "basic_crate_cost" | "crate_expense_per_masterpiece" | "items_per_basic_crate"
  >,
  baseWeights?: Record<ArtworkRarity, number>,
): Record<ArtworkRarity, number> {
  if (baseWeights) {
    const baseMap = normalizeRarityMap(baseWeights);
    const map = {} as Record<ArtworkRarity, number>;
    let nonCommonTotal = 0;
    for (const rarity of ARTWORK_RARITIES) {
      if (rarity === "common") continue;
      const restriction = RARITY_LEVEL_RESTRICTIONS[rarity];
      const scale =
        playerLevel < restriction
          ? 0
          : Math.pow(
              (playerLevel - restriction + 1) /
                (PLAYER_LEVEL_MAX - restriction + 1),
              2,
            );
      map[rarity] = baseMap[rarity] * scale;
      nonCommonTotal += map[rarity];
    }
    map.common = Math.max(0, 1 - nonCommonTotal);
    return map;
  }

  const map = {} as Record<ArtworkRarity, number>;
  let remaining = 1;

  for (const rarity of [...ARTWORK_RARITIES].reverse()) {
    let portion: number;
    if (rarity === "common") {
      portion = remaining;
    } else if (playerLevel < RARITY_LEVEL_RESTRICTIONS[rarity]) {
      portion = 0;
    } else if (rarity === "masterpiece") {
      portion =
        1 /
        ((lootData.crate_expense_per_masterpiece /
          lootData.basic_crate_cost) *
          lootData.items_per_basic_crate);
    } else {
      const stepCount =
        PLAYER_LEVEL_MAX - RARITY_LEVEL_RESTRICTIONS[rarity] + 1;
      const playerStep =
        playerLevel - RARITY_LEVEL_RESTRICTIONS[rarity] + 1;
      const restrictionScale = playerStep / stepCount;
      portion =
        remaining *
        (MAX_DROP_PORTION_COEFFICIENTS[rarity] ?? 0) *
        Math.pow(restrictionScale, 2);
    }

    map[rarity] = portion;
    remaining -= portion;
  }

  return map;
}

export function normalizeRarityMap(
  weights: Record<ArtworkRarity, number>,
): Record<ArtworkRarity, number> {
  const total = ARTWORK_RARITIES.reduce(
    (sum, rarity) => sum + weights[rarity],
    0,
  );
  if (total <= 0) {
    throw new Error("At least one rarity weight must be greater than zero.");
  }

  return Object.fromEntries(
    ARTWORK_RARITIES.map((rarity) => [rarity, weights[rarity] / total]),
  ) as Record<ArtworkRarity, number>;
}

export function getConfiguredRarityMap(
  playerLevel: number,
  lootData: Pick<
    LootData,
    "basic_crate_cost" | "crate_expense_per_masterpiece" | "items_per_basic_crate"
  >,
  weights: Record<ArtworkRarity, number>,
  useRawWeights = false,
): Record<ArtworkRarity, number> {
  return useRawWeights
    ? normalizeRarityMap(weights)
    : getRarityMap(playerLevel, lootData, weights);
}

export function rollWeighted<T>(
  entries: Array<{ value: T; weight: number }>,
  random = Math.random,
): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (entries.length === 0 || total <= 0) {
    throw new Error("Cannot roll an empty weighted map.");
  }

  let roll = random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll < 0) {
      return entry.value;
    }
  }

  return entries[entries.length - 1].value;
}

export function rollProbability(
  probability: number,
  random = Math.random,
): boolean {
  return random() < probability;
}

export type ItemGenerationMap = {
  rarity: Record<ArtworkRarity, number>;
  foil: number;
  mint: number;
  unlocked: number;
  misprint: number;
  cardStyle: number;
  cardStyles: Readonly<Record<string, number>>;
};

export type ItemGenerationProbabilityMultipliers = Partial<
  Record<"foil" | "mint" | "unlocked" | "misprint" | "cardStyle", number>
>;

export function normalizeProbability(
  probability: number,
): number {
  return Math.min(Math.max(probability, 0), 1);
}

export function applyItemGenerationProbabilityMultipliers<
  T extends Partial<
    Pick<
      ItemGenerationMap,
      "foil" | "mint" | "unlocked" | "misprint" | "cardStyle"
    >
  >,
>(
  generationMap: T,
  multipliers: ItemGenerationProbabilityMultipliers,
): T {
  const result = { ...generationMap };
  for (const property of [
    "foil",
    "mint",
    "unlocked",
    "misprint",
    "cardStyle",
  ] as const) {
    const multiplier = multipliers[property];
    const probability = generationMap[property];
    if (multiplier === undefined || probability === undefined) continue;
    if (!Number.isFinite(multiplier) || multiplier < 0) {
      throw new Error(`${property} probability multiplier must be non-negative.`);
    }
    result[property] = normalizeProbability(
      probability * multiplier,
    );
  }
  return result;
}

export function rollUnlocked(
  rarity: ArtworkRarity,
  probability: number,
  random = Math.random,
): boolean {
  return rarity !== "common" && rollProbability(probability, random);
}

export function rollGeneratedItemProperties(
  rarity: ArtworkRarity,
  {
    foil,
    mint,
    unlocked,
  }: {
    foil: number;
    mint: number;
    unlocked: number;
  },
  random: () => number = Math.random,
) {
  return {
    foil: rollProbability(foil, random),
    mint: rollProbability(mint, random),
    unlocked: rollUnlocked(rarity, unlocked, random),
  };
}

export function rollGeneratedCardRenderer(
  activeRendererIds: readonly string[],
  probability: number,
  random: () => number = Math.random,
  rendererWeights?: Readonly<Record<string, number>>,
): string | undefined {
  const applicableRendererIds = activeRendererIds.filter(
    (rendererId) =>
      rendererId !== "museum" &&
      (rendererWeights?.[rendererId] ?? 1) > 0,
  );
  if (
    applicableRendererIds.length === 0 ||
    !rollProbability(probability, random)
  ) {
    return undefined;
  }

  return rollWeighted(
    applicableRendererIds.map((rendererId) => ({
      value: rendererId,
      weight: rendererWeights?.[rendererId] ?? 1,
    })),
    random,
  );
}

export type DailyDropOptions = {
  now?: Date;
  itemCount?: number;
  generationMap?: Partial<ItemGenerationMap>;
  mintValueMultiplier?: number;
  debug?: boolean;
  useRawRarityMap?: boolean;
  source?: string;
  itemLevel?: number;
  conditionMinimum?: number;
  status?: "unclaimed" | "for_sale" | "claimed" | "auctioned";
};

export function amplifyRarityMap(
  rarityMap: Record<ArtworkRarity, number>,
  masterpieceAmplifier: number,
): Record<ArtworkRarity, number> {
  const delta = masterpieceAmplifier - 1;
  return Object.fromEntries(
    ARTWORK_RARITIES.map((rarity, index) => [
      rarity,
      rarityMap[rarity] *
        (1 + delta * (index / (ARTWORK_RARITIES.length - 1))),
    ]),
  ) as Record<ArtworkRarity, number>;
}

export function filterActiveArtworks<T extends Pick<Artwork, "active">>(
  artworks: readonly T[],
): T[] {
  return artworks.filter((artwork) => artwork.active === true);
}

export async function generateDailyDrop(
  database: Db,
  playerId: string,
  playerLevel: number,
  options: DailyDropOptions = {},
): Promise<GameItem[]> {
  const {
    now = new Date(),
    itemCount = 6,
    generationMap = {},
    mintValueMultiplier = 1,
    debug = false,
    useRawRarityMap = false,
    source = "daily drop",
    itemLevel = 1,
    conditionMinimum = 0,
    status = "unclaimed",
  } = options;
  const metadata = await database
    .collection<{ _id: string; loot_data: LootData }>("metadata")
    .findOne({ _id: "loot-data" });
  if (!metadata) {
    throw new Error("Loot metadata has not been seeded.");
  }

  const attributes = await database
    .collection<ItemAttribute>("attributes")
    .find({ active: true })
    .toArray();
  if (attributes.length === 0) {
    throw new Error("Artwork attributes have not been seeded.");
  }
  const rendererSettings = await getCardRendererSettings(database);

  const rarityMap = generationMap.rarity
    ? getConfiguredRarityMap(
        playerLevel,
        metadata.loot_data,
        generationMap.rarity,
        useRawRarityMap,
      )
    : getRarityMap(playerLevel, metadata.loot_data);
  const foilProbability = normalizeProbability(generationMap.foil ?? 0.005);
  const mintProbability = normalizeProbability(generationMap.mint ?? 0);
  const unlockedProbability = normalizeProbability(
    generationMap.unlocked ?? 0.05,
  );
  const misprintProbability = normalizeProbability(
    generationMap.misprint ?? metadata.loot_data.global_misprint_chance,
  );
  const cardStyleProbability = normalizeProbability(
    generationMap.cardStyle ?? 0,
  );
  const artworks = await database
    .collection<Artwork>("artworks")
    .find({ active: true })
    .toArray();
  const activeArtworks = filterActiveArtworks(artworks);
  const artworksByRarity = new Map<ArtworkRarity, Artwork[]>();
  for (const rarity of ARTWORK_RARITIES) {
    artworksByRarity.set(
      rarity,
      activeArtworks.filter((artwork) => artwork.rarity === rarity),
    );
  }

  const items: GameItem[] = [];
  for (let index = 0; index < itemCount; index += 1) {
    const rarity = rollAvailableRarity(rarityMap, artworksByRarity);
    const rarityArtworks = artworksByRarity.get(rarity) ?? [];
    const artwork = rollWeighted(
      rarityArtworks.map((candidate) => ({
        value: candidate,
        weight: 50 + Math.floor((1 - candidate.value_scale) * 50),
      })),
    );
    items.push(
      createItem({
        artwork,
        attributes,
        lootData: metadata.loot_data,
        owner: playerId,
        rarityMap,
        artworkWeightTotal: rarityArtworks.reduce(
          (sum, candidate) =>
            sum + 50 + Math.floor((1 - candidate.value_scale) * 50),
          0,
        ),
        now,
        activeRendererIds: rendererSettings.activeRendererIds,
        cardStyleProbability,
        cardStyleWeights: generationMap.cardStyles,
        foilProbability,
        mintProbability,
        mintValueMultiplier,
        unlockedProbability,
        misprintProbability,
        debug,
        source,
        itemLevel,
        conditionMinimum,
        status,
      }),
    );
  }

  await database.collection<GameItem>("items").insertMany(items);
  return items;
}

function rollAvailableRarity(
  rarityMap: Record<ArtworkRarity, number>,
  artworksByRarity: Map<ArtworkRarity, Artwork[]>,
): ArtworkRarity {
  const available = ARTWORK_RARITIES.filter(
    (rarity) =>
      rarityMap[rarity] > 0 && (artworksByRarity.get(rarity)?.length ?? 0) > 0,
  );
  if (available.length === 0) {
    throw new Error("No active artwork is available for this player's level.");
  }

  return rollWeighted(
    available.map((rarity) => ({ value: rarity, weight: rarityMap[rarity] })),
  );
}

function createItem({
  artwork,
  attributes,
  lootData,
  owner,
  rarityMap,
  artworkWeightTotal,
  now,
  activeRendererIds,
  cardStyleProbability,
  cardStyleWeights,
  foilProbability,
  mintProbability,
  mintValueMultiplier,
  unlockedProbability,
  misprintProbability,
  debug,
  source,
  itemLevel,
  conditionMinimum,
  status,
}: {
  artwork: Artwork;
  attributes: ItemAttribute[];
  lootData: LootData;
  owner: string;
  rarityMap: Record<ArtworkRarity, number>;
  artworkWeightTotal: number;
  now: Date;
  activeRendererIds: readonly string[];
  cardStyleProbability: number;
  cardStyleWeights?: Readonly<Record<string, number>>;
  foilProbability: number;
  mintProbability: number;
  mintValueMultiplier: number;
  unlockedProbability: number;
  misprintProbability: number;
  debug: boolean;
  source: string;
  itemLevel: number;
  conditionMinimum: number;
  status: "unclaimed" | "for_sale" | "claimed" | "auctioned";
}): GameItem {
  const { foil, mint, unlocked } = rollGeneratedItemProperties(
    artwork.rarity,
    {
      foil: foilProbability,
      mint: mintProbability,
      unlocked: unlockedProbability,
    },
  );
  const misprint = rollProbability(misprintProbability);
  const artworkOverrides = getMisprintOverrides(artwork, misprint);
  const itemArtwork = { ...artwork, ...artworkOverrides };
  const itemAttributes = getItemAttributes(
    itemArtwork,
    unlocked,
    attributes,
  );
  const condition = getGeneratedItemCondition(mint, conditionMinimum);
  const seasonal = isSeasonalArtwork(lootData, artwork);
  const timestamp = now.toISOString();
  const cardRenderer = rollGeneratedCardRenderer(
    activeRendererIds,
    cardStyleProbability,
    Math.random,
    cardStyleWeights,
  );

  const base = {
    _id: randomUUID(),
    artwork_id: artwork._id,
    condition,
    mint,
    mint_value_multiplier: mint ? mintValueMultiplier : 1,
    attributes: itemAttributes,
    active_unique_attribute: artwork.unique_attributes?.[0],
    ...(cardRenderer ? { card_renderer: cardRenderer } : {}),
    owner,
    // TODO AI: Auction and trade transfers should append to this history instead of replacing it.
    transaction_history: [
      {
        type: "generation" as const,
        from_owner: null,
        to_owner: owner,
        occurred_at: timestamp,
        source,
      },
    ],
    status,
    source,
    date_created: timestamp,
    date_received: timestamp,
    level: itemLevel,
    roll_count: 0,
    reroll_spent: 0,
    foil,
    unlocked,
    seasonal,
    lottery: 0,
    original: false,
    patreon: false,
    vintage: false,
    authenticity: {
      forgery: false,
      forgery_quality: Number(Math.random().toFixed(3)),
      liable: owner,
      liability_pending: false,
      identified: true,
      fee: 0,
      original_owner: owner,
    },
    tags: [],
    ...(Object.keys(artworkOverrides).length > 0
      ? { artwork_overrides: artworkOverrides }
      : {}),
    misprint,
    permanent: false,
    repairing: false,
    debug,
  };
  const values = calculateItemValues(base, itemArtwork, lootData);
  const rarityOdds = rarityMap[artwork.rarity];
  const rarityArtworksWeight = 50 + Math.floor((1 - artwork.value_scale) * 50);
  let odds = rarityOdds * (rarityArtworksWeight / artworkWeightTotal);
  if (foil) odds *= foilProbability;
  if (mint) odds *= mintProbability;
  if (unlocked) odds *= unlockedProbability;

  return {
    ...base,
    odds: odds > 0 ? `1 in ${Math.floor(1 / odds).toLocaleString("en-US")}` : "0",
    values,
    reroll_cost: getRerollCost(base, artwork.rarity, lootData),
  };
}

export function getSpecialAttributeCount(rarity: ArtworkRarity): number {
  return Math.max(ARTWORK_RARITIES.indexOf(rarity) - 1, 0);
}

export function getItemAttributes(
  artwork: Artwork,
  itemIsUnlocked: boolean,
  allAttributes: ItemAttribute[],
): GameItem["attributes"] {
  const remaining = [...allAttributes];
  const result: GameItem["attributes"] = {
    locked: [],
    unlocked: [],
    special: [],
  };

  for (const id of artwork.special_attributes ?? []) {
    const index = remaining.findIndex((attribute) => attribute._id === id);
    if (index >= 0) {
      result.special.push({
        ...remaining.splice(index, 1)[0],
        value: rollAttributeValue(0.8),
      });
    }
  }

  const lockedCount = artwork.rarity === "common" || itemIsUnlocked ? 0 : 1;
  const unlockedCount = artwork.rarity === "common" || !itemIsUnlocked ? 1 : 2;
  for (let index = 0; index < lockedCount; index += 1) {
    result.locked.push({
      ...takeRandom(remaining),
      value: rollAttributeValue(0.5),
    });
  }
  for (let index = 0; index < unlockedCount; index += 1) {
    result.unlocked.push({
      ...takeRandom(remaining),
      value: rollAttributeValue(0),
    });
  }

  return result;
}

function takeRandom<T>(values: T[]): T {
  if (values.length === 0) {
    throw new Error("There are not enough active attributes to generate an item.");
  }
  return values.splice(Math.floor(Math.random() * values.length), 1)[0];
}

function getCondition(minimum: number): number {
  const tier = rollWeighted(
    [0, 1, 2, 3, 4].map((value, index) => ({
      value,
      weight: [2, 3, 3, 2, 1][index],
    })),
  );
  const raw = Number(((tier * 20 + Math.random() * 20) / 100).toFixed(2));
  return Number((minimum + raw * (1 - minimum)).toFixed(2));
}

export function getGeneratedItemCondition(
  mint: boolean,
  minimum: number,
): number {
  return mint ? 1 : getCondition(minimum);
}

export function rollAttributeValue(minimum: number): number {
  const tier = rollWeighted(
    [0, 1, 2, 3, 4].map((value, index) => ({
      value,
      weight: [1, 2, 3, 2, 1][index],
    })),
  );
  const raw = Number(((tier * 20 + Math.random() * 20) / 100).toFixed(2));
  return Number((minimum + raw * (1 - minimum)).toFixed(2));
}

function getMisprintOverrides(
  artwork: Artwork,
  misprint: boolean,
): ArtworkOverrides {
  if (!misprint) return {};
  const field = Math.random() < 0.5 ? "artist" : "title";
  const text = artwork[field];
  if (text.length > 0) {
    const index = Math.floor(Math.random() * text.length);
    return { [field]: text.slice(0, index) + text.slice(index + 1) };
  }
  return {};
}

export function calculateItemValues(
  item: Pick<
    GameItem,
    | "condition"
    | "mint"
    | "mint_value_multiplier"
    | "attributes"
    | "foil"
    | "seasonal"
    | "lottery"
    | "original"
    | "vintage"
    | "unlocked"
    | "level"
  >,
  artwork: Artwork,
  lootData: LootData,
): GameItem["values"] {
  const range = lootData.rarity_values[artwork.rarity];
  const mint = Math.floor(
    range.min + artwork.value_scale * (range.max - range.min),
  );
  const ratings = [
    ...item.attributes.locked,
    ...item.attributes.unlocked,
    ...item.attributes.special,
  ];
  const averageRating =
    ratings.length === 0
      ? 0
      : ratings.reduce((sum, attribute) => sum + (attribute.value ?? 0), 0) /
        ratings.length;
  let actual =
    mint * 0.4 +
    mint * 0.4 * item.condition +
    mint * 0.2 * (averageRating * 0.2);
  actual *= getItemValuePropertyMultiplier(item, artwork.rarity);
  actual *= 1 + item.level * 0.01;
  actual = Math.floor(actual);

  return {
    sell: Math.floor(actual * 0.8),
    purchase: Math.floor(actual * 1.5),
    actual,
    auction_min: Math.floor(actual * 0.8 * 0.8),
    collector: Math.floor(actual * 1.2),
    dealer: Math.floor(actual * 0.9),
  };
}

type ItemValueProperties = Pick<
  GameItem,
  | "foil"
  | "seasonal"
  | "lottery"
  | "original"
  | "vintage"
  | "unlocked"
  | "mint"
  | "mint_value_multiplier"
>;

const SEASONAL_VALUE_MULTIPLIERS: Record<ArtworkRarity, number> = {
  common: 2,
  uncommon: 2,
  rare: 4,
  legendary: 10,
  masterpiece: 10,
};

export function getItemValuePropertyMultiplier(
  item: ItemValueProperties,
  rarity: ArtworkRarity,
): number {
  let multiplier = 1;
  if (item.foil) multiplier *= 5;
  if (item.seasonal) multiplier *= SEASONAL_VALUE_MULTIPLIERS[rarity];
  if (item.lottery) multiplier *= 10 + item.lottery;
  if (item.original) multiplier *= 7;
  if (item.vintage) multiplier *= 2;
  if (item.unlocked) multiplier *= 1.5;
  if (item.mint) multiplier *= item.mint_value_multiplier;
  return multiplier;
}
