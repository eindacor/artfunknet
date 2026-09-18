import type { Db } from "mongodb";

import type { Artwork, ItemAttribute, LootData } from "../gameplay.ts";
import type { LegendaryAttribute } from "../legendary-attributes.ts";

export type TestDbPlayerOptions = {
  level?: number;
  bankBalance?: number;
  xp?: number;
  lotteryTickets?: number;
};

export type SetupTestDbOptions = {
  playerProfile?: TestDbPlayerOptions;
  artworks?: Partial<Artwork>[];
  attributes?: ItemAttribute[];
  uniqueAttributes?: Partial<LegendaryAttribute>[];
};

export async function setupTestDb(
  db: Db,
  playerId: string,
  options: SetupTestDbOptions = {},
) {
  const now = new Date();
  const futureTime = new Date(now.getTime() + 60 * 60 * 1000);

  // 1. Seed player
  await db.collection<any>("players").insertOne({
    _id: playerId,
    active: true,
    profile: {
      level: options.playerProfile?.level ?? 1,
      bank_balance: options.playerProfile?.bankBalance ?? 5000,
      xp: options.playerProfile?.xp ?? 0,
      lottery_tickets: options.playerProfile?.lotteryTickets ?? 0,
    },
  });

  // 2. Seed metadata loot_data with complete schema defaults
  await db.collection<any>("metadata").insertOne({
    _id: "loot-data",
    loot_data: {
      base_drop_value: 1000,
      level_multiplier: 1,
      basic_crate_cost: 30000000,
      items_per_basic_crate: 12,
      crate_expense_per_masterpiece: 3600000000,
      global_foil_chance: 0,
      global_unlocked_chance: 0,
      global_patreon_chance: 0,
      global_misprint_chance: 0,
      rarity_values: {
        common: { min: 1000, max: 2000 },
        uncommon: { min: 2000, max: 4000 },
        rare: { min: 4000, max: 8000 },
        legendary: { min: 8000, max: 16000 },
        masterpiece: { min: 16000, max: 32000 },
      },
      drop_tables: {
        rarity_weights: {
          1: { common: 100, uncommon: 0, rare: 0, legendary: 0, masterpiece: 0 },
        },
      },
      seasonal_items: {
        common: [],
        uncommon: [],
        rare: [],
        legendary: [],
        masterpiece: [],
      },
    } as unknown as LootData,
  });

  // 3. Seed active artworks
  const defaultArtworks: Partial<Artwork>[] = options.artworks ?? [
    { _id: "art-1", active: true, rarity: "common", value_scale: 0.5, title: "Art 1", artist: "Artist 1" },
    { _id: "art-2", active: true, rarity: "common", value_scale: 0.5, title: "Art 2", artist: "Artist 2" },
    { _id: "art-3", active: true, rarity: "common", value_scale: 0.5, title: "Art 3", artist: "Artist 3" },
    { _id: "art-4", active: true, rarity: "common", value_scale: 0.5, title: "Art 4", artist: "Artist 4" },
    { _id: "art-5", active: true, rarity: "common", value_scale: 0.5, title: "Art 5", artist: "Artist 5" },
  ];
  await db.collection<any>("artworks").insertMany(defaultArtworks);

  // 4. Seed active item attribute
  const defaultAttributes: ItemAttribute[] = options.attributes ?? [
    {
      _id: "attr-default",
      title: "Default Attribute",
      type: "regular",
      description: "Default attribute description",
      icon: "default-icon",
      npc_name: "Default NPC",
      active: true,
    },
  ];
  await db.collection<any>("attributes").insertMany(defaultAttributes);

  // 5. Seed unique attributes if provided
  if (options.uniqueAttributes && options.uniqueAttributes.length > 0) {
    await db.collection<any>("unique_attributes").insertMany(options.uniqueAttributes);
  }

  return { now, futureTime };
}
