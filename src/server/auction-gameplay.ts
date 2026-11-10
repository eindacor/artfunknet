import { randomUUID } from "node:crypto";

import { MongoServerError, type Db, type Filter, type Sort } from "mongodb";
import { getItemDropChanceUpdate } from "./item-drop-chance.ts";

import {
  getUnfulfilledHistorianTargetIds,
  type ArtHistorianQuest,
} from "./art-historian-gameplay.ts";
import { getItemKarmaValue } from "./art-expert-gameplay.ts";
import { getAuctionSettlementDisposition } from "./auction-settlement.ts";
import { getAuctionBidRestriction } from "./auction-bid-permissions.ts";
import { deleteCommunityReactions } from "./community-reaction-cleanup.ts";
import { recordEconomyMetricsSafely } from "./economy-metrics.ts";
import {
  getPublicAuctionReplenishmentCount,
  PUBLIC_AUCTION_DURATION_MINUTES,
} from "./auction-population.ts";
import {
  applyXp,
  getCapsForLevel,
  getXpChunk,
} from "./collection-gameplay.ts";
import {
  getGameplayGenerationMap,
  getGameplaySettings,
} from "./game-settings.ts";
import {
  calculateItemValues,
  generateDailyDrop,
  type Artwork,
  type ArtworkRarity,
  type GameItem,
  type LootData,
} from "./gameplay.ts";
import {
  checkItemForHallOfFameStatus,
  transferIfHallOfFameItem,
} from "./hall-of-fame.ts";
import { hydrateGameItems, type HydratedGameItem } from "./item-artwork.ts";
import {
  getDisplayedLegendaryEffect,
  getLegendaryNumberParameter,
} from "./legendary-attributes.ts";
import { getDisplayedArtworkEffect } from "./artwork-effects.ts";
import {
  getAuctionForgeryRefund,
  MASTERPIECE_EFFECT_CODES,
} from "./masterpiece-effects.ts";
import { createPlayerNotification } from "./player-notifications.ts";
import { sanitizePlayerFacingAuthenticity } from "./forgery-gameplay.ts";
import {
  AUCTION_PROPERTY_KEYS,
  type AuctionPropertyKey,
  type ItemFilterMode,
} from "./player-view-settings.ts";
import {
  getArchiveRecordArtStyles,
  getArchiveRecordModifiers,
  type PlayerArtworkArchive,
} from "./archive-gameplay.ts";
import { getPlayerFacingArchivePermission } from "./item-permissions.ts";
import {
  LIVE_AUCTION_STATE_ID,
  type LiveAuctionState,
} from "./live-auction-event.ts";

export const PUBLIC_AUCTION_DURATIONS = [60, 360, 720, 1440] as const;
export const PRIVATE_AUCTION_DURATION_MINUTES = 10;
export const PRIVATE_AUCTION_PREVIEW_MINUTES = 5;
export const AUCTIONEER_BASE_PRIVATE_LOTS = 4;
export const AUCTION_HOUSE_OWNER_ID = "system:auction-house";
export const DEFAULT_AUCTIONEER_COMMISSION_COEFFICIENT = 0.1;
const AUCTION_REPLENISHMENT_LEASE_MS = 2 * 60 * 1000;
const AUCTION_HOUSE_STATE_ID = "auction-house-state";

export type AuctionCommission = {
  player_id: string;
  coefficient: number;
};

export type Auction = {
  _id: string;
  item_id: string;
  seller_id: string | null;
  seller_name: string;
  viewer: "public" | string;
  starting_bid: number;
  current_bid: number;
  minimum_bid: number;
  increment: number;
  buy_now: number | null;
  commission?: AuctionCommission | null;
  transferable?: boolean;
  current_winner_id: string | null;
  current_winner_name: string | null;
  bidder_ids?: string[];
  has_bid: boolean;
  date_posted: string;
  expiration: string;
  last_bot_roll?: string;
  settlement_status?: "active" | "settling";
  item_snapshot: {
    artwork_id: string;
    title: string;
    artist: string;
    rarity: ArtworkRarity;
    rarity_value: number;
    medium: string;
    date: number;
    condition: number;
    level: number;
    roll_count: number;
    drop_chance_coefficient?: number;
    card_renderer?: string;
    mint?: boolean;
    foil: boolean;
    unlocked?: boolean;
    seasonal: boolean;
    lottery: number;
    original: boolean;
    vintage?: boolean;
    attribute_ids?: string[];
    special_attribute_ids?: string[];
    attribute_options?: AuctionAttributeOption[];
  };
};

export type AuctionAttributeOption = {
  id: string;
  label: string;
  special: boolean;
};

export type AuctionFilterOptions = {
  artStyleIds: string[];
  attributes: Array<Pick<AuctionAttributeOption, "id" | "label">>;
  specialAttributes: Array<Pick<AuctionAttributeOption, "id" | "label">>;
};

export type AuctionView = Auction & {
  item: HydratedGameItem;
  owned: boolean;
  questTarget: boolean;
  currentlyWinning: boolean;
  privateAuction: boolean;
};

export function hasActiveMarketExpertAccess(
  expiration: string | undefined,
  now = new Date(),
): boolean {
  return new Date(expiration ?? 0).getTime() > now.getTime();
}

export function getAuctionAccessFilter(
  playerId: string,
  marketExpert: boolean,
  now = new Date(),
): Filter<Auction> {
  const sharedBefore = new Date(
    now.getTime() - PRIVATE_AUCTION_PREVIEW_MINUTES * 60_000,
  ).toISOString();
  return {
    $or: [
      { viewer: "public" },
      { viewer: playerId },
      {
        $and: [
          { date_posted: { $lte: sharedBefore } },
          {
            $or: [
              ...(marketExpert ? [{ viewer: { $ne: "public" } }] : []),
              { bidder_ids: playerId },
              { current_winner_id: playerId },
            ],
          },
        ],
      },
    ],
  };
}

export function canPlayerAccessAuction(
  auction: Pick<
    Auction,
    "viewer" | "bidder_ids" | "current_winner_id" | "date_posted"
  >,
  playerId: string,
  marketExpert: boolean,
  now = new Date(),
): boolean {
  if (auction.viewer === "public" || auction.viewer === playerId) return true;
  const postedAt = new Date(auction.date_posted).getTime();
  if (
    !Number.isFinite(postedAt) ||
    postedAt + PRIVATE_AUCTION_PREVIEW_MINUTES * 60_000 > now.getTime()
  ) {
    return false;
  }
  return (
    marketExpert ||
    auction.current_winner_id === playerId ||
    auction.bidder_ids?.includes(playerId) === true
  );
}

export async function getInitialPrivateAuctionBidContribution(
  database: Db,
  playerId: string,
  auction: Pick<Auction, "viewer" | "bidder_ids" | "current_winner_id">,
  bidAmount: number,
): Promise<number> {
  if (
    auction.viewer === "public" ||
    auction.current_winner_id === playerId ||
    auction.bidder_ids?.includes(playerId)
  ) {
    return 0;
  }
  const effect = await getDisplayedLegendaryEffect(
    database,
    playerId,
    "PRIVATE_AUCTION_PRICE_REDUCTION",
  );
  if (!effect) return 0;

  const coefficient = Math.min(
    Math.max(
      getLegendaryNumberParameter(
        effect,
        "contribution_coefficient",
        0.375,
      ),
      0,
    ),
    1,
  );
  return Math.floor(Math.max(0, bidAmount) * coefficient);
}

type AuctionPlayer = {
  _id: string;
  screen_name: string;
  active: boolean;
  test_account?: boolean;
  profile: {
    bank_balance: number;
    level: number;
    auction_cap: number;
    inventory_cap: number;
    expansion_slots?: number;
    market_expert?: { expiration?: string };
    last_activity?: string;
  };
};

type AuctionHouseState = {
  _id: typeof AUCTION_HOUSE_STATE_ID;
  replenishment_lock_until?: string;
  last_replenished?: string;
};

type AuctionDismissalPlayer = {
  _id: string;
  profile?: {
    dismissed_private_auction_ids?: string[];
  };
};

export async function getPlayerAuctionEscrow(
  database: Db,
  playerId: string,
  now = new Date(),
): Promise<number> {
  const [auctionResults, liveAuction] = await Promise.all([
    database
      .collection<Auction>("auctions")
      .aggregate<{ _id: null; total: number }>([
        {
          $match: {
            current_winner_id: playerId,
            expiration: { $gt: now.toISOString() },
            settlement_status: { $ne: "settling" },
          },
        },
        { $group: { _id: null, total: { $sum: "$current_bid" } } },
      ])
      .toArray(),
    database.collection<LiveAuctionState>("metadata").findOne(
      {
        _id: LIVE_AUCTION_STATE_ID,
        live: true,
        current_item_id: { $ne: null },
        winner_id: playerId,
      },
      { projection: { current_bid: 1 } },
    ),
  ]);

  return (auctionResults[0]?.total ?? 0) + (liveAuction?.current_bid ?? 0);
}

export async function createAuction(
  database: Db,
  item: HydratedGameItem,
  {
    sellerId,
    sellerName,
    viewer = "public",
    startingBid,
    buyNow,
    commission = null,
    transferable = false,
    durationMinutes,
    now = new Date(),
  }: {
    sellerId: string | null;
    sellerName: string;
    viewer?: "public" | string;
    startingBid: number;
    buyNow: number | null;
    commission?: AuctionCommission | null;
    transferable?: boolean;
    durationMinutes: number;
    now?: Date;
  },
): Promise<Auction> {
  if (
    item.authenticity.forgery &&
    (sellerId === null || sellerId.startsWith("system:") || sellerId.startsWith("bot:"))
  ) {
    throw new Error("System auctions cannot sell forgeries.");
  }
  const increment = Math.max(1, Math.floor(item.values.actual * 0.02));
  const auction: Auction = {
    _id: randomUUID(),
    item_id: item._id,
    seller_id: sellerId,
    seller_name: sellerName,
    viewer,
    starting_bid: startingBid,
    current_bid: startingBid,
    minimum_bid: startingBid,
    increment,
    buy_now: buyNow,
    commission,
    ...(transferable ? { transferable: true } : {}),
    current_winner_id: null,
    current_winner_name: null,
    bidder_ids: [],
    has_bid: false,
    date_posted: now.toISOString(),
    expiration: new Date(
      now.getTime() + durationMinutes * 60 * 1000,
    ).toISOString(),
    settlement_status: "active",
    item_snapshot: {
      artwork_id: item.artwork_id,
      title: item.artwork.title,
      artist: item.artwork.artist,
      rarity: item.artwork.rarity,
      rarity_value: [
        "common",
        "uncommon",
        "rare",
        "legendary",
        "masterpiece",
      ].indexOf(item.artwork.rarity),
      medium: item.artwork.medium,
      date: item.artwork.date,
      condition: item.condition,
      level: item.level,
      roll_count: item.roll_count,
      ...(typeof item.drop_chance_coefficient === "number" &&
      Number.isFinite(item.drop_chance_coefficient)
        ? { drop_chance_coefficient: item.drop_chance_coefficient }
        : {}),
      card_renderer: item.card_renderer ?? "museum",
      mint: item.mint,
      foil: item.foil,
      unlocked: item.unlocked,
      seasonal: item.seasonal,
      lottery: item.lottery,
      original: item.original,
      vintage: item.vintage,
      ...getAuctionAttributeSnapshot(item),
    },
  };
  await database.collection<Auction>("auctions").insertOne(auction);
  return auction;
}

export function getAuctionCommissionAmount(
  auction: Pick<Auction, "commission" | "current_bid"> &
    Partial<Pick<Auction, "current_winner_id">>,
): number {
  if (!auction.commission) return 0;
  if (auction.current_winner_id === auction.commission.player_id) return 0;
  const coefficient = Number.isFinite(auction.commission.coefficient)
    ? Math.min(Math.max(auction.commission.coefficient, 0), 1)
    : 0;
  return Math.floor(Math.max(0, auction.current_bid) * coefficient);
}

export async function createCollectorResaleAuction(
  database: Db,
  item: HydratedGameItem,
  {
    playerId,
    collectorReward,
    commissionCoefficient,
    now = new Date(),
  }: {
    playerId: string;
    collectorReward: number;
    commissionCoefficient: number;
    now?: Date;
  },
): Promise<Auction> {
  if (item.authenticity.forgery) {
    throw new Error("Collectors cannot consign forgeries to system auctions.");
  }
  const transferred = await database.collection<GameItem>("items").updateOne(
    {
      _id: item._id,
      owner: playerId,
      status: "collector_pending",
    },
    {
      $set: {
        owner: AUCTION_HOUSE_OWNER_ID,
        status: "auctioned",
        tags: [],
        date_received: now.toISOString(),
      },
      $push: {
        transaction_history: {
          type: "transfer",
          from_owner: playerId,
          to_owner: AUCTION_HOUSE_OWNER_ID,
          occurred_at: now.toISOString(),
          source: "art collector auction",
          amount: collectorReward,
        },
      },
    },
  );
  if (transferred.modifiedCount !== 1) {
    throw new Error("The Collector artwork could not enter public auction.");
  }

  try {
    return await createAuction(database, item, {
      sellerId: null,
      sellerName: "Auction House",
      startingBid: Math.max(1, item.values.auction_min),
      buyNow: null,
      commission: {
        player_id: playerId,
        coefficient: Math.min(Math.max(commissionCoefficient, 0), 1),
      },
      durationMinutes: PUBLIC_AUCTION_DURATION_MINUTES,
      now,
    });
  } catch (error) {
    await database.collection<GameItem>("items").updateOne(
      {
        _id: item._id,
        owner: AUCTION_HOUSE_OWNER_ID,
        status: "auctioned",
      },
      {
        $set: {
          owner: playerId,
          status: "collector_pending",
          tags: item.tags,
          date_received: item.date_received,
        },
        $pop: { transaction_history: 1 },
      },
    );
    throw error;
  }
}

export async function rollbackCollectorResaleAuction(
  database: Db,
  auction: Pick<Auction, "_id" | "item_id">,
  item: HydratedGameItem,
  playerId: string,
): Promise<void> {
  const removed = await database.collection<Auction>("auctions").deleteOne({
    _id: auction._id,
    item_id: auction.item_id,
  });
  if (removed.deletedCount !== 1) {
    throw new Error("The Collector resale auction could not be rolled back.");
  }
  const restored = await database.collection<GameItem>("items").updateOne(
    {
      _id: item._id,
      owner: AUCTION_HOUSE_OWNER_ID,
      status: "auctioned",
    },
    {
      $set: {
        owner: playerId,
        status: "collector_pending",
        tags: item.tags,
        date_received: item.date_received,
      },
      $pop: { transaction_history: 1 },
    },
  );
  if (restored.modifiedCount !== 1) {
    throw new Error("The Collector resale item could not be rolled back.");
  }
}

export async function makePrivateAuctionsPublic(
  database: Db,
  playerId: string,
  auctionIds: readonly string[],
  commissionCoefficient: number,
  now = new Date(),
): Promise<string[]> {
  if (auctionIds.length === 0) return [];
  const uniqueAuctionIds = [...new Set(auctionIds)];
  const eligible = await database
    .collection<Auction>("auctions")
    .find({
      _id: { $in: uniqueAuctionIds },
      viewer: playerId,
      transferable: true,
      expiration: { $gt: now.toISOString() },
      settlement_status: { $ne: "settling" },
    })
    .project<Pick<Auction, "_id">>({ _id: 1 })
    .toArray();
  if (eligible.length === 0) return [];

  const eligibleIds = eligible.map((auction) => auction._id);
  await database.collection<Auction>("auctions").updateMany(
    {
      _id: { $in: eligibleIds },
      viewer: playerId,
      transferable: true,
      expiration: { $gt: now.toISOString() },
      settlement_status: { $ne: "settling" },
    },
    {
      $set: {
        viewer: "public",
        commission: {
          player_id: playerId,
          coefficient: Math.min(Math.max(commissionCoefficient, 0), 1),
        },
      },
    },
  );
  const converted = await database
    .collection<Auction>("auctions")
    .find({
      _id: { $in: eligibleIds },
      viewer: "public",
      "commission.player_id": playerId,
    })
    .project<Pick<Auction, "_id">>({ _id: 1 })
    .toArray();
  const convertedIds = converted.map((auction) => auction._id);
  if (convertedIds.length > 0) {
    await database.collection<AuctionDismissalPlayer>("players").updateOne(
      { _id: playerId },
      {
        $pull: {
          "profile.dismissed_private_auction_ids": {
            $in: convertedIds,
          },
        },
      },
    );
  }
  return convertedIds;
}

export type AuctionXpRewardResult = {
  xpGranted: number;
  bonusMoneyGranted: number;
  leveledUp: boolean;
};

export async function grantAuctionXpReward(
  database: Db,
  player: { _id: string; profile: { level: number; xp: number } },
  marketExpert: boolean,
): Promise<AuctionXpRewardResult | null> {
  if (!marketExpert) return null;

  const xpForAuctionsEffect = await getDisplayedLegendaryEffect(
    database,
    player._id,
    "XP_FOR_AUCTIONS",
  );
  if (!xpForAuctionsEffect) return null;

  const moneyForXpEffect = await getDisplayedLegendaryEffect(
    database,
    player._id,
    "MONEY_FOR_XP",
  );

  const xpChunkPercentage = getLegendaryNumberParameter(
    xpForAuctionsEffect,
    "xp_chunk_percentage",
    0.5,
  );
  const xpAmount = Math.floor(
    getXpChunk(player.profile.level) * xpChunkPercentage,
  );
  if (xpAmount <= 0) return null;

  const progress = applyXp(
    player.profile.level,
    player.profile.xp,
    xpAmount,
  );
  const bonusMoney = Math.floor(
    xpAmount *
      getLegendaryNumberParameter(
        moneyForXpEffect,
        "money_per_xp",
        moneyForXpEffect ? 2 : 0,
      ),
  );

  const result = await database.collection<AuctionPlayer>("players").updateOne(
    {
      _id: player._id,
      active: true,
      "profile.level": player.profile.level,
      "profile.xp": player.profile.xp,
    },
    {
      $set: {
        "profile.level": progress.level,
        "profile.xp": progress.xp,
        ...Object.fromEntries(
          Object.entries(getCapsForLevel(progress.level)).map(
            ([key, value]) => [`profile.${key}`, value],
          ),
        ),
      },
      $inc: {
        "profile.lottery_tickets": progress.lotteryTickets,
        "profile.bank_balance": bonusMoney,
      },
    },
  );

  if (result.modifiedCount !== 1) return null;
  await recordEconomyMetricsSafely(database, [
    {
      amount: xpAmount / Math.max(1, getXpChunk(player.profile.level)),
      currency: "xp",
      direction: "earned",
      source: "auction-xp",
    },
    {
      amount: bonusMoney,
      currency: "money",
      direction: "earned",
      source: "auction-xp",
    },
  ]);

  return {
    xpGranted: xpAmount,
    bonusMoneyGranted: bonusMoney,
    leveledUp: progress.level > player.profile.level,
  };
}

export async function settleExpiredAuctions(
  database: Db,
  now = new Date(),
): Promise<void> {
  const expired = await database
    .collection<Auction>("auctions")
    .find({
      expiration: { $lte: now.toISOString() },
      settlement_status: { $ne: "settling" },
    })
    .limit(100)
    .toArray();
  for (const auction of expired) {
    await settleAuction(database, auction);
  }
}

export async function maintainPublicAuctions(
  database: Db,
  now = new Date(),
): Promise<number> {
  await settleExpiredAuctions(database, now);
  const nowIso = now.toISOString();
  const activeAuctionCount = await database
    .collection<Auction>("auctions")
    .countDocuments({
      seller_id: null,
      viewer: "public",
      expiration: { $gt: nowIso },
      settlement_status: { $ne: "settling" },
    });
  const replenishCount = getPublicAuctionReplenishmentCount(activeAuctionCount);
  if (replenishCount === 0) return 0;

  const lockUntil = new Date(
    now.getTime() + AUCTION_REPLENISHMENT_LEASE_MS,
  ).toISOString();
  if (!(await acquireAuctionReplenishmentLease(database, nowIso, lockUntil))) {
    return 0;
  }

  const generatedItemIds: string[] = [];
  const generatedAuctionIds: string[] = [];
  try {
    const settings = await getGameplaySettings(database);
    const generated = await generateDailyDrop(
      database,
      AUCTION_HOUSE_OWNER_ID,
      30,
      {
        now,
        itemCount: replenishCount,
        generationMap: {
          ...getGameplayGenerationMap(settings.active),
          ...(settings.debugEnabled ? { misprint: 0.5 } : {}),
        },
        mintValueMultiplier: settings.active.mintValueMultiplier,
        debug: settings.debugEnabled,
        useRawRarityMap: true,
        source: "generated auction",
        status: "auctioned",
      },
    );
    generatedItemIds.push(...generated.map((item) => item._id));
    const hydrated = await hydrateGameItems(database, generated);
    for (const item of hydrated) {
      const auction = await createAuction(database, item, {
        sellerId: null,
        sellerName: "Auction House",
        startingBid: item.values.auction_min,
        buyNow: null,
        durationMinutes: PUBLIC_AUCTION_DURATION_MINUTES,
        now,
      });
      generatedAuctionIds.push(auction._id);
    }
    await database.collection<AuctionHouseState>("metadata").updateOne(
      {
        _id: AUCTION_HOUSE_STATE_ID,
        replenishment_lock_until: lockUntil,
      },
      {
        $set: { last_replenished: nowIso },
        $unset: { replenishment_lock_until: "" },
      },
    );
    return generatedAuctionIds.length;
  } catch (error) {
    await Promise.all([
      generatedAuctionIds.length
        ? database.collection<Auction>("auctions").deleteMany({
            _id: { $in: generatedAuctionIds },
          })
        : Promise.resolve(),
      generatedItemIds.length
        ? database.collection<GameItem>("items").deleteMany({
            _id: { $in: generatedItemIds },
            owner: AUCTION_HOUSE_OWNER_ID,
            status: "auctioned",
          })
        : Promise.resolve(),
    ]);
    await releaseAuctionReplenishmentLease(database, lockUntil);
    throw error;
  }
}

async function acquireAuctionReplenishmentLease(
  database: Db,
  nowIso: string,
  lockUntil: string,
): Promise<boolean> {
  const states = database.collection<AuctionHouseState>("metadata");
  const existing = await states.findOneAndUpdate(
    {
      _id: AUCTION_HOUSE_STATE_ID,
      $or: [
        { replenishment_lock_until: { $exists: false } },
        { replenishment_lock_until: { $lte: nowIso } },
      ],
    },
    { $set: { replenishment_lock_until: lockUntil } },
    { returnDocument: "after" },
  );
  if (existing) return true;

  try {
    await states.insertOne({
      _id: AUCTION_HOUSE_STATE_ID,
      replenishment_lock_until: lockUntil,
    });
    return true;
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) return false;
    throw error;
  }
}

async function releaseAuctionReplenishmentLease(
  database: Db,
  lockUntil: string,
): Promise<void> {
  await database.collection<AuctionHouseState>("metadata").updateOne(
    {
      _id: AUCTION_HOUSE_STATE_ID,
      replenishment_lock_until: lockUntil,
    },
    { $unset: { replenishment_lock_until: "" } },
  );
}

export async function settleAuction(
  database: Db,
  auction: Auction,
): Promise<boolean> {
  const reserved = await database.collection<Auction>("auctions").updateOne(
    {
      _id: auction._id,
      expiration: auction.expiration,
      current_bid: auction.current_bid,
      current_winner_id: auction.current_winner_id,
      current_winner_name: auction.current_winner_name,
      has_bid: auction.has_bid,
      settlement_status: { $ne: "settling" },
    },
    { $set: { settlement_status: "settling" } },
  );
  if (reserved.modifiedCount !== 1) return false;

  const items = database.collection<GameItem>("items");
  let sellerPaid = false;
  let commissionPaid = 0;
  let winnerStatsTracked = false;
  let itemTransferred = false;
  let winnerKarma = 0;
  try {
    if (
      getAuctionSettlementDisposition({
        currentWinnerId: auction.current_winner_id,
        currentWinnerName: auction.current_winner_name,
        currentBid: auction.current_bid,
        hasBid: auction.has_bid,
        startingBid: auction.starting_bid,
      }) === "unresolved-bid" &&
      auction.seller_id
    ) {
      const recoveredWinner = await recoverAuctionWinner(database, auction);
      if (!recoveredWinner) {
        console.error(
          `Auction ${auction._id} has a recorded bid but no recoverable winner; refusing to return the item as unsold.`,
        );
        await resetSettlement(database, auction._id);
        return false;
      }
      auction.current_winner_id = recoveredWinner._id;
      auction.current_winner_name = recoveredWinner.screen_name;
      await database.collection<Auction>("auctions").updateOne(
        { _id: auction._id, settlement_status: "settling" },
        {
          $set: {
            current_winner_id: recoveredWinner._id,
            current_winner_name: recoveredWinner.screen_name,
          },
        },
      );
    }

    if (!auction.current_winner_id) {
      if (auction.seller_id) {
        const returned = await items.updateOne(
          {
            _id: auction.item_id,
            owner: auction.seller_id,
            status: "auctioned",
          },
          { $set: { status: "claimed" } },
        );
        if (returned.modifiedCount !== 1) {
          await resetSettlement(database, auction._id);
          return false;
        }
      } else {
        const preserved = await transferIfHallOfFameItem(database, {
          _id: auction.item_id,
          owner: AUCTION_HOUSE_OWNER_ID,
          status: "auctioned",
        });
        const removedItem = preserved
          ? { deletedCount: 1 }
          : await items.deleteOne({
              _id: auction.item_id,
              status: "auctioned",
            });
        if (removedItem.deletedCount === 1 && !preserved) {
          await deleteCommunityReactions(database, "item", [auction.item_id]);
        }
      }
      await removeSettledAuctionRecord(database, auction);
      if (auction.seller_id && !auction.has_bid) {
        await safelyNotify(database, auction.seller_id, {
          kind: "info",
          message: `${auction.item_snapshot.title} returned from auction without a sale.`,
        });
      }
      return true;
    }

    const now = new Date().toISOString();
    const auctionItem = await items.findOne({
      _id: auction.item_id,
      status: "auctioned",
    });
    if (!auctionItem) {
      await resetSettlement(database, auction._id);
      return false;
    }
    const [authenticationEffect, auctionKarmaEffect] = await Promise.all([
      getDisplayedArtworkEffect(
        database,
        auction.current_winner_id,
        MASTERPIECE_EFFECT_CODES.auctionAuthentication,
      ),
      getDisplayedLegendaryEffect(
        database,
        auction.current_winner_id,
        "KNOWLEDGE_FOR_AUCTION_WINS",
      ),
    ]);
    winnerKarma = auctionKarmaEffect
      ? getItemKarmaValue(
          auction.item_snapshot.rarity,
          auctionItem.level,
        )
      : 0;
    let conditionRestored = false;
    let conditionUpdate: Partial<Pick<
      GameItem,
      "condition" | "values" | "odds" | "drop_chance_coefficient"
    >> = {};
    try {
      const conditionEffect =
        auctionItem.condition < 1
          ? await getDisplayedLegendaryEffect(
              database,
              auction.current_winner_id,
              "AUCTION_WIN_CONDITION_INCREASE",
            )
          : null;
      const conditionThreshold = Math.min(
        Math.max(
          getLegendaryNumberParameter(
            conditionEffect,
            "condition_threshold",
            0.5,
          ),
          0,
        ),
        1,
      );
      if (conditionEffect && auctionItem.condition < conditionThreshold) {
        const conditionTarget = Math.min(
          Math.max(
            getLegendaryNumberParameter(
              conditionEffect,
              "condition_target",
              0.9,
            ),
            0,
          ),
          1,
        );
        const [artwork, metadata] = await Promise.all([
          database.collection<Artwork>("artworks").findOne({
            _id: auctionItem.artwork_id,
          }),
          database
            .collection<{ _id: string; loot_data: LootData }>("metadata")
            .findOne({ _id: "loot-data" }),
        ]);
        if (!artwork || !metadata) {
          throw new Error(
            "Auction condition restoration data is unavailable.",
          );
        }
        conditionUpdate = {
          condition: conditionTarget,
          ...(await getItemDropChanceUpdate(database, auctionItem, artwork)),
          values: calculateItemValues(
            { ...auctionItem, condition: conditionTarget },
            { ...artwork, ...auctionItem.artwork_overrides },
            metadata.loot_data,
          ),
        };
        conditionRestored = true;
      }
    } catch (error) {
      console.error(
        `Unable to apply auction condition restoration for auction ${auction._id}`,
        error,
      );
      conditionUpdate = {};
      conditionRestored = false;
    }
    if (auction.seller_id) {
      const paid = await database.collection<AuctionPlayer>("players").updateOne(
        { _id: auction.seller_id },
        { $inc: { "profile.bank_balance": auction.current_bid } },
      );
      if (paid.modifiedCount !== 1) {
        await resetSettlement(database, auction._id);
        return false;
      }
      sellerPaid = true;
    }
    const commissionAmount = getAuctionCommissionAmount(auction);
    if (auction.commission && commissionAmount > 0) {
      const paid = await database.collection<AuctionPlayer>("players").updateOne(
        { _id: auction.commission.player_id },
        { $inc: { "profile.bank_balance": commissionAmount } },
      );
      if (paid.modifiedCount !== 1) {
        if (sellerPaid && auction.seller_id) {
          await database.collection<AuctionPlayer>("players").updateOne(
            { _id: auction.seller_id },
            { $inc: { "profile.bank_balance": -auction.current_bid } },
          );
          sellerPaid = false;
        }
        await resetSettlement(database, auction._id);
        return false;
      }
      commissionPaid = commissionAmount;
    }
    const trackedWinner = await database
      .collection<AuctionPlayer>("players")
      .updateOne(
        { _id: auction.current_winner_id, active: true },
        {
          $inc: {
            "profile.playthrough_stats.items_collected": 1,
            "profile.playthrough_stats.money_spent": auction.current_bid,
            "profile.karma": winnerKarma,
          },
        },
      );
    if (trackedWinner.modifiedCount !== 1) {
      if (sellerPaid && auction.seller_id) {
        await database.collection<AuctionPlayer>("players").updateOne(
          { _id: auction.seller_id },
          { $inc: { "profile.bank_balance": -auction.current_bid } },
        );
      }
      if (commissionPaid > 0 && auction.commission) {
        await database.collection<AuctionPlayer>("players").updateOne(
          { _id: auction.commission.player_id },
          { $inc: { "profile.bank_balance": -commissionPaid } },
        );
        commissionPaid = 0;
      }
      await resetSettlement(database, auction._id);
      return false;
    }
    winnerStatsTracked = true;
    const transfer = await items.updateOne(
      { _id: auction.item_id, status: "auctioned" },
      {
        $set: {
          owner: auction.current_winner_id,
          status: "claimed",
          tags: [],
          date_received: now,
          "authenticity.identified":
            auction.seller_id === null || Boolean(authenticationEffect),
          "authenticity.fee": auction.current_bid,
          "authenticity.liability_pending": auction.seller_id !== null,
        },
        $push: {
          transaction_history: {
            type: "auction",
            from_owner: auction.seller_id,
            to_owner: auction.current_winner_id,
            occurred_at: now,
            source:
              auction.viewer === "public"
                ? "auction house"
                : "private auction",
            amount: auction.current_bid,
          },
        },
      },
    );
    if (transfer.modifiedCount !== 1) {
      winnerStatsTracked = false;
      await database.collection<AuctionPlayer>("players").updateOne(
        { _id: auction.current_winner_id },
        {
          $inc: {
            "profile.playthrough_stats.items_collected": -1,
            "profile.playthrough_stats.money_spent": -auction.current_bid,
            "profile.karma": -winnerKarma,
          },
        },
      );
      if (sellerPaid && auction.seller_id) {
        await database.collection<AuctionPlayer>("players").updateOne(
          { _id: auction.seller_id },
          { $inc: { "profile.bank_balance": -auction.current_bid } },
        );
      }
      if (commissionPaid > 0 && auction.commission) {
        await database.collection<AuctionPlayer>("players").updateOne(
          { _id: auction.commission.player_id },
          { $inc: { "profile.bank_balance": -commissionPaid } },
        );
        commissionPaid = 0;
      }
      await resetSettlement(database, auction._id);
      return false;
    }
    itemTransferred = true;
    if (authenticationEffect && auctionItem.authenticity.forgery) {
      const refund = getAuctionForgeryRefund(
        authenticationEffect,
        auction.current_bid,
      );
      const destroyed = await items.deleteOne({
        _id: auction.item_id,
        owner: auction.current_winner_id,
        status: "claimed",
      });
      if (destroyed.deletedCount !== 1) {
        throw new Error("Authenticated auction forgery could not be destroyed.");
      }
      itemTransferred = false;
      if (refund > 0) {
        await database.collection<AuctionPlayer>("players").updateOne(
          { _id: auction.current_winner_id, active: true },
          { $inc: { "profile.bank_balance": refund } },
        );
      }
      await removeSettledAuctionRecord(database, auction);
      await recordEconomyMetricsSafely(database, [
        {
          amount: refund,
          currency: "money",
          direction: "earned",
          source: "auction-forgery-refund",
        },
        {
          amount: auctionItem.values.actual,
          currency: "items",
          direction: "spent",
          source: "auction-forgery-destroyed",
        },
        {
          amount: commissionPaid,
          currency: "money",
          direction: "earned",
          source: "auction-commission",
        },
      ]);
      await notifyAuctionPayoutRecipients(database, auction, commissionPaid);
      await safelyNotify(database, auction.current_winner_id, {
        kind: "warning",
        message: `${auction.item_snapshot.title} was authenticated for free, identified as a forgery, destroyed, and refunded $${refund.toLocaleString()}.${winnerKarma > 0 ? ` The auction win earned ${winnerKarma.toLocaleString()} Karma.` : ""}`,
      });
      return true;
    }
    if (conditionRestored) {
      try {
        const restoration = await items.updateOne(
          {
            _id: auction.item_id,
            owner: auction.current_winner_id,
            status: "claimed",
            condition: auctionItem.condition,
          },
          { $set: conditionUpdate },
        );
        conditionRestored = restoration.modifiedCount === 1;
        if (!conditionRestored) {
          console.error(
            `Auction condition restoration was skipped after transfer for auction ${auction._id}.`,
          );
        }
      } catch (error) {
        conditionRestored = false;
        console.error(
          `Unable to persist auction condition restoration for auction ${auction._id}`,
          error,
        );
      }
    }

    await removeSettledAuctionRecord(database, auction);
    await recordEconomyMetricsSafely(database, [
      ...(auction.seller_id
        ? [
            {
              amount: auction.current_bid,
              currency: "money" as const,
              direction: "earned" as const,
              source: "auction-sale",
            },
          ]
        : []),
      ...(commissionPaid > 0
        ? [
            {
              amount: commissionPaid,
              currency: "money" as const,
              direction: "earned" as const,
              source: "auction-commission",
            },
          ]
        : []),
      {
        amount: auctionItem.values.actual,
        currency: "items",
        direction: "acquired",
        source: "auction-win",
      },
    ]);
    await notifyAuctionPayoutRecipients(database, auction, commissionPaid);
    await safelyNotify(database, auction.current_winner_id, {
      kind: "success",
      message: `You won ${auction.item_snapshot.title} for $${auction.current_bid.toLocaleString()}${
        conditionRestored
          ? `, and its condition was restored to ${Math.floor((conditionUpdate.condition ?? auctionItem.condition) * 100)}%`
          : ""
      }${winnerKarma > 0 ? ` and earned ${winnerKarma.toLocaleString()} Karma` : ""}.`,
    });
    const winner = await database.collection<AuctionPlayer>("players").findOne({
      _id: auction.current_winner_id,
    });
    const settledItem = await items.findOne({
      _id: auction.item_id,
      owner: auction.current_winner_id,
      status: "claimed",
    });
    if (winner && settledItem) {
      await checkItemForHallOfFameStatus(
        database,
        settledItem,
        winner,
      ).catch((error) => {
        console.error(
          `Unable to submit auction item ${auction.item_id} for Hall of Fame review`,
          error,
        );
      });
    }
    return true;
  } catch (error) {
    console.error(`Unable to settle auction ${auction._id}`, error);
    if (!itemTransferred) {
      if (winnerStatsTracked && auction.current_winner_id) {
        await database.collection<AuctionPlayer>("players").updateOne(
          { _id: auction.current_winner_id },
          {
            $inc: {
              "profile.playthrough_stats.items_collected": -1,
              "profile.playthrough_stats.money_spent": -auction.current_bid,
              "profile.karma": -winnerKarma,
            },
          },
        ).catch((rollbackError) => {
          console.error(
            `Unable to roll back winner playthrough stats for auction ${auction._id}`,
            rollbackError,
          );
        });
      }
      if (sellerPaid && auction.seller_id) {
        await database.collection<AuctionPlayer>("players").updateOne(
          { _id: auction.seller_id },
          { $inc: { "profile.bank_balance": -auction.current_bid } },
        ).catch((rollbackError) => {
          console.error(
            `Unable to roll back seller payout for auction ${auction._id}`,
            rollbackError,
          );
        });
      }
      if (commissionPaid > 0 && auction.commission) {
        await database.collection<AuctionPlayer>("players").updateOne(
          { _id: auction.commission.player_id },
          { $inc: { "profile.bank_balance": -commissionPaid } },
        ).catch((rollbackError) => {
          console.error(
            `Unable to roll back commission payout for auction ${auction._id}`,
            rollbackError,
          );
        });
      }
      await resetSettlement(database, auction._id).catch((resetError) => {
        console.error(
          `Unable to reset settlement state for auction ${auction._id}`,
          resetError,
        );
      });
    } else {
      await removeSettledAuctionRecord(database, auction).catch((cleanupError) => {
        console.error(
          `Unable to remove completed auction ${auction._id}`,
          cleanupError,
        );
      });
    }
    return false;
  }
}

export async function removeSettledAuctionRecord(
  database: Db,
  auction: Pick<Auction, "_id" | "viewer">,
): Promise<void> {
  const removed = await database.collection<Auction>("auctions").deleteOne({
    _id: auction._id,
    settlement_status: "settling",
  });
  if (removed.deletedCount !== 1 || auction.viewer === "public") return;

  const cleanup = await database
    .collection<AuctionDismissalPlayer>("players")
    .updateOne(
      { _id: auction.viewer },
      {
        $pull: {
          "profile.dismissed_private_auction_ids": auction._id,
        },
      },
    );
  if (cleanup.matchedCount !== 1) {
    console.error(
      `Unable to remove dismissed private auction ${auction._id} from player ${auction.viewer}.`,
    );
  }
}

async function recoverAuctionWinner(
  database: Db,
  auction: Auction,
): Promise<Pick<AuctionPlayer, "_id" | "screen_name"> | null> {
  if (!auction.seller_id) return null;
  const sellerId = auction.seller_id;
  const players = database.collection<AuctionPlayer>("players");
  if (auction.current_winner_name) {
    const namedWinner = await players.findOne(
      {
        _id: { $ne: sellerId },
        screen_name: auction.current_winner_name,
      },
      { projection: { _id: 1, screen_name: 1 } },
    );
    if (namedWinner) return namedWinner;
  }

  return players.findOne(
    {
      _id: { $ne: sellerId },
      "profile.auction_data.winning": auction._id,
    } as Filter<AuctionPlayer>,
    { projection: { _id: 1, screen_name: 1 } },
  );
}

async function resetSettlement(database: Db, auctionId: string) {
  await database.collection<Auction>("auctions").updateOne(
    { _id: auctionId, settlement_status: "settling" },
    { $set: { settlement_status: "active" } },
  );
}

async function safelyNotify(
  database: Db,
  userId: string,
  notification: {
    kind: "info" | "success" | "warning";
    message: string;
    action?: {
      href: string;
      label: string;
    };
  },
) {
  try {
    await createPlayerNotification(database, userId, {
      ...notification,
      dedupeUnread: false,
    });
  } catch (error) {
    console.error(`Unable to create auction notification for ${userId}`, error);
  }
}

async function notifyAuctionPayoutRecipients(
  database: Db,
  auction: Auction,
  commissionPaid: number,
) {
  if (auction.seller_id) {
    await safelyNotify(database, auction.seller_id, {
      kind: "success",
      message: `${auction.item_snapshot.title} sold at auction for $${auction.current_bid.toLocaleString()}. The proceeds were added to your balance.`,
    });
  }
  if (commissionPaid > 0 && auction.commission) {
    await safelyNotify(database, auction.commission.player_id, {
      kind: "success",
      message: `${auction.item_snapshot.title} sold at auction for $${auction.current_bid.toLocaleString()}, earning you a $${commissionPaid.toLocaleString()} commission.`,
    });
  }
}

export function calculateAntiSnipeExpiration(
  currentExpiration: string | Date,
  extensionMinutes: number,
  now: Date = new Date(),
): string {
  const currentExpMs = new Date(currentExpiration).getTime();
  const nowMs = now.getTime();
  const extensionMs = Math.max(0, extensionMinutes) * 60 * 1000;
  if (currentExpMs - nowMs < extensionMs) {
    return new Date(nowMs + extensionMs).toISOString();
  }
  return typeof currentExpiration === "string"
    ? currentExpiration
    : currentExpiration.toISOString();
}

export function getAuctionSort(
  sortOption: string | undefined,
  order: "asc" | "desc" | undefined,
): Sort {
  const sortFields: Record<string, string> = {
    remaining: "expiration",
    price: "current_bid",
    seller: "seller_name",
    title: "item_snapshot.title",
    artist: "item_snapshot.artist",
    date: "item_snapshot.date",
    medium: "item_snapshot.medium",
    rarity: "item_snapshot.rarity_value",
    dropChance: "item_snapshot.drop_chance_coefficient",
    condition: "item_snapshot.condition",
    rolls: "item_snapshot.roll_count",
    level: "item_snapshot.level",
  };
  return {
    [sortFields[sortOption ?? "remaining"] ?? "expiration"]:
      order === "desc" ? -1 : 1,
  };
}

export async function getAuctionViews(
  database: Db,
  playerId: string,
  options: {
    auctionId?: string;
    auctionIds?: string[];
    itemId?: string;
    search?: string;
    sort?: string;
    order?: "asc" | "desc";
    rarities?: ArtworkRarity[];
    types?: string[];
    artStyle?: string;
    properties?: Partial<Record<AuctionPropertyKey, ItemFilterMode>>;
    attributeIds?: string[];
    attributeMinimum?: number;
    specialAttributeIds?: string[];
    specialAttributeMinimum?: number;
    exclusivity?: "all" | "public" | "private";
    quest?: "all" | "quest" | "sought";
    page?: number;
    pageSize?: number;
    originatedPrivateOnly?: boolean;
    now?: Date;
  } = {},
): Promise<{
  auctions: AuctionView[];
  total: number;
  filterOptions: AuctionFilterOptions;
}> {
  try {
    await maintainPublicAuctions(database);
  } catch (error) {
    console.error("Unable to replenish public auctions", error);
  }

  const now = options.now ?? new Date();
  await backfillAuctionFilterSnapshots(database, now);
  const player = await database.collection<AuctionPlayer>("players").findOne({
    _id: playerId,
    active: true,
  });
  const hasMarketExpert = hasActiveMarketExpertAccess(
    player?.profile.market_expert?.expiration,
    now,
  );
  const filter: Filter<Auction> = {
    expiration: { $gt: now.toISOString() },
    settlement_status: { $ne: "settling" },
  };
  const optionFilter: Filter<Auction> = {
    expiration: { $gt: now.toISOString() },
    settlement_status: { $ne: "settling" },
  };
  const andFilters: Filter<Auction>[] = [];
  if (options.auctionId) filter._id = options.auctionId;
  if (options.auctionIds?.length) filter._id = { $in: options.auctionIds };
  if (options.itemId) filter.item_id = options.itemId;
  if (!hasMarketExpert && options.quest === "sought") options.quest = "all";
  if (
    !hasMarketExpert &&
    ["condition", "rolls", "level"].includes(options.sort ?? "")
  ) {
    options.sort = "remaining";
  }
  if (options.originatedPrivateOnly) {
    filter.viewer = playerId;
    optionFilter.viewer = playerId;
  } else {
    if (options.exclusivity === "public") filter.viewer = "public";
    if (options.exclusivity === "private") filter.viewer = { $ne: "public" };
    if (options.exclusivity === "public") optionFilter.viewer = "public";
    if (options.exclusivity === "private") {
      optionFilter.viewer = { $ne: "public" };
    }
    const accessFilter = getAuctionAccessFilter(
      playerId,
      hasMarketExpert,
      now,
    );
    andFilters.push(accessFilter);
    optionFilter.$and = [accessFilter];
  }
  if (options.rarities?.length) {
    filter["item_snapshot.rarity"] = { $in: options.rarities };
  }
  if (options.search?.trim()) {
    const escaped = options.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    andFilters.push({
      $or: [
        { "item_snapshot.title": { $regex: escaped, $options: "i" } },
        { "item_snapshot.artist": { $regex: escaped, $options: "i" } },
        { seller_name: { $regex: escaped, $options: "i" } },
      ],
    });
  }
  if (options.artStyle) {
    filter["item_snapshot.card_renderer"] = options.artStyle;
  }
  for (const key of AUCTION_PROPERTY_KEYS) {
    const mode = options.properties?.[key];
    if (!mode || mode === "any") continue;
    const propertyFilter = getAuctionPropertyFilter(key, mode);
    if (propertyFilter) andFilters.push(propertyFilter);
  }
  addAttributeSelectionFilter(
    andFilters,
    "item_snapshot.attribute_ids",
    options.attributeIds,
    options.attributeMinimum,
  );
  addAttributeSelectionFilter(
    andFilters,
    "item_snapshot.special_attribute_ids",
    options.specialAttributeIds,
    options.specialAttributeMinimum,
  );
  const typeFilters = (options.types ?? []).map((type): Filter<Auction> => {
    if (type === "standard") {
      return {
        "item_snapshot.foil": false,
        "item_snapshot.seasonal": false,
        "item_snapshot.original": false,
        "item_snapshot.lottery": { $in: [0, null] },
      };
    }
    if (type === "lottery") return { "item_snapshot.lottery": { $gt: 0 } };
    return { [`item_snapshot.${type}`]: true };
  });
  if (typeFilters.length) {
    andFilters.push({ $or: typeFilters });
  }
  if (andFilters.length) filter.$and = andFilters;
  if (options.quest === "quest") {
    const quests = await database
      .collection<ArtHistorianQuest>("quests")
      .find({ owner_id: playerId })
      .project<Pick<ArtHistorianQuest, "target" | "fulfilled_targets">>({
        target: 1,
        fulfilled_targets: 1,
      })
      .toArray();
    filter["item_snapshot.artwork_id"] = {
      $in: [...new Set(quests.flatMap(getUnfulfilledHistorianTargetIds))],
    };
  } else if (options.quest === "sought") {
    const otherQuests = await database
      .collection<ArtHistorianQuest>("quests")
      .find({ owner_id: { $ne: playerId } })
      .project<
        Pick<
          ArtHistorianQuest,
          "owner_id" | "target" | "fulfilled_targets"
        >
      >({
        owner_id: 1,
        target: 1,
        fulfilled_targets: 1,
      })
      .toArray();
    const sought: string[] = [];
    for (const quest of otherQuests) {
      sought.push(...getUnfulfilledHistorianTargetIds(quest));
    }
    filter["item_snapshot.artwork_id"] = { $in: [...new Set(sought)] };
  }

  const sort = getAuctionSort(options.sort, options.order);
  const pageSize = Math.min(Math.max(options.pageSize ?? 12, 1), 48);
  const page = Math.max(options.page ?? 1, 1);
  const [
    auctions,
    total,
    ownedItems,
    quests,
    archiveRecords,
    filterOptions,
  ] = await Promise.all([
    database.collection<Auction>("auctions").find(filter).sort(sort)
      .skip((page - 1) * pageSize).limit(pageSize).toArray(),
    database.collection<Auction>("auctions").countDocuments(filter),
    database.collection<GameItem>("items").find({
      owner: playerId,
      status: { $in: ["claimed", "displayed"] },
    }).project<Pick<GameItem, "artwork_id">>({ artwork_id: 1 }).toArray(),
    database.collection<ArtHistorianQuest>("quests").find({ owner_id: playerId })
      .project<Pick<ArtHistorianQuest, "target" | "fulfilled_targets">>({
        target: 1,
        fulfilled_targets: 1,
      }).toArray(),
    database
      .collection<PlayerArtworkArchive>("player_artwork_archives")
      .find({ owner: playerId })
      .toArray(),
    getAuctionFilterOptions(database, optionFilter),
  ]);
  const rawItems = await database.collection<GameItem>("items").find({
    _id: { $in: auctions.map((auction) => auction.item_id) },
  }).toArray();
  const hydrated = await hydrateGameItems(database, rawItems);
  const itemById = new Map(hydrated.map((item) => [item._id, item]));
  const ownedArtworkIds = new Set(ownedItems.map((item) => item.artwork_id));
  const questTargets = new Set(
    quests.flatMap(getUnfulfilledHistorianTargetIds),
  );
  const archiveByArtwork = new Map(
    archiveRecords.map((archive) => [archive.artwork_id, archive]),
  );

  return {
    total,
    filterOptions,
    auctions: auctions.flatMap((auction) => {
      const item = itemById.get(auction.item_id);
      if (!item) return [];
      const archive = archiveByArtwork.get(item.artwork_id);
      const archivedCategories = archive
        ? getArchiveRecordModifiers(archive)
        : [];
      const archivedArtStyles = archive
        ? getArchiveRecordArtStyles(archive)
        : [];
      const visibleItem = sanitizePlayerFacingAuthenticity(
        item,
        auction.seller_id !== playerId,
      );
      return [{
        ...auction,
        item: {
          ...visibleItem,
          archivePermission: getPlayerFacingArchivePermission(
            visibleItem,
            archivedCategories,
            archivedArtStyles,
          ),
          archivedCategories,
          archivedArtStyles,
        },
        owned: ownedArtworkIds.has(item.artwork_id),
        questTarget: questTargets.has(item.artwork_id),
        currentlyWinning: auction.current_winner_id === playerId,
        privateAuction: auction.viewer !== "public",
      }];
    }),
  };
}

function getAuctionAttributeSnapshot(
  item: {
    attributes?: Partial<GameItem["attributes"]>;
  },
): Pick<
  Auction["item_snapshot"],
  "attribute_ids" | "special_attribute_ids" | "attribute_options"
> {
  const locked = item.attributes?.locked ?? [];
  const unlocked = item.attributes?.unlocked ?? [];
  const special = item.attributes?.special ?? [];
  const regular = locked.concat(unlocked);
  const all = regular.concat(special);
  const specialIds = new Set(
    special.map((attribute) => attribute._id),
  );
  const options = new Map<string, AuctionAttributeOption>();
  for (const attribute of all) {
    options.set(attribute._id, {
      id: attribute._id,
      label: attribute.npc_name || attribute.title,
      special: specialIds.has(attribute._id),
    });
  }
  return {
    attribute_ids: [...options.keys()],
    special_attribute_ids: [...specialIds],
    attribute_options: [...options.values()],
  };
}

async function backfillAuctionFilterSnapshots(database: Db, now: Date) {
  const auctions = await database.collection<Auction>("auctions").find({
    expiration: { $gt: now.toISOString() },
    $or: [
      { "item_snapshot.card_renderer": { $exists: false } },
      { "item_snapshot.mint": { $exists: false } },
      { "item_snapshot.unlocked": { $exists: false } },
      { "item_snapshot.attribute_ids": { $exists: false } },
    ],
  }).project<Pick<Auction, "_id" | "item_id">>({
    _id: 1,
    item_id: 1,
  }).toArray();
  if (auctions.length === 0) return;

  const items = await database.collection<GameItem>("items").find({
    _id: { $in: auctions.map((auction) => auction.item_id) },
  }).toArray();
  const itemById = new Map(items.map((item) => [item._id, item]));
  const operations = auctions.flatMap((auction) => {
    const item = itemById.get(auction.item_id);
    if (!item) return [];
    const attributeSnapshot = getAuctionAttributeSnapshot(item);
    return [{
      updateOne: {
        filter: { _id: auction._id },
        update: {
          $set: {
            "item_snapshot.card_renderer": item.card_renderer ?? "museum",
            "item_snapshot.mint": item.mint,
            "item_snapshot.unlocked": item.unlocked,
            "item_snapshot.attribute_ids":
              attributeSnapshot.attribute_ids,
            "item_snapshot.special_attribute_ids":
              attributeSnapshot.special_attribute_ids,
            "item_snapshot.attribute_options":
              attributeSnapshot.attribute_options,
          },
        },
      },
    }];
  });
  if (operations.length > 0) {
    await database.collection<Auction>("auctions").bulkWrite(operations);
  }
}

function getAuctionPropertyFilter(
  key: AuctionPropertyKey,
  mode: Exclude<ItemFilterMode, "any">,
): Filter<Auction> | null {
  if (key === "lottery") {
    return mode === "only"
      ? { "item_snapshot.lottery": { $gt: 0 } }
      : { "item_snapshot.lottery": { $in: [0, null] } };
  }
  return {
    [`item_snapshot.${key}`]: mode === "only" ? true : { $ne: true },
  } as Filter<Auction>;
}

function addAttributeSelectionFilter(
  filters: Filter<Auction>[],
  field: "item_snapshot.attribute_ids" | "item_snapshot.special_attribute_ids",
  ids: string[] | undefined,
  minimum: number | undefined,
) {
  if (!ids?.length) return;
  filters.push({
    $expr: {
      $gte: [
        { $size: { $setIntersection: [`$${field}`, ids] } },
        Math.min(Math.max(1, minimum ?? 1), ids.length),
      ],
    },
  });
}

async function getAuctionFilterOptions(
  database: Db,
  filter: Filter<Auction>,
): Promise<AuctionFilterOptions> {
  const auctions = await database.collection<Auction>("auctions")
    .find(filter)
    .project<Pick<Auction, "item_snapshot">>({ item_snapshot: 1 })
    .toArray();
  const attributes = new Map<string, string>();
  const specialAttributes = new Map<string, string>();
  const artStyleIds = new Set<string>();
  for (const auction of auctions) {
    artStyleIds.add(auction.item_snapshot.card_renderer ?? "museum");
    for (const option of auction.item_snapshot.attribute_options ?? []) {
      attributes.set(option.id, option.label);
      if (option.special) specialAttributes.set(option.id, option.label);
    }
  }
  const toOptions = (options: Map<string, string>) =>
    [...options].map(([id, label]) => ({ id, label })).sort((left, right) =>
      left.label.localeCompare(right.label),
    );
  return {
    artStyleIds: [...artStyleIds].sort(),
    attributes: toOptions(attributes),
    specialAttributes: toOptions(specialAttributes),
  };
}

export async function validateBidder(
  database: Db,
  player: AuctionPlayer,
  auction: Auction,
): Promise<string | null> {
  const restriction = getAuctionBidRestriction(auction, player._id);
  if (restriction) return restriction;
  const marketExpert = hasActiveMarketExpertAccess(
    player.profile.market_expert?.expiration,
  );
  if (!canPlayerAccessAuction(auction, player._id, marketExpert)) {
    return "This is a private auction.";
  }
  const cap = Math.floor(player.profile.auction_cap * (marketExpert ? 1.5 : 1));
  const winning = await database.collection<Auction>("auctions").countDocuments({
    current_winner_id: player._id,
    expiration: { $gt: new Date().toISOString() },
    settlement_status: { $ne: "settling" },
  });
  if (winning >= cap && auction.current_winner_id !== player._id) {
    return "Your active auction limit has been reached.";
  }
  const inventoryCount = await database.collection<GameItem>("items").countDocuments({
    owner: player._id,
    status: { $in: ["claimed", "displayed"] },
    original: { $ne: true },
    vintage: { $ne: true },
  });
  const reservedInventory = await database
    .collection<Auction>("auctions")
    .countDocuments({
      current_winner_id: player._id,
      expiration: { $gt: new Date().toISOString() },
      "item_snapshot.original": false,
      "item_snapshot.vintage": { $ne: true },
      settlement_status: { $ne: "settling" },
    });
  const capacity =
    player.profile.inventory_cap + (player.profile.expansion_slots ?? 0);
  if (
    inventoryCount + reservedInventory >= capacity &&
    auction.current_winner_id !== player._id &&
    !auction.item_snapshot.original &&
    !auction.item_snapshot.vintage
  ) {
    return "Your inventory is currently full.";
  }
  return null;
}
