import { randomUUID } from "node:crypto";

import type { Db } from "mongodb";

export const ARTWORK_RARITIES = [
  "common",
  "uncommon",
  "rare",
  "legendary",
  "masterpiece",
] as const;

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

type LootData = {
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

type Artwork = {
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
  attributes: {
    locked: ItemAttribute[];
    unlocked: ItemAttribute[];
    special: ItemAttribute[];
  };
  active_unique_attribute?: string;
  owner: string;
  status: "unclaimed" | "claimed" | "displayed";
  source: string;
  date_created: string;
  date_received: string;
  level: number;
  roll_count: number;
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
  artwork_data: Artwork;
  permanent: boolean;
  repairing: boolean;
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
): Record<ArtworkRarity, number> {
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

export async function generateDailyDrop(
  database: Db,
  playerId: string,
  playerLevel: number,
  now = new Date(),
  itemCount = 6,
): Promise<GameItem[]> {
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

  const rarityMap = getRarityMap(playerLevel, metadata.loot_data);
  const artworks = await database
    .collection<Artwork>("artworks")
    .find({ active: true })
    .toArray();
  const artworksByRarity = new Map<ArtworkRarity, Artwork[]>();
  for (const rarity of ARTWORK_RARITIES) {
    artworksByRarity.set(
      rarity,
      artworks.filter((artwork) => artwork.rarity === rarity),
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
}: {
  artwork: Artwork;
  attributes: ItemAttribute[];
  lootData: LootData;
  owner: string;
  rarityMap: Record<ArtworkRarity, number>;
  artworkWeightTotal: number;
  now: Date;
}): GameItem {
  const foil = Math.random() < lootData.global_foil_chance;
  const unlocked =
    artwork.rarity !== "common" &&
    Math.random() < lootData.global_unlocked_chance;
  const misprint = Math.random() < lootData.global_misprint_chance;
  const artworkData = misprintArtwork({ ...artwork }, misprint);
  const itemAttributes = getItemAttributes(
    artworkData,
    unlocked,
    attributes,
  );
  const condition = getCondition(0);
  const seasonal =
    lootData.seasonal_items[artwork.rarity]?.includes(artwork._id) ?? false;
  const timestamp = now.toISOString();

  const base = {
    _id: randomUUID(),
    artwork_id: artwork._id,
    condition,
    attributes: itemAttributes,
    active_unique_attribute: artwork.unique_attributes?.[0],
    owner,
    status: "unclaimed" as const,
    source: "daily drop",
    date_created: timestamp,
    date_received: timestamp,
    level: 1,
    roll_count: 0,
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
    artwork_data: artworkData,
    permanent: false,
    repairing: false,
  };
  const values = getItemValues(base, lootData);
  const rarityOdds = rarityMap[artwork.rarity];
  const rarityArtworksWeight = 50 + Math.floor((1 - artwork.value_scale) * 50);
  let odds = rarityOdds * (rarityArtworksWeight / artworkWeightTotal);
  if (foil) odds *= lootData.global_foil_chance;
  if (unlocked) odds *= lootData.global_unlocked_chance;

  return {
    ...base,
    odds: odds > 0 ? `1 in ${Math.floor(1 / odds).toLocaleString("en-US")}` : "0",
    values,
    reroll_cost: Math.floor(
      lootData.rarity_values[artwork.rarity].min * 0.1,
    ),
  };
}

export function getSpecialAttributeCount(rarity: ArtworkRarity): number {
  return Math.max(ARTWORK_RARITIES.indexOf(rarity) - 1, 0);
}

function getItemAttributes(
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
        value: getAttributeValue(0.8),
      });
    }
  }

  const lockedCount = artwork.rarity === "common" || itemIsUnlocked ? 0 : 1;
  const unlockedCount = artwork.rarity === "common" || !itemIsUnlocked ? 1 : 2;
  for (let index = 0; index < lockedCount; index += 1) {
    result.locked.push({
      ...takeRandom(remaining),
      value: getAttributeValue(0.5),
    });
  }
  for (let index = 0; index < unlockedCount; index += 1) {
    result.unlocked.push({
      ...takeRandom(remaining),
      value: getAttributeValue(0),
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

function getAttributeValue(minimum: number): number {
  const tier = rollWeighted(
    [0, 1, 2, 3, 4].map((value, index) => ({
      value,
      weight: [1, 2, 3, 2, 1][index],
    })),
  );
  const raw = Number(((tier * 20 + Math.random() * 20) / 100).toFixed(2));
  return Number((minimum + raw * (1 - minimum)).toFixed(2));
}

function misprintArtwork(artwork: Artwork, misprint: boolean): Artwork {
  if (!misprint) return artwork;
  const field = Math.random() < 0.5 ? "artist" : "title";
  const text = artwork[field];
  if (text.length > 0) {
    const index = Math.floor(Math.random() * text.length);
    artwork[field] = text.slice(0, index) + text.slice(index + 1);
  }
  return artwork;
}

function getItemValues(
  item: Pick<
    GameItem,
    | "artwork_data"
    | "condition"
    | "attributes"
    | "foil"
    | "seasonal"
    | "lottery"
    | "original"
    | "vintage"
    | "unlocked"
    | "level"
  >,
  lootData: LootData,
): GameItem["values"] {
  const range = lootData.rarity_values[item.artwork_data.rarity];
  const mint = Math.floor(
    range.min + item.artwork_data.value_scale * (range.max - range.min),
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
  if (item.foil) actual *= 5;
  if (item.seasonal) {
    actual *= { common: 2, uncommon: 2, rare: 4, legendary: 10, masterpiece: 10 }[
      item.artwork_data.rarity
    ];
  }
  if (item.lottery) actual *= 10 + item.lottery;
  if (item.original) actual *= 7;
  if (item.vintage) actual *= 2;
  if (item.unlocked) actual *= 1.5;
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
