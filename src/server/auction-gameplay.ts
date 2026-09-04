import { randomUUID } from "node:crypto";

import { MongoServerError, type Db, type Filter, type Sort } from "mongodb";

import type { ArtHistorianQuest } from "./art-historian-gameplay";
import { getAuctionSettlementDisposition } from "./auction-settlement";
import {
  getPublicAuctionReplenishmentCount,
  PUBLIC_AUCTION_DURATION_MINUTES,
} from "./auction-population";
import {
  getGameplayGenerationMap,
  getGameplaySettings,
} from "./game-settings";
import {
  calculateItemValues,
  generateDailyDrop,
  type Artwork,
  type ArtworkRarity,
  type GameItem,
  type LootData,
} from "./gameplay";
import { hydrateGameItems, type HydratedGameItem } from "./item-artwork";
import {
  getDisplayedLegendaryEffect,
  getLegendaryNumberParameter,
} from "./legendary-attributes";
import { createPlayerNotification } from "./player-notifications";
import { sanitizePlayerFacingAuthenticity } from "./forgery-gameplay";

export const PUBLIC_AUCTION_DURATIONS = [60, 360, 720, 1440] as const;
export const PRIVATE_AUCTION_DURATION_MINUTES = 5;
export const AUCTIONEER_BASE_PRIVATE_LOTS = 4;
export const AUCTION_HOUSE_OWNER_ID = "system:auction-house";
const AUCTION_REPLENISHMENT_LEASE_MS = 2 * 60 * 1000;
const AUCTION_HOUSE_STATE_ID = "auction-house-state";

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
  current_winner_id: string | null;
  current_winner_name: string | null;
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
    foil: boolean;
    seasonal: boolean;
    lottery: number;
    original: boolean;
    vintage?: boolean;
  };
};

export type AuctionView = Auction & {
  item: HydratedGameItem;
  owned: boolean;
  questTarget: boolean;
  currentlyWinning: boolean;
  privateAuction: boolean;
};

type AuctionPlayer = {
  _id: string;
  screen_name: string;
  active: boolean;
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

export async function getPlayerAuctionEscrow(
  database: Db,
  playerId: string,
  now = new Date(),
): Promise<number> {
  const [result] = await database
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
    .toArray();

  return result?.total ?? 0;
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
    durationMinutes,
    now = new Date(),
  }: {
    sellerId: string | null;
    sellerName: string;
    viewer?: "public" | string;
    startingBid: number;
    buyNow: number | null;
    durationMinutes: number;
    now?: Date;
  },
): Promise<Auction> {
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
    current_winner_id: null,
    current_winner_name: null,
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
      foil: item.foil,
      seasonal: item.seasonal,
      lottery: item.lottery,
      original: item.original,
      vintage: item.vintage,
    },
  };
  await database.collection<Auction>("auctions").insertOne(auction);
  return auction;
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
      50,
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
  let itemTransferred = false;
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
        await items.deleteOne({ _id: auction.item_id, status: "auctioned" });
      }
      await database.collection<Auction>("auctions").deleteOne({
        _id: auction._id,
        settlement_status: "settling",
      });
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
    let conditionRestored = false;
    let conditionUpdate: Partial<Pick<GameItem, "condition" | "values">> = {};
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
    const transfer = await items.updateOne(
      { _id: auction.item_id, status: "auctioned" },
      {
        $set: {
          owner: auction.current_winner_id,
          status: "claimed",
          tags: [],
          date_received: now,
          "authenticity.identified": auction.seller_id === null,
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
      if (sellerPaid && auction.seller_id) {
        await database.collection<AuctionPlayer>("players").updateOne(
          { _id: auction.seller_id },
          { $inc: { "profile.bank_balance": -auction.current_bid } },
        );
      }
      await resetSettlement(database, auction._id);
      return false;
    }
    itemTransferred = true;
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

    await database.collection<Auction>("auctions").deleteOne({
      _id: auction._id,
      settlement_status: "settling",
    });
    await safelyNotify(database, auction.current_winner_id, {
      kind: "success",
      message: `You won ${auction.item_snapshot.title} for $${auction.current_bid.toLocaleString()}${
        conditionRestored
          ? `, and its condition was restored to ${Math.floor((conditionUpdate.condition ?? auctionItem.condition) * 100)}%`
          : ""
      }.`,
    });
    return true;
  } catch (error) {
    console.error(`Unable to settle auction ${auction._id}`, error);
    if (!itemTransferred) {
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
      await resetSettlement(database, auction._id).catch((resetError) => {
        console.error(
          `Unable to reset settlement state for auction ${auction._id}`,
          resetError,
        );
      });
    } else {
      await database.collection<Auction>("auctions").deleteOne({
        _id: auction._id,
        settlement_status: "settling",
      }).catch((cleanupError) => {
        console.error(
          `Unable to remove completed auction ${auction._id}`,
          cleanupError,
        );
      });
    }
    return false;
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
  notification: { kind: "info" | "success" | "warning"; message: string },
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

export async function runPrivateAuctionBots(
  database: Db,
  playerId: string,
  now = new Date(),
): Promise<void> {
  const cutoff = new Date(now.getTime() + 10_000).toISOString();
  const auctions = await database.collection<Auction>("auctions").find({
    viewer: playerId,
    expiration: { $gt: cutoff },
    settlement_status: { $ne: "settling" },
    $or: [
      { last_bot_roll: { $exists: false } },
      { last_bot_roll: { $lte: new Date(now.getTime() - 10_000).toISOString() } },
    ],
  }).toArray();

  for (const auction of auctions) {
    const item = await database.collection<GameItem>("items").findOne({
      _id: auction.item_id,
      status: "auctioned",
    });
    if (!item || auction.current_bid >= item.values.actual * 3) continue;

    const secondsRemaining =
      (new Date(auction.expiration).getTime() - now.getTime()) / 1000;
    const rarityChance: Record<ArtworkRarity, number> = {
      common: 0.2,
      uncommon: 0.233,
      rare: 0.267,
      legendary: 0.3,
      masterpiece: 0.333,
    };
    const chance =
      rarityChance[auction.item_snapshot.rarity] *
      (secondsRemaining < 60 ? 2 : 1);
    const setter: Partial<Auction> = { last_bot_roll: now.toISOString() };
    if (Math.random() < chance) {
      const botBid = Math.max(
        auction.minimum_bid,
        Math.floor(
          auction.starting_bid *
            (1 + Math.random() * (secondsRemaining < 60 ? 0.2 : 0.1)),
        ),
      );
      Object.assign(setter, {
        current_bid: botBid,
        minimum_bid: botBid + auction.increment,
        current_winner_id: null,
        current_winner_name: null,
        has_bid: true,
      });
    }
    const updated = await database.collection<Auction>("auctions").updateOne(
      {
        _id: auction._id,
        current_bid: auction.current_bid,
        minimum_bid: auction.minimum_bid,
        current_winner_id: auction.current_winner_id,
        expiration: auction.expiration,
        settlement_status: { $ne: "settling" },
      },
      { $set: setter },
    );
    if (
      updated.modifiedCount === 1 &&
      setter.current_winner_id === null &&
      auction.current_winner_id
    ) {
      await database.collection<AuctionPlayer>("players").updateOne(
        { _id: auction.current_winner_id },
        { $inc: { "profile.bank_balance": auction.current_bid } },
      );
      await safelyNotify(database, auction.current_winner_id, {
        kind: "warning",
        message: `You were outbid on ${auction.item_snapshot.title}.`,
      });
    }
  }
}

export async function getAuctionViews(
  database: Db,
  playerId: string,
  options: {
    search?: string;
    sort?: string;
    order?: "asc" | "desc";
    rarities?: ArtworkRarity[];
    types?: string[];
    exclusivity?: "all" | "public" | "private";
    quest?: "all" | "quest" | "sought";
    page?: number;
    pageSize?: number;
  } = {},
): Promise<{ auctions: AuctionView[]; total: number }> {
  try {
    await maintainPublicAuctions(database);
  } catch (error) {
    console.error("Unable to replenish public auctions", error);
  }
  await runPrivateAuctionBots(database, playerId);

  const filter: Filter<Auction> = {
    expiration: { $gt: new Date().toISOString() },
    viewer: { $in: ["public", playerId] },
    settlement_status: { $ne: "settling" },
  };
  const player = await database.collection<AuctionPlayer>("players").findOne({
    _id: playerId,
    active: true,
  });
  const hasMarketExpert =
    new Date(player?.profile.market_expert?.expiration ?? 0).getTime() >
    Date.now();
  if (!hasMarketExpert && options.quest === "sought") options.quest = "all";
  if (
    !hasMarketExpert &&
    ["condition", "rolls", "level"].includes(options.sort ?? "")
  ) {
    options.sort = "remaining";
  }
  if (options.exclusivity === "public") filter.viewer = "public";
  if (options.exclusivity === "private") filter.viewer = playerId;
  if (options.rarities?.length) {
    filter["item_snapshot.rarity"] = { $in: options.rarities };
  }
  if (options.search?.trim()) {
    const escaped = options.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { "item_snapshot.title": { $regex: escaped, $options: "i" } },
      { "item_snapshot.artist": { $regex: escaped, $options: "i" } },
      { seller_name: { $regex: escaped, $options: "i" } },
    ];
  }
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
    filter.$and = [{ $or: typeFilters }];
  }
  if (options.quest === "quest") {
    const quests = await database
      .collection<ArtHistorianQuest>("quests")
      .find({ owner_id: playerId })
      .project<Pick<ArtHistorianQuest, "target">>({ target: 1 })
      .toArray();
    filter["item_snapshot.artwork_id"] = {
      $in: [...new Set(quests.flatMap((quest) => quest.target))],
    };
  } else if (options.quest === "sought") {
    const otherQuests = await database
      .collection<ArtHistorianQuest>("quests")
      .find({ owner_id: { $ne: playerId } })
      .project<Pick<ArtHistorianQuest, "owner_id" | "target">>({
        owner_id: 1,
        target: 1,
      })
      .toArray();
    const sought: string[] = [];
    for (const quest of otherQuests) {
      const owned = await database.collection<GameItem>("items").find({
        owner: quest.owner_id,
        artwork_id: { $in: quest.target },
        status: { $in: ["claimed", "displayed"] },
      }).project<Pick<GameItem, "artwork_id">>({ artwork_id: 1 }).toArray();
      const ownedIds = new Set(owned.map((item) => item.artwork_id));
      sought.push(...quest.target.filter((target) => !ownedIds.has(target)));
    }
    filter["item_snapshot.artwork_id"] = { $in: [...new Set(sought)] };
  }

  const sortFields: Record<string, string> = {
    remaining: "expiration",
    price: "current_bid",
    seller: "seller_name",
    title: "item_snapshot.title",
    artist: "item_snapshot.artist",
    date: "item_snapshot.date",
    medium: "item_snapshot.medium",
    rarity: "item_snapshot.rarity_value",
    condition: "item_snapshot.condition",
    rolls: "item_snapshot.roll_count",
    level: "item_snapshot.level",
  };
  const sort: Sort = {
    [sortFields[options.sort ?? "remaining"] ?? "expiration"]:
      options.order === "desc" ? -1 : 1,
  };
  const pageSize = Math.min(Math.max(options.pageSize ?? 12, 1), 48);
  const page = Math.max(options.page ?? 1, 1);
  const [auctions, total, ownedItems, quests] = await Promise.all([
    database.collection<Auction>("auctions").find(filter).sort(sort)
      .skip((page - 1) * pageSize).limit(pageSize).toArray(),
    database.collection<Auction>("auctions").countDocuments(filter),
    database.collection<GameItem>("items").find({
      owner: playerId,
      status: { $in: ["claimed", "displayed"] },
    }).project<Pick<GameItem, "artwork_id">>({ artwork_id: 1 }).toArray(),
    database.collection<ArtHistorianQuest>("quests").find({ owner_id: playerId })
      .project<Pick<ArtHistorianQuest, "target">>({ target: 1 }).toArray(),
  ]);
  const rawItems = await database.collection<GameItem>("items").find({
    _id: { $in: auctions.map((auction) => auction.item_id) },
  }).toArray();
  const hydrated = await hydrateGameItems(database, rawItems);
  const itemById = new Map(hydrated.map((item) => [item._id, item]));
  const ownedArtworkIds = new Set(ownedItems.map((item) => item.artwork_id));
  const questTargets = new Set(quests.flatMap((quest) => quest.target));

  return {
    total,
    auctions: auctions.flatMap((auction) => {
      const item = itemById.get(auction.item_id);
      return item ? [{
        ...auction,
        item: sanitizePlayerFacingAuthenticity(
          item,
          auction.seller_id !== playerId,
        ),
        owned: ownedArtworkIds.has(item.artwork_id),
        questTarget: questTargets.has(item.artwork_id),
        currentlyWinning: auction.current_winner_id === playerId,
        privateAuction: auction.viewer !== "public",
      }] : [];
    }),
  };
}

export async function validateBidder(
  database: Db,
  player: AuctionPlayer,
  auction: Auction,
): Promise<string | null> {
  if (auction.seller_id === player._id) return "You are the seller.";
  if (auction.viewer !== "public" && auction.viewer !== player._id) {
    return "This is a private auction.";
  }
  const marketExpert =
    new Date(player.profile.market_expert?.expiration ?? 0).getTime() >
    Date.now();
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
