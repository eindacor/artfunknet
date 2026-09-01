import type { Db } from "mongodb";

import {
  ARTWORK_RARITIES,
  getRarityMap,
  type ArtworkRarity,
  type GameItem,
} from "./gameplay.ts";
import type { GameplayConfig } from "./game-settings.ts";
import {
  hydrateGameItems,
  type HydratedGameItem,
} from "./item-artwork.ts";

const HOUR_MS = 60 * 60 * 1000;
const MAX_PLAYER_LEVEL = 50;

type PlayerProfile = {
  active: boolean;
  bank_balance: number;
  level: number;
  xp: number;
  lottery_tickets: number;
  inventory_cap: number;
  display_cap: number;
  auction_cap: number;
  ticket_cap: number;
  pc_cap: number;
  visitor_cap: number;
  repairing_cap: number;
  forgery_contract_cap: number;
  last_activity: string;
  last_gallery_payout?: string;
  gallery_money_remainder?: number;
  gallery_xp_remainder?: number;
};

type PlayerRecord = {
  _id: string;
  active: boolean;
  profile: PlayerProfile;
};

type LootData = {
  rarity_values: Record<ArtworkRarity, { min: number; max: number }>;
  basic_crate_cost: number;
  items_per_basic_crate: number;
  crate_expense_per_masterpiece: number;
  global_foil_chance: number;
  global_unlocked_chance: number;
};

type ArtworkValue = {
  rarity: ArtworkRarity;
  value_scale: number;
};

export type GalleryRates = {
  value: number;
  moneyPerHour: number;
  xpPerHour: number;
};

export function getXpGoal(level: number): number {
  return level === MAX_PLAYER_LEVEL
    ? 10_000_000
    : Math.floor(100 * Math.pow(1.3, level));
}

export function getXpChunk(level: number): number {
  return Math.floor(
    Math.pow(0.9, level === MAX_PLAYER_LEVEL ? 35 : level) *
      getXpGoal(level),
  );
}

export function applyXp(
  level: number,
  xp: number,
  amount: number,
): { level: number; xp: number; lotteryTickets: number } {
  let currentLevel = level;
  let currentXp = xp;
  let remaining = Math.max(0, Math.floor(amount));
  let lotteryTickets = 0;

  while (remaining > 0) {
    const goal = getXpGoal(currentLevel);
    const required = goal - currentXp;
    if (remaining < required) {
      currentXp += remaining;
      remaining = 0;
    } else {
      remaining -= required;
      currentXp = 0;
      if (currentLevel < MAX_PLAYER_LEVEL) {
        currentLevel += 1;
      } else {
        lotteryTickets += 1;
      }
    }
  }

  return { level: currentLevel, xp: currentXp, lotteryTickets };
}

export function getCapsForLevel(level: number) {
  const cap = (start: number, end: number) =>
    Math.floor(start + (end - start) * (level / MAX_PLAYER_LEVEL));

  return {
    inventory_cap: cap(15, 64),
    display_cap: cap(5, 10),
    auction_cap: cap(8, 16),
    ticket_cap: cap(3, 10),
    pc_cap: 12,
    visitor_cap: cap(20, 200),
    repairing_cap: cap(4, 12),
    forgery_contract_cap: cap(8, 16),
  };
}

export async function calculateGalleryRates(
  database: Db,
  playerLevel: number,
  items: HydratedGameItem[],
  at: Date,
  config: GameplayConfig,
): Promise<GalleryRates> {
  const metadata = await database
    .collection<{ _id: string; loot_data: LootData }>("metadata")
    .findOne({ _id: "loot-data" });
  if (!metadata) throw new Error("Loot metadata has not been seeded.");

  const artworks = await database
    .collection<ArtworkValue>("artworks")
    .find({ active: true })
    .project<ArtworkValue>({ rarity: 1, value_scale: 1 })
    .toArray();
  const averageDrop = getAverageDropValue(
    playerLevel,
    metadata.loot_data,
    artworks,
  );

  return items.reduce<GalleryRates>(
    (totals, item) => {
      totals.value += item.values.actual;
      totals.moneyPerHour += getDisplayMoneyPerHour(
        item,
        averageDrop,
        at,
        config,
      );
      totals.xpPerHour += getDisplayXpPerHour(
        item,
        playerLevel,
        at,
        config,
      );
      return totals;
    },
    { value: 0, moneyPerHour: 0, xpPerHour: 0 },
  );
}

export async function settleGalleryEarnings(
  database: Db,
  playerId: string,
  config: GameplayConfig,
  now = new Date(),
): Promise<{ money: number; xp: number; intervals: number }> {
  const players = database.collection<PlayerRecord>("players");
  const player = await players.findOne({ _id: playerId, active: true });
  if (!player) return { money: 0, xp: 0, intervals: 0 };

  const previousPayout =
    player.profile.last_gallery_payout ?? player.profile.last_activity;
  const previousTime = new Date(previousPayout).getTime();
  const intervalMs = config.galleryPayoutIntervalMinutes * 60 * 1000;
  const elapsedIntervals = Math.floor(
    (now.getTime() - previousTime) / intervalMs,
  );
  if (elapsedIntervals <= 0) return { money: 0, xp: 0, intervals: 0 };

  const displayedItems = await database
    .collection<GameItem>("items")
    .find({ owner: playerId, status: "displayed" })
    .toArray();
  const displayed = await hydrateGameItems(database, displayedItems);
  let level = player.profile.level;
  let xp = player.profile.xp;
  let lotteryTickets = 0;
  let moneyAccrued = player.profile.gallery_money_remainder ?? 0;
  let xpAccrued = player.profile.gallery_xp_remainder ?? 0;
  let xpEarned = 0;

  const intervalHourRatio = intervalMs / HOUR_MS;
  for (let interval = 1; interval <= elapsedIntervals; interval += 1) {
    const tick = new Date(previousTime + interval * intervalMs);
    const rates = await calculateGalleryRates(
      database,
      level,
      displayed,
      tick,
      config,
    );
    moneyAccrued += rates.moneyPerHour * intervalHourRatio;
    xpAccrued += rates.xpPerHour * intervalHourRatio;
    const awardedXp = Math.floor(xpAccrued);
    xpAccrued -= awardedXp;
    xpEarned += awardedXp;
    const progress = applyXp(level, xp, awardedXp);
    level = progress.level;
    xp = progress.xp;
    lotteryTickets += progress.lotteryTickets;
  }

  const payoutTime = new Date(
    previousTime + elapsedIntervals * intervalMs,
  ).toISOString();
  const money = Math.floor(moneyAccrued);
  moneyAccrued -= money;
  const caps = getCapsForLevel(level);
  const result = await players.updateOne(
    {
      _id: playerId,
      $or: [
        { "profile.last_gallery_payout": previousPayout },
        {
          "profile.last_gallery_payout": { $exists: false },
          "profile.last_activity": previousPayout,
        },
      ],
    },
    {
      $set: {
        "profile.last_gallery_payout": payoutTime,
        "profile.level": level,
        "profile.xp": xp,
        "profile.gallery_money_remainder": moneyAccrued,
        "profile.gallery_xp_remainder": xpAccrued,
        ...Object.fromEntries(
          Object.entries(caps).map(([key, value]) => [`profile.${key}`, value]),
        ),
      },
      $inc: {
        "profile.bank_balance": money,
        "profile.lottery_tickets": lotteryTickets,
      },
    },
  );

  if (result.modifiedCount !== 1) {
    return { money: 0, xp: 0, intervals: 0 };
  }

  const conditionDecayChance =
    1 -
    Math.pow(
      0.8,
      config.galleryPayoutIntervalMinutes /
        config.conditionDecayIntervalMinutes,
    );
  for (const item of displayed) {
    let condition = item.condition;
    for (let interval = 0; interval < elapsedIntervals; interval += 1) {
      if (condition >= 0.5 && Math.random() < conditionDecayChance) {
        condition = Number((condition - 0.01).toFixed(2));
      }
    }
    if (condition !== item.condition) {
      await database
        .collection<GameItem>("items")
        .updateOne({ _id: item._id, status: "displayed" }, { $set: { condition } });
    }
  }

  return { money, xp: xpEarned, intervals: elapsedIntervals };
}

function getAverageDropValue(
  playerLevel: number,
  lootData: LootData,
  artworks: ArtworkValue[],
): number {
  const averages = {} as Record<ArtworkRarity, number>;
  for (const rarity of ARTWORK_RARITIES) {
    const matching = artworks.filter((artwork) => artwork.rarity === rarity);
    averages[rarity] =
      matching.length === 0
        ? 0
        : matching.reduce((sum, artwork) => {
            const values = lootData.rarity_values[rarity];
            const mint =
              values.min + artwork.value_scale * (values.max - values.min);
            return sum + Math.floor(mint * 0.7);
          }, 0) / matching.length;
  }

  const rarityMap = getRarityMap(playerLevel, lootData);
  let average = ARTWORK_RARITIES.reduce(
    (sum, rarity) => sum + averages[rarity] * rarityMap[rarity],
    0,
  );
  average =
    average * (1 - lootData.global_foil_chance) +
    average * lootData.global_foil_chance * 5;
  average =
    average * (1 - lootData.global_unlocked_chance) +
    average * lootData.global_unlocked_chance * 1.5;
  return Math.floor(average);
}

function getDisplayLevel(
  item: GameItem,
  at: Date,
  config: GameplayConfig,
): number {
  if (!item.time_displayed) return 0;
  const levels = Math.floor(
    (at.getTime() - new Date(item.time_displayed).getTime()) /
      (config.displayLevelIntervalMinutes * 60 * 1000),
  );
  return Math.min(Math.max(levels, 0), config.displayLevelCap);
}

function getDisplayMoneyPerHour(
  item: HydratedGameItem,
  averageDrop: number,
  at: Date,
  config: GameplayConfig,
): number {
  let value = averageDrop;
  value *= { common: 1, uncommon: 2, rare: 4, legendary: 7, masterpiece: 11 }[
    item.artwork.rarity
  ];
  if (item.foil) value *= 1.2;
  if (item.seasonal) value *= 1.5;
  if (item.lottery) value *= 1 + 0.15 * item.lottery;
  if (item.original) value *= 2;
  if (item.vintage) value *= 1.5;
  value = Math.floor(
    value + value * item.condition * item.artwork.value_scale,
  );
  const base = Math.floor(value * 0.015);
  return Math.floor(
    base * Math.pow(1.07, getDisplayLevel(item, at, config)),
  );
}

function getDisplayXpPerHour(
  item: GameItem,
  playerLevel: number,
  at: Date,
  config: GameplayConfig,
): number {
  const percentage = 0.02 + (item.level / 10) * 0.1;
  return Math.floor(
    percentage *
      Math.pow(1.05, getDisplayLevel(item, at, config)) *
      getXpChunk(playerLevel),
  );
}
