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
import { getDisplayedLegendaryEffect, getLegendaryNumberParameter } from "./legendary-attributes.ts";
import type { GalleryNpc } from "./npc-gameplay.ts";
import type { Auction } from "./auction-gameplay.ts";

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
  fulfilled_targets?: ArtHistorianFulfilledTarget[];
  reward: ArtHistorianQuestReward;
  rarity: ArtworkRarity;
  min_requirement: number;
  created_at: string;
};

export type ArtHistorianFulfilledTarget = {
  artwork_id: string;
  item_id: string;
  item_snapshot: GameItem;
  fulfilled_at: string;
  special: boolean;
};

export type ArtHistorianQuestTarget = {
  artwork: Artwork;
  owned: boolean;
  fulfilled: boolean;
  itemId?: string;
  special: boolean;
};

export type ArtHistorianQuestView = ArtHistorianQuest & {
  targets: ArtHistorianQuestTarget[];
  progress: {
    fulfilled: number;
    targetCount: number;
    minimum: number;
    canClaim: boolean;
    fullyComplete: boolean;
  };
};

export function getUnfulfilledHistorianTargetIds(
  quest: {
    target: readonly string[];
    fulfilled_targets?: readonly Pick<
      ArtHistorianFulfilledTarget,
      "artwork_id"
    >[];
  },
): string[] {
  const fulfilledArtworkIds = new Set(
    (quest.fulfilled_targets ?? []).map((target) => target.artwork_id),
  );
  return quest.target.filter(
    (artworkId) => !fulfilledArtworkIds.has(artworkId),
  );
}

type HistorianPlayer = {
  _id: string;
  profile: {
    level: number;
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
  const xpChunkPercentage = Number(
    (multipliers.xp * xpMultiplier * 0.5).toFixed(3),
  );
  return {
    money: Math.floor(
      averageDropValue * 2 * multipliers.money * moneyMultiplier,
    ),
    xp: Math.floor(getXpChunk(playerLevel) * xpChunkPercentage),
    xp_chunk_percentage: xpChunkPercentage,
    ...(multipliers.item ? { item: multipliers.item } : {}),
  };
}

export function calculateMarketExpertMoneyMultiplier(
  winningAuctionCount: number,
  multiplierPerWinningAuction = 0.1,
): number {
  return 1 + Math.max(0, winningAuctionCount) * multiplierPerWinningAuction;
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
  let xpMultiplier = 2.;
  let moneyMultiplier = 4.;
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
    if (xpBonusEffect) xpMultiplier *= 1.5;

    if (marketBonusEffect) {
      const multiplierPerWinningAuction = getLegendaryNumberParameter(
        marketBonusEffect,
        "multiplier_per_winning_auction",
        0.1,
      );
      const activeWinningAuctions = await database
        .collection<Auction>("auctions")
        .countDocuments({
          current_winner_id: player._id,
          expiration: { $gt: now.toISOString() },
          settlement_status: { $ne: "settling" },
        });
      moneyMultiplier *= calculateMarketExpertMoneyMultiplier(
        activeWinningAuctions,
        multiplierPerWinningAuction,
      );
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
    const fulfilledTargetMap = new Map(
      (quest.fulfilled_targets ?? []).map((target) => [
        target.artwork_id,
        target,
      ]),
    );
    const targets = quest.target.flatMap((artworkId) => {
      const artwork = artworkMap.get(artworkId);
      if (!artwork) return [];
      const fulfilledTarget = fulfilledTargetMap.get(artworkId);
      const item = selectPreferredQuestItem(
        ownedItems.filter((candidate) => candidate.artwork_id === artworkId),
      );
      return [
        {
          artwork,
          owned: Boolean(item),
          fulfilled: Boolean(fulfilledTarget),
          ...(item ? { itemId: item._id } : {}),
          special:
            fulfilledTarget?.special ??
            (item ? isHistorianSpecialItem(item) : false),
        },
      ];
    });
    const fulfilled = targets.filter((target) => target.fulfilled).length;
    return {
      ...quest,
      targets,
      progress: {
        fulfilled,
        targetCount: quest.target.length,
        minimum: quest.min_requirement,
        canClaim: fulfilled >= quest.min_requirement,
        fullyComplete: fulfilled >= quest.target.length,
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
