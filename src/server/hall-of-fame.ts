import { randomUUID } from "node:crypto";

import type { Db } from "mongodb";

import { ARTWORK_RARITIES, type ArtworkRarity, type GameItem } from "./gameplay.ts";
import { createPlayerNotification } from "./player-notifications.ts";

export type HallOfFameRecord = {
  _id: string;
  item_id: string;
  item_snapshot: GameItem & { artwork_title?: string; artist_name?: string };
  title: string;
  description: string;
  created_at: string;
  qualifier_id?: string;
  player_id?: string;
  player_screen_name?: string;
};

export type QualifierQuery = {
  rarity?: ArtworkRarity;
  mint?: boolean;
  foil?: boolean;
  unlocked?: boolean;
  seasonal?: boolean;
  original?: boolean;
  lottery?: number;
  minActualValue?: number;
};

export type HallOfFameQualifier = {
  id: string;
  title: string;
  description: string;
  query: QualifierQuery;
};

export const DEFAULT_HOF_QUALIFIERS: HallOfFameQualifier[] = [
  // Masterpiece Milestones
  {
    id: "first-mint-masterpiece",
    title: "First Mint Masterpiece",
    description: "The first mint condition masterpiece found in the game.",
    query: { rarity: "masterpiece", mint: true },
  },
  {
    id: "first-foil-masterpiece",
    title: "First Foil Masterpiece",
    description: "The first foil masterpiece found in the game.",
    query: { rarity: "masterpiece", foil: true },
  },
  {
    id: "first-unlocked-masterpiece",
    title: "First Unlocked Masterpiece",
    description: "The first unlocked masterpiece found in the game.",
    query: { rarity: "masterpiece", unlocked: true },
  },
  {
    id: "first-seasonal-masterpiece",
    title: "First Seasonal Masterpiece",
    description: "The first seasonal masterpiece found in the game.",
    query: { rarity: "masterpiece", seasonal: true },
  },
  {
    id: "first-mint-foil-masterpiece",
    title: "First Mint Foil Masterpiece",
    description: "The first mint condition foil masterpiece in the game.",
    query: { rarity: "masterpiece", mint: true, foil: true },
  },
  {
    id: "first-mint-unlocked-masterpiece",
    title: "First Mint Unlocked Masterpiece",
    description: "The first mint condition unlocked masterpiece in the game.",
    query: { rarity: "masterpiece", mint: true, unlocked: true },
  },
  {
    id: "first-foil-unlocked-masterpiece",
    title: "First Foil Unlocked Masterpiece",
    description: "The first foil unlocked masterpiece in the game.",
    query: { rarity: "masterpiece", foil: true, unlocked: true },
  },
  {
    id: "first-mint-foil-unlocked-masterpiece",
    title: "First Ultimate Masterpiece",
    description: "The first mint, foil, and unlocked masterpiece in the game.",
    query: { rarity: "masterpiece", mint: true, foil: true, unlocked: true },
  },

  // General Attribute Milestones
  {
    id: "first-foil-unlocked-legendary",
    title: "First Foil Unlocked Legendary",
    description: "The first legendary item to be foil and unlocked.",
    query: { rarity: "legendary", foil: true, unlocked: true },
  },
  {
    id: "first-unlocked-foil",
    title: "First Unlocked Foil",
    description: "The first item of any rarity to be foil and unlocked.",
    query: { foil: true, unlocked: true },
  },
  {
    id: "first-seasonal-item",
    title: "First Seasonal Artwork",
    description: "The first seasonal artwork claimed in the game.",
    query: { seasonal: true },
  },
  {
    id: "first-original-artwork",
    title: "First Original Masterpiece",
    description: "The first original masterpiece artwork acquired by a player.",
    query: { original: true },
  },

  // Value Ceilings
  {
    id: "first-10m-valuation",
    title: "First 10M Valuation",
    description: "The first item claimed with an actual value exceeding $10,000,000.",
    query: { minActualValue: 10_000_000 },
  },
  {
    id: "first-100m-valuation",
    title: "First 100M Valuation",
    description: "The first item claimed with an actual value exceeding $100,000,000.",
    query: { minActualValue: 100_000_000 },
  },
  {
    id: "first-1b-valuation",
    title: "First Billion Dollar Artwork",
    description: "The first item claimed with an actual value exceeding $1,000,000,000.",
    query: { minActualValue: 1_000_000_000 },
  },

  // Lottery Tier Milestones (1 through 10)
  ...Array.from({ length: 10 }, (_, index) => ({
    id: `first-lottery-tier-${index + 1}`,
    title: `First Tier ${index + 1} Lottery Winner`,
    description: `The first item claimed from Tier ${index + 1} of the weekly lottery.`,
    query: { lottery: index + 1 },
  })),
];

const registeredQualifiers: Map<string, HallOfFameQualifier> = new Map();

for (const qualifier of DEFAULT_HOF_QUALIFIERS) {
  registeredQualifiers.set(qualifier.id, qualifier);
}

export function registerHallOfFameQualifier(
  title: string,
  description: string,
  query: QualifierQuery,
): HallOfFameQualifier {
  const id = `qualifier-${randomUUID()}`;
  const qualifier: HallOfFameQualifier = { id, title, description, query };
  registeredQualifiers.set(id, qualifier);
  return qualifier;
}

export function itemMatchesQualifierQuery(
  item: GameItem,
  artworkRarity?: ArtworkRarity,
  query?: QualifierQuery,
): boolean {
  if (!query) return false;
  if (query.rarity && artworkRarity !== query.rarity) return false;
  if (query.mint !== undefined && item.mint !== query.mint) return false;
  if (query.foil !== undefined && item.foil !== query.foil) return false;
  if (query.unlocked !== undefined && item.unlocked !== query.unlocked) return false;
  if (query.seasonal !== undefined && item.seasonal !== query.seasonal) return false;
  if (query.original !== undefined && item.original !== query.original) return false;
  if (query.lottery !== undefined && item.lottery !== query.lottery) return false;
  if (
    query.minActualValue !== undefined &&
    (item.values?.actual ?? 0) < query.minActualValue
  ) {
    return false;
  }
  return true;
}

export async function checkItemForHallOfFameStatus(
  database: Db,
  item: GameItem,
  player: { _id: string; test_account?: boolean; screen_name: string },
): Promise<HallOfFameRecord | null> {
  if (player.test_account === true) {
    return null; // Exclude test/admin accounts
  }
  if (!item || item.status === "unclaimed") {
    return null; // Only claimed items count
  }

  const artwork = await database
    .collection<{ _id: string; rarity: ArtworkRarity; title: string; artist: string }>("artworks")
    .findOne({ _id: item.artwork_id });
  const rarity = artwork?.rarity;

  const existingRecords = await database
    .collection<HallOfFameRecord>("hall_of_fame")
    .find()
    .toArray();
  const claimedQualifierIds = new Set(
    existingRecords.map((rec) => rec.qualifier_id).filter(Boolean),
  );

  for (const qualifier of registeredQualifiers.values()) {
    if (claimedQualifierIds.has(qualifier.id)) continue;

    if (itemMatchesQualifierQuery(item, rarity, qualifier.query)) {
      const record: HallOfFameRecord = {
        _id: randomUUID(),
        item_id: item._id,
        item_snapshot: {
          ...item,
          artwork_title: artwork?.title,
          artist_name: artwork?.artist,
        },
        title: qualifier.title,
        description: qualifier.description,
        created_at: new Date().toISOString(),
        qualifier_id: qualifier.id,
        player_id: player._id,
        player_screen_name: player.screen_name,
      };

      await database.collection<HallOfFameRecord>("hall_of_fame").insertOne(record);

      await createPlayerNotification(database, player._id, {
        kind: "success",
        message: `🏆 Your item '${artwork?.title || "Artwork"}' has been inducted into the Hall of Fame! Title: '${qualifier.title}'`,
      });

      return record;
    }
  }

  return null;
}

export async function backfillExistingHallOfFameItems(database: Db): Promise<number> {
  const existingRecords = await database
    .collection<HallOfFameRecord>("hall_of_fame")
    .find()
    .toArray();
  const claimedQualifierIds = new Set(
    existingRecords.map((rec) => rec.qualifier_id).filter(Boolean),
  );

  const testPlayers = await database
    .collection<{ _id: string }>("players")
    .find({ test_account: true })
    .toArray();
  const testPlayerIds = new Set(testPlayers.map((p) => p._id));

  const items = await database
    .collection<GameItem>("items")
    .find({
      status: { $in: ["claimed", "displayed", "collector_pending"] },
      owner: { $nin: Array.from(testPlayerIds) },
    })
    .sort({ date_created: 1 })
    .toArray();

  if (items.length === 0) return 0;

  const artworkIds = Array.from(new Set(items.map((i) => i.artwork_id)));
  const artworks = await database
    .collection<{ _id: string; rarity: ArtworkRarity; title: string; artist: string }>("artworks")
    .find({ _id: { $in: artworkIds } })
    .toArray();
  const artworkMap = new Map(artworks.map((a) => [a._id, a]));

  const playerIds = Array.from(new Set(items.map((i) => i.owner)));
  const players = await database
    .collection<{ _id: string; screen_name: string }>("players")
    .find({ _id: { $in: playerIds } })
    .toArray();
  const playerMap = new Map(players.map((p) => [p._id, p]));

  let insertedCount = 0;

  for (const item of items) {
    const artwork = artworkMap.get(item.artwork_id);
    const player = playerMap.get(item.owner);
    if (!player) continue;

    for (const qualifier of registeredQualifiers.values()) {
      if (claimedQualifierIds.has(qualifier.id)) continue;

      if (itemMatchesQualifierQuery(item, artwork?.rarity, qualifier.query)) {
        const record: HallOfFameRecord = {
          _id: randomUUID(),
          item_id: item._id,
          item_snapshot: {
            ...item,
            artwork_title: artwork?.title,
            artist_name: artwork?.artist,
          },
          title: qualifier.title,
          description: qualifier.description,
          created_at: item.date_created || new Date().toISOString(),
          qualifier_id: qualifier.id,
          player_id: player._id,
          player_screen_name: player.screen_name,
        };

        await database.collection<HallOfFameRecord>("hall_of_fame").insertOne(record);
        claimedQualifierIds.add(qualifier.id);
        insertedCount += 1;
      }
    }
  }

  return insertedCount;
}

export async function transferIfHallOfFameItem(
  database: Db,
  itemId: string,
): Promise<boolean> {
  const hofRecord = await database
    .collection<HallOfFameRecord>("hall_of_fame")
    .findOne({ item_id: itemId });

  if (!hofRecord) {
    return false;
  }

  await database.collection<GameItem>("items").updateOne(
    { _id: itemId },
    {
      $set: {
        owner: "artfunkel inc.",
        status: "claimed",
        time_displayed: undefined,
      },
      $unset: {
        display_slot: "",
      },
    },
  );

  return true;
}
