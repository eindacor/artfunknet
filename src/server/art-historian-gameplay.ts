import { randomUUID } from "node:crypto";

import type { Db } from "mongodb";

import {
  getAverageDropValueForLevel,
  getXpChunk,
} from "./collection-gameplay.ts";
import {
  ARTWORK_RARITIES,
  filterActiveArtworks,
  getRarityMap,
  rollWeighted,
  type Artwork,
  type ArtworkRarity,
  type GameItem,
  type LootData,
} from "./gameplay.ts";
import { getDisplayedLegendaryEffect } from "./legendary-attributes.ts";
import type { GalleryNpc } from "./npc-gameplay.ts";

export const ART_HISTORIAN_ATTRIBUTE_ID = "Z7wY5jXkDeckwfFLs";
export const DEFAULT_HISTORIAN_QUEST_LIMIT = 8;
export const DEFAULT_HISTORIAN_TARGET_COUNT = 4;
export const DEFAULT_HISTORIAN_MINIMUM = 3;

const REWARD_MULTIPLIERS: Record<
  ArtworkRarity,
  { money: number; xp: number; item?: { rarity: ArtworkRarity; foil: boolean } }
> = {
  common: { money: 1, xp: 1.2 },
  uncommon: { money: 1.2, xp: 1.4 },
  rare: { money: 1.4, xp: 1.6 },
  legendary: {
    money: 1.6,
    xp: 1.8,
    item: { rarity: "legendary", foil: false },
  },
  masterpiece: {
    money: 1.8,
    xp: 2,
    item: { rarity: "legendary", foil: true },
  },
};

export type ArtHistorianQuestReward = {
  money: number;
  xp: number;
  xp_chunk_percentage: number;
  item?: {
    rarity: ArtworkRarity;
    foil: boolean;
  };
};

export type ArtHistorianQuest = {
  _id: string;
  owner_id: string;
  target: string[];
  reward: ArtHistorianQuestReward;
  rarity: ArtworkRarity;
  min_requirement: number;
  created_at: string;
};

export type ArtHistorianQuestTarget = {
  artwork: Artwork;
  owned: boolean;
  itemId?: string;
  special: boolean;
};

export type ArtHistorianQuestView = ArtHistorianQuest & {
  targets: ArtHistorianQuestTarget[];
  progress: {
    owned: number;
    targetCount: number;
    minimum: number;
    canClaim: boolean;
    fullyComplete: boolean;
  };
};

type HistorianPlayer = {
  _id: string;
  profile: {
    level: number;
    auction_data?: { winning?: string[] };
  };
};

export function calculateHistorianReward({
  averageDropValue,
  playerLevel,
  questRarity,
  xpMultiplier = 1,
  moneyMultiplier = 1,
}: {
  averageDropValue: number;
  playerLevel: number;
  questRarity: ArtworkRarity;
  xpMultiplier?: number;
  moneyMultiplier?: number;
}): ArtHistorianQuestReward {
  const multipliers = REWARD_MULTIPLIERS[questRarity];
  const xpChunkPercentage = multipliers.xp * xpMultiplier;
  return {
    money: Math.floor(
      averageDropValue * 10 * multipliers.money * moneyMultiplier,
    ),
    xp: Math.floor(getXpChunk(playerLevel) * xpChunkPercentage),
    xp_chunk_percentage: Number(xpChunkPercentage.toFixed(3)),
    ...(multipliers.item ? { item: multipliers.item } : {}),
  };
}

export function calculateHistorianClaimXp(
  baseXp: number,
  ownedTargetCount: number,
  minimum: number,
  specialTargetCount: number,
): number {
  const extraTargets = Math.max(0, ownedTargetCount - minimum);
  return (
    baseXp +
    Math.floor(baseXp * extraTargets * 0.4) +
    Math.floor(baseXp * Math.max(0, specialTargetCount) * 0.2)
  );
}

export function isHistorianSpecialItem(
  item: Pick<
    GameItem,
    "foil" | "unlocked" | "seasonal" | "original" | "vintage" | "lottery"
  >,
): boolean {
  return Boolean(
    item.foil ||
      item.unlocked ||
      item.seasonal ||
      item.original ||
      item.vintage ||
      item.lottery,
  );
}

export async function createArtHistorianQuest(
  database: Db,
  player: HistorianPlayer,
  npc: GalleryNpc,
  now: Date,
): Promise<ArtHistorianQuest> {
  const ownGallery = npc.owner_id === player._id;
  const questCount = await database
    .collection<ArtHistorianQuest>("quests")
    .countDocuments({ owner_id: player._id });
  if (questCount >= DEFAULT_HISTORIAN_QUEST_LIMIT) {
    throw new Error(
      "The Art Historian has a new objective, but your quest list is full.",
    );
  }

  const metadata = await database
    .collection<{ _id: string; loot_data: LootData }>("metadata")
    .findOne({ _id: "loot-data" });
  if (!metadata) throw new Error("Loot metadata is not configured.");

  const artworks = filterActiveArtworks(
    await database
      .collection<Artwork>("artworks")
      .find({ active: true })
      .toArray(),
  );
  if (artworks.length < DEFAULT_HISTORIAN_TARGET_COUNT) {
    throw new Error("There are not enough active artworks for a quest.");
  }

  const rarityMap = getRarityMap(player.profile.level, metadata.loot_data);
  const questRarity = rollRarity(rarityMap);
  const targets = selectHistorianTargets(
    artworks,
    rarityMap,
    DEFAULT_HISTORIAN_TARGET_COUNT,
  );

  const minimum = DEFAULT_HISTORIAN_MINIMUM;
  let xpMultiplier = 1;
  let moneyMultiplier = 1;
  if (ownGallery) {
    const [xpBonusEffect, marketBonusEffect] = await Promise.all([
      getDisplayedLegendaryEffect(
        database,
        player._id,
        "QUEST_XP_BONUS",
      ),
      getDisplayedLegendaryEffect(
        database,
        player._id,
        "MARKET_EXPERT_QUEST_BONUS",
      ),
    ]);
    if (xpBonusEffect) xpMultiplier = 1.5;
    if (marketBonusEffect) {
      moneyMultiplier =
        1 + (player.profile.auction_data?.winning?.length ?? 0) * 0.06;
    }
  }

  const averageDropValue = await getAverageDropValueForLevel(
    database,
    player.profile.level,
  );
  const quest: ArtHistorianQuest = {
    _id: randomUUID(),
    owner_id: player._id,
    target: targets,
    reward: calculateHistorianReward({
      averageDropValue,
      playerLevel: player.profile.level,
      questRarity,
      xpMultiplier,
      moneyMultiplier,
    }),
    rarity: questRarity,
    min_requirement: minimum,
    created_at: now.toISOString(),
  };
  await database.collection<ArtHistorianQuest>("quests").insertOne(quest);
  return quest;
}

export async function getArtHistorianQuestViews(
  database: Db,
  playerId: string,
): Promise<ArtHistorianQuestView[]> {
  const quests = await database
    .collection<ArtHistorianQuest>("quests")
    .find({ owner_id: playerId })
    .sort({ created_at: -1 })
    .toArray();
  if (quests.length === 0) return [];

  const artworkIds = [...new Set(quests.flatMap((quest) => quest.target))];
  const [artworks, ownedItems] = await Promise.all([
    database
      .collection<Artwork>("artworks")
      .find({ _id: { $in: artworkIds } })
      .toArray(),
    database
      .collection<GameItem>("items")
      .find({
        owner: playerId,
        status: { $in: ["claimed", "displayed"] },
        artwork_id: { $in: artworkIds },
      })
      .toArray(),
  ]);
  const artworkMap = new Map(artworks.map((artwork) => [artwork._id, artwork]));

  return quests.map((quest) => {
    const targets = quest.target.flatMap((artworkId) => {
      const artwork = artworkMap.get(artworkId);
      if (!artwork) return [];
      const item = selectPreferredQuestItem(
        ownedItems.filter((candidate) => candidate.artwork_id === artworkId),
      );
      return [
        {
          artwork,
          owned: Boolean(item),
          ...(item ? { itemId: item._id } : {}),
          special: item ? isHistorianSpecialItem(item) : false,
        },
      ];
    });
    const owned = targets.filter((target) => target.owned).length;
    return {
      ...quest,
      targets,
      progress: {
        owned,
        targetCount: quest.target.length,
        minimum: quest.min_requirement,
        canClaim: owned >= quest.min_requirement,
        fullyComplete: owned >= quest.target.length,
      },
    };
  });
}

export function selectPreferredQuestItem(
  items: readonly GameItem[],
): GameItem | undefined {
  return [...items].sort((left, right) => {
    const leftSpecial = isHistorianSpecialItem(left) ? 1 : 0;
    const rightSpecial = isHistorianSpecialItem(right) ? 1 : 0;
    if (leftSpecial !== rightSpecial) return rightSpecial - leftSpecial;
    if (left.authenticity.identified !== right.authenticity.identified) {
      return Number(right.authenticity.identified) -
        Number(left.authenticity.identified);
    }
    if (left.authenticity.forgery !== right.authenticity.forgery) {
      return Number(left.authenticity.forgery) -
        Number(right.authenticity.forgery);
    }
    return right.values.actual - left.values.actual;
  })[0];
}

function selectHistorianTargets(
  artworks: readonly Artwork[],
  rarityMap: Record<ArtworkRarity, number>,
  count: number,
): string[] {
  const available = [...artworks];
  const selected: string[] = [];
  while (selected.length < count && available.length > 0) {
    const rolledRarity = rollRarity(rarityMap);
    const targetRarity =
      rolledRarity === "legendary" || rolledRarity === "masterpiece"
        ? "rare"
        : rolledRarity;
    const matching = available.filter(
      (artwork) => artwork.rarity === targetRarity,
    );
    const pool = matching.length > 0 ? matching : available;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    selected.push(chosen._id);
    available.splice(
      available.findIndex((artwork) => artwork._id === chosen._id),
      1,
    );
  }
  return selected;
}

function rollRarity(
  rarityMap: Record<ArtworkRarity, number>,
): ArtworkRarity {
  return rollWeighted(
    ARTWORK_RARITIES.map((rarity) => ({
      value: rarity,
      weight: rarityMap[rarity],
    })),
  );
}
