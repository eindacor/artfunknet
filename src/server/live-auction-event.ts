import { randomUUID } from "node:crypto";

import {
  MongoServerError,
  type Db,
  type Filter,
  type UpdateFilter,
} from "mongodb";

import { deleteCommunityReactions } from "./community-reaction-cleanup.ts";
import { recordEconomyMetricsSafely } from "./economy-metrics.ts";
import type { GameItem } from "./gameplay.ts";
import {
  hydrateGameItems,
  type HydratedGameItem,
} from "./item-artwork.ts";
import { createPlayerNotification } from "./player-notifications.ts";

export const LIVE_AUCTION_STATE_ID = "live-auction-event";
export const LIVE_AUCTION_OWNER_ID = "system:live-auction";
export const LIVE_AUCTION_DAY_INDEX = 3;

const LIVE_AUCTION_LOCK_MS = 30_000;

export type LiveAuctionLock = {
  token: string;
  action: "start" | "bid" | "accept" | "stop";
  expires_at: string;
  operation_token?: string;
  player_id?: string;
  charge?: number;
};

export type LiveAuctionState = {
  _id: typeof LIVE_AUCTION_STATE_ID;
  kind: "live_auction_event";
  live: boolean;
  hidden: boolean;
  stream_url: string;
  buffer_item_ids: string[];
  current_item_id: string | null;
  current_bid: number;
  minimum_bid: number;
  increment: number;
  configured_increment: number;
  winner_id: string | null;
  winner_name: string | null;
  last_bid_operation_id?: string;
  pending_refunds?: Array<{
    id: string;
    player_id: string;
    amount: number;
  }>;
  pending_winner_notifications?: Array<{
    id: string;
    player_id: string;
    item_id: string;
    title: string;
    amount: number;
  }>;
  pending_winner_notification?: {
    id: string;
    player_id: string;
    item_id: string;
    title: string;
    amount: number;
  };
  version: number;
  lock?: LiveAuctionLock;
  updated_at: string;
  updated_by: string;
};

export type LiveAuctionAdminView = {
  state: LiveAuctionState;
  currentItem: HydratedGameItem | null;
  bufferItems: HydratedGameItem[];
};

export type LiveAuctionPublicView = {
  live: boolean;
  hidden: boolean;
  thankYou: boolean;
  biddingOpen: boolean;
  currentBid: number | null;
  minimumBid: number | null;
  increment: number | null;
  winnerName: string | null;
  streamUrl?: string;
  currentItem: HydratedGameItem | null;
};

type LiveAuctionPlayer = {
  _id: string;
  screen_name: string;
  active: boolean;
  profile: {
    bank_balance: number;
    inventory_cap: number;
    expansion_slots?: number;
    last_activity?: string;
    playthrough_stats?: {
      items_collected?: number;
      money_spent?: number;
    };
    live_auction_refund_receipt?: {
      id: string;
      credited_at: string;
    };
    live_auction_refund_ids?: string[];
    live_auction_bid_operation_ids?: string[];
    live_auction_settlement_ids?: string[];
  };
};

type LiveAuctionItem = GameItem & {
  live_auction_settlement_id?: string;
};

export class LiveAuctionError extends Error {
  readonly status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

export function createInitialLiveAuctionState(
  now = new Date(),
  updatedBy = "system",
): LiveAuctionState {
  return {
    _id: LIVE_AUCTION_STATE_ID,
    kind: "live_auction_event",
    live: false,
    hidden: true,
    stream_url: "",
    buffer_item_ids: [],
    current_item_id: null,
    current_bid: 0,
    minimum_bid: 0,
    increment: 1,
    configured_increment: 1,
    winner_id: null,
    winner_name: null,
    pending_refunds: [],
    pending_winner_notifications: [],
    version: 0,
    updated_at: now.toISOString(),
    updated_by: updatedBy,
  };
}

export function getLiveAuctionItemTerms(
  item: Pick<GameItem, "values">,
  increment = 1,
): Pick<LiveAuctionState, "current_bid" | "minimum_bid" | "increment"> {
  const minimumBid = Math.max(1, Math.ceil(item.values.actual));
  increment = Math.max(1, Math.floor(increment));
  if (
    !Number.isSafeInteger(minimumBid) ||
    !Number.isSafeInteger(increment) ||
    minimumBid + increment > Number.MAX_SAFE_INTEGER
  ) {
    throw new LiveAuctionError(
      "This item's auction values are outside the supported range.",
      400,
    );
  }
  return {
    current_bid: 0,
    minimum_bid: minimumBid,
    increment,
  };
}

export function getLiveAuctionBidDecision(
  state: Pick<
    LiveAuctionState,
    | "live"
    | "hidden"
    | "current_item_id"
    | "current_bid"
    | "minimum_bid"
    | "increment"
    | "winner_id"
  >,
  playerId: string,
  amount: number,
): {
  charge: number;
  previousWinnerRefund: number;
  nextMinimumBid: number;
  sameWinner: boolean;
} {
  if (!state.live || state.hidden || !state.current_item_id) {
    throw new LiveAuctionError("Live bidding is not currently open.");
  }
  if (
    !Number.isSafeInteger(amount) ||
    amount < state.minimum_bid ||
    amount > Number.MAX_SAFE_INTEGER - state.increment
  ) {
    throw new LiveAuctionError(
      `Your bid must be a safe whole-dollar amount of at least $${state.minimum_bid.toLocaleString()}.`,
      400,
    );
  }
  const sameWinner = state.winner_id === playerId;
  const charge = sameWinner ? amount - state.current_bid : amount;
  if (!Number.isSafeInteger(charge) || charge <= 0) {
    throw new LiveAuctionError("Your new bid must increase the current bid.", 400);
  }
  return {
    charge,
    previousWinnerRefund:
      state.winner_id && !sameWinner ? state.current_bid : 0,
    nextMinimumBid: amount + state.increment,
    sameWinner,
  };
}

export function getAdvancedLiveAuctionState(
  state: LiveAuctionState,
  nextItem: Pick<GameItem, "values"> | null,
  {
    now = new Date(),
    updatedBy,
  }: {
    now?: Date;
    updatedBy: string;
  },
): LiveAuctionState {
  const nextItemId = state.buffer_item_ids[0] ?? null;
  const terms = nextItem
    ? getLiveAuctionItemTerms(nextItem, state.configured_increment)
    : null;
  return {
    ...state,
    hidden: true,
    buffer_item_ids: nextItemId ? state.buffer_item_ids.slice(1) : [],
    current_item_id: nextItemId,
    current_bid: terms?.current_bid ?? 0,
    minimum_bid: terms?.minimum_bid ?? 0,
    increment: terms?.increment ?? 1,
    winner_id: null,
    winner_name: null,
    version: state.version + 1,
    updated_at: now.toISOString(),
    updated_by: updatedBy,
    lock: undefined,
  };
}

export async function ensureLiveAuctionState(
  database: Db,
): Promise<LiveAuctionState> {
  const states = database.collection<LiveAuctionState>("metadata");
  const existing = await states.findOne({ _id: LIVE_AUCTION_STATE_ID });
  if (existing) return normalizeLiveAuctionState(existing);

  const state = createInitialLiveAuctionState();
  try {
    await states.insertOne(state);
    return state;
  } catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 11000) {
      throw error;
    }
    const raced = await states.findOne({ _id: LIVE_AUCTION_STATE_ID });
    if (!raced) throw error;
    return normalizeLiveAuctionState(raced);
  }
}

export async function appendLiveAuctionItem(
  database: Db,
  itemId: string,
  updatedBy = "admin",
): Promise<LiveAuctionState> {
  const state = await ensureLiveAuctionState(database);
  const item = await database.collection<GameItem>("items").findOne({
    _id: itemId,
    owner: LIVE_AUCTION_OWNER_ID,
    status: "claimed",
  });
  if (!item) {
    throw new LiveAuctionError(
      "Live-auction items must be system-owned and claimed before buffering.",
      400,
    );
  }
  getLiveAuctionItemTerms(item, state.configured_increment);
  if (
    state.current_item_id === itemId ||
    state.buffer_item_ids.includes(itemId)
  ) {
    throw new LiveAuctionError("That item is already in the live auction.");
  }

  const now = new Date().toISOString();
  const updated = await database.collection<LiveAuctionState>("metadata").findOneAndUpdate(
    {
      _id: LIVE_AUCTION_STATE_ID,
      version: state.version,
      current_item_id: { $ne: itemId },
      buffer_item_ids: { $ne: itemId },
      lock: { $exists: false },
    },
    {
      $push: { buffer_item_ids: itemId },
      $inc: { version: 1 },
      $set: { updated_at: now, updated_by: updatedBy },
    },
    { returnDocument: "after" },
  );
  if (!updated) {
    throw new LiveAuctionError(
      "The live-auction buffer changed before the item could be added.",
    );
  }
  return normalizeLiveAuctionState(updated);
}

export async function removeLiveAuctionBufferedItem(
  database: Db,
  itemId: string,
  updatedBy = "admin",
): Promise<LiveAuctionState> {
  const state = await ensureLiveAuctionState(database);
  if (!state.buffer_item_ids.includes(itemId)) {
    throw new LiveAuctionError(
      "That item is not available in the live-auction buffer.",
      409,
    );
  }
  const item = await database.collection<GameItem>("items").findOne({
    _id: itemId,
    owner: LIVE_AUCTION_OWNER_ID,
    status: "claimed",
  });
  if (!item) {
    throw new LiveAuctionError(
      "That live-auction buffer item is unavailable.",
      409,
    );
  }

  const updated = await database
    .collection<LiveAuctionState>("metadata")
    .findOneAndUpdate(
      {
        _id: LIVE_AUCTION_STATE_ID,
        version: state.version,
        buffer_item_ids: itemId,
        lock: { $exists: false },
      },
      {
        $pull: { buffer_item_ids: itemId },
        $inc: { version: 1 },
        $set: {
          updated_at: new Date().toISOString(),
          updated_by: updatedBy,
        },
      },
      { returnDocument: "after" },
    );
  if (!updated) {
    throw new LiveAuctionError(
      "The live-auction buffer changed before the item could be removed.",
    );
  }

  await Promise.all([
    database.collection<GameItem>("items").deleteOne({
      _id: itemId,
      owner: LIVE_AUCTION_OWNER_ID,
      status: "claimed",
    }),
    deleteCommunityReactions(database, "item", [itemId]),
  ]);
  return normalizeLiveAuctionState(updated);
}

export async function getLiveAuctionAdminView(
  database: Db,
): Promise<LiveAuctionAdminView> {
  await reconcileLiveAuctionState(database);
  const state = await ensureLiveAuctionState(database);
  const ids = [
    ...(state.current_item_id ? [state.current_item_id] : []),
    ...state.buffer_item_ids,
  ];
  const documents = ids.length
    ? await database
        .collection<GameItem>("items")
        .find({ _id: { $in: ids } })
        .toArray()
    : [];
  const hydrated = await hydrateGameItems(database, documents);
  const byId = new Map(hydrated.map((item) => [item._id, item]));
  const currentItem = state.current_item_id
    ? byId.get(state.current_item_id) ?? null
    : null;
  const bufferItems = state.buffer_item_ids.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
  return { state, currentItem, bufferItems };
}

export async function getLiveAuctionPublicView(
  database: Db,
): Promise<LiveAuctionPublicView> {
  const { state, currentItem } = await getLiveAuctionAdminView(database);
  const visible = state.live && !state.hidden && Boolean(currentItem);
  return {
    live: state.live,
    hidden: state.hidden,
    thankYou: state.live && !state.current_item_id,
    biddingOpen: visible,
    currentBid: visible ? state.current_bid : null,
    minimumBid: visible ? state.minimum_bid : null,
    increment: visible ? state.increment : null,
    winnerName: visible ? state.winner_name : null,
    ...(state.live && state.stream_url
      ? { streamUrl: state.stream_url }
      : {}),
    currentItem: visible ? currentItem : null,
  };
}

export async function setLiveAuctionStreamUrl(
  database: Db,
  streamUrl: string,
  updatedBy: string,
): Promise<void> {
  await reconcileLiveAuctionState(database);
  const normalized = normalizeTwitchStreamUrl(streamUrl);
  await ensureLiveAuctionState(database);
  const result = await database.collection<LiveAuctionState>("metadata").updateOne(
    { _id: LIVE_AUCTION_STATE_ID, lock: { $exists: false } },
    {
      $set: {
        stream_url: normalized,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      },
      $inc: { version: 1 },
    },
  );
  if (result.matchedCount !== 1) {
    throw new LiveAuctionError("The live auction is busy. Try again.");
  }
}

export async function setLiveAuctionVisibility(
  database: Db,
  hidden: boolean,
  updatedBy: string,
): Promise<void> {
  await reconcileLiveAuctionState(database);
  await ensureLiveAuctionState(database);
  const result = await database.collection<LiveAuctionState>("metadata").updateOne(
    {
      _id: LIVE_AUCTION_STATE_ID,
      live: true,
      current_item_id: { $ne: null },
      lock: { $exists: false },
    },
    {
      $set: {
        hidden,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      },
      $inc: { version: 1 },
    },
  );
  if (result.matchedCount !== 1) {
    throw new LiveAuctionError("There is no current live-auction item.");
  }
}

export async function setLiveAuctionIncrement(
  database: Db,
  increment: number,
  updatedBy: string,
): Promise<void> {
  if (!Number.isSafeInteger(increment) || increment < 1) {
    throw new LiveAuctionError(
      "The live-auction minimum increment must be a positive whole-dollar amount.",
      400,
    );
  }
  await reconcileLiveAuctionState(database);
  const state = await ensureLiveAuctionState(database);
  const minimumBid = state.winner_id
    ? state.current_bid + increment
    : state.minimum_bid;
  if (!Number.isSafeInteger(minimumBid)) {
    throw new LiveAuctionError(
      "The live-auction minimum increment is outside the supported range.",
      400,
    );
  }
  const result = await database
    .collection<LiveAuctionState>("metadata")
    .updateOne(
      {
        _id: LIVE_AUCTION_STATE_ID,
        version: state.version,
        lock: { $exists: false },
      },
      {
        $set: {
          configured_increment: increment,
          increment,
          minimum_bid: minimumBid,
          updated_at: new Date().toISOString(),
          updated_by: updatedBy,
        },
        $inc: { version: 1 },
      },
    );
  if (result.modifiedCount !== 1) {
    throw new LiveAuctionError(
      "The live auction changed before the increment could be saved.",
    );
  }
}

export async function startLiveAuction(
  database: Db,
  updatedBy: string,
): Promise<void> {
  await reconcileLiveAuctionState(database);
  const locked = await acquireLiveAuctionLock(database, "start", {
    live: false,
    "buffer_item_ids.0": { $exists: true },
  });
  const itemId = locked.buffer_item_ids[0];
  if (!itemId) {
    await releaseLiveAuctionLock(database, locked.lock!.token);
    throw new LiveAuctionError("Add an item to the buffer before starting.");
  }
  const item = await database.collection<GameItem>("items").findOne({
    _id: itemId,
    owner: LIVE_AUCTION_OWNER_ID,
    status: "claimed",
  });
  if (!item) {
    await releaseLiveAuctionLock(database, locked.lock!.token);
    throw new LiveAuctionError("The first buffered item is unavailable.");
  }
  let terms: ReturnType<typeof getLiveAuctionItemTerms>;
  try {
    terms = getLiveAuctionItemTerms(item, locked.configured_increment);
  } catch (error) {
    await releaseLiveAuctionLock(database, locked.lock!.token);
    throw error;
  }
  const activated = await database.collection<GameItem>("items").updateOne(
    {
      _id: itemId,
      owner: LIVE_AUCTION_OWNER_ID,
      status: "claimed",
    },
    { $set: { status: "auctioned" } },
  );
  if (activated.modifiedCount !== 1) {
    await releaseLiveAuctionLock(database, locked.lock!.token);
    throw new LiveAuctionError("The first buffered item changed.");
  }

  const finalized = await database.collection<LiveAuctionState>("metadata").updateOne(
    { _id: LIVE_AUCTION_STATE_ID, "lock.token": locked.lock!.token },
    {
      $set: {
        live: true,
        hidden: true,
        buffer_item_ids: locked.buffer_item_ids.slice(1),
        current_item_id: itemId,
        ...terms,
        winner_id: null,
        winner_name: null,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      },
      $unset: { lock: "" },
      $inc: { version: 1 },
    },
  );
  if (finalized.modifiedCount !== 1) {
    await database.collection<GameItem>("items").updateOne(
      { _id: itemId, owner: LIVE_AUCTION_OWNER_ID, status: "auctioned" },
      { $set: { status: "claimed" } },
    );
    throw new LiveAuctionError("The live auction changed before it could start.");
  }
}

export async function placeLiveAuctionBid(
  database: Db,
  playerId: string,
  amount: number,
  now = new Date(),
): Promise<{ bankBalance: number }> {
  await reconcileLiveAuctionState(database);
  const player = await database.collection<LiveAuctionPlayer>("players").findOne({
    _id: playerId,
    active: true,
  });
  if (!player) {
    throw new LiveAuctionError("This player account is unavailable.", 403);
  }
  const locked = await acquireLiveAuctionLock(database, "bid", {
    live: true,
    hidden: false,
    current_item_id: { $ne: null },
  });
  const token = locked.lock!.token;
  let decision: ReturnType<typeof getLiveAuctionBidDecision>;
  try {
    decision = getLiveAuctionBidDecision(locked, playerId, amount);
  } catch (error) {
    await releaseLiveAuctionLock(database, token);
    throw error;
  }
  let charged: LiveAuctionPlayer | null = null;
  const refund =
    locked.winner_id && !decision.sameWinner
      ? {
          id: randomUUID(),
          player_id: locked.winner_id,
          amount: locked.current_bid,
        }
      : null;
  try {
    const item = await database.collection<GameItem>("items").findOne({
      _id: locked.current_item_id!,
      owner: LIVE_AUCTION_OWNER_ID,
      status: "auctioned",
    });
    if (!item) {
      throw new LiveAuctionError("The current live-auction item is unavailable.");
    }
    if (!decision.sameWinner && !item.original && !item.vintage) {
      const [inventoryCount, reservedAuctions] = await Promise.all([
        database.collection<GameItem>("items").countDocuments({
          owner: playerId,
          status: { $in: ["claimed", "displayed"] },
          original: { $ne: true },
          vintage: { $ne: true },
        }),
        database.collection("auctions").countDocuments({
          current_winner_id: playerId,
          expiration: { $gt: now.toISOString() },
          "item_snapshot.original": false,
          "item_snapshot.vintage": { $ne: true },
          settlement_status: { $ne: "settling" },
        }),
      ]);
      const capacity =
        player.profile.inventory_cap + (player.profile.expansion_slots ?? 0);
      if (inventoryCount + reservedAuctions >= capacity) {
        throw new LiveAuctionError("Your inventory is currently full.");
      }
    }

    const preparedExpiresAt = new Date(
      Date.now() + LIVE_AUCTION_LOCK_MS,
    ).toISOString();
    const prepared = await database
      .collection<LiveAuctionState>("metadata")
      .updateOne(
        { _id: LIVE_AUCTION_STATE_ID, "lock.token": token },
        {
          $set: {
            "lock.player_id": playerId,
            "lock.charge": decision.charge,
            "lock.expires_at": preparedExpiresAt,
          },
        },
      );
    if (prepared.modifiedCount !== 1) {
      throw new LiveAuctionError("The live auction changed before bidding.");
    }

    charged = await database
      .collection<LiveAuctionPlayer>("players")
      .findOneAndUpdate(
        {
          _id: playerId,
          active: true,
          "profile.bank_balance": { $gte: decision.charge },
          "profile.live_auction_bid_operation_ids": { $ne: token },
        },
        {
          $inc: { "profile.bank_balance": -decision.charge },
          $set: { "profile.last_activity": now.toISOString() },
          $addToSet: { "profile.live_auction_bid_operation_ids": token },
        },
        { returnDocument: "after" },
      );
    if (!charged) {
      throw new LiveAuctionError(
        "You do not have enough available money for that bid.",
      );
    }

    const stateUpdate: UpdateFilter<LiveAuctionState> = {
      $set: {
        current_bid: amount,
        minimum_bid: decision.nextMinimumBid,
        winner_id: player._id,
        winner_name: player.screen_name,
        last_bid_operation_id: token,
        updated_at: now.toISOString(),
        updated_by: player._id,
      },
      $unset: { lock: "" },
      $inc: { version: 1 },
      ...(refund ? { $push: { pending_refunds: refund } } : {}),
    };
    const updated = await database
      .collection<LiveAuctionState>("metadata")
      .updateOne(
        {
          _id: LIVE_AUCTION_STATE_ID,
          "lock.token": token,
          live: true,
          hidden: false,
          current_item_id: locked.current_item_id,
        },
        stateUpdate,
      );
    if (updated.modifiedCount !== 1) {
      throw new LiveAuctionError(
        "Another bid arrived first. Refresh and try again.",
      );
    }
  } catch (error) {
    const current = await ensureLiveAuctionState(database);
    if (current.last_bid_operation_id !== token) {
      await refundLiveAuctionBidCharge(
        database,
        token,
        playerId,
        decision.charge,
      );
      await releaseLiveAuctionLock(database, token);
      throw error;
    }
  }

  if (!charged) {
    charged = await database.collection<LiveAuctionPlayer>("players").findOne({
      _id: playerId,
    });
  }
  if (!charged) {
    throw new LiveAuctionError("The bidder became unavailable.");
  }
  try {
    await database.collection<LiveAuctionPlayer>("players").updateOne(
      { _id: playerId },
      {
        $pull: {
          "profile.live_auction_bid_operation_ids": token,
        },
      },
    );
  } catch (error) {
    console.error("Unable to clean a completed live-auction bid marker", error);
  }

  if (refund) {
    try {
      await reconcileLiveAuctionRefunds(database);
    } catch (error) {
      console.error(
        "Unable to immediately reconcile a live-auction outbid refund",
        error,
      );
    }
    try {
      await createPlayerNotification(database, refund.player_id, {
        kind: "warning",
        message: `You were outbid in the live auction. The current bid is $${amount.toLocaleString()}.`,
        action: { href: "/play?section=daily", label: "View live auction" },
        dedupeUnread: false,
      });
    } catch (error) {
      console.error("Unable to send live-auction outbid notification", error);
    }
  }
  await recordEconomyMetricsSafely(database, {
    amount: decision.charge,
    currency: "money",
    direction: "spent",
    source: "live-auction-bid",
  });
  return { bankBalance: charged.profile.bank_balance };
}

export async function acceptLiveAuctionBid(
  database: Db,
  updatedBy: string,
): Promise<void> {
  await reconcileLiveAuctionState(database);
  const locked = await acquireLiveAuctionLock(database, "accept", {
    live: true,
    current_item_id: { $ne: null },
    winner_id: { $ne: null },
  });
  const token = locked.lock!.token;
  const currentItemId = locked.current_item_id;
  const winnerId = locked.winner_id;
  if (!currentItemId || !winnerId || !locked.winner_name) {
    await releaseLiveAuctionLock(database, token);
    throw new LiveAuctionError("A winning bid is required.");
  }
  const nextItemId = locked.buffer_item_ids[0] ?? null;
  const [currentItem, nextItem] = await Promise.all([
    database.collection<GameItem>("items").findOne({
      _id: currentItemId,
      owner: LIVE_AUCTION_OWNER_ID,
      status: "auctioned",
    }),
    nextItemId
      ? database.collection<GameItem>("items").findOne({
          _id: nextItemId,
          owner: LIVE_AUCTION_OWNER_ID,
          status: "claimed",
        })
      : Promise.resolve(null),
  ]);
  if (!currentItem || (nextItemId && !nextItem)) {
    await releaseLiveAuctionLock(database, token);
    throw new LiveAuctionError("A live-auction item is unavailable.");
  }
  let nextState: LiveAuctionState;
  try {
    nextState = getAdvancedLiveAuctionState(locked, nextItem, {
      updatedBy,
    });
  } catch (error) {
    await releaseLiveAuctionLock(database, token);
    throw error;
  }

  if (nextItem) {
    const activated = await database.collection<GameItem>("items").updateOne(
      {
        _id: nextItem._id,
        owner: LIVE_AUCTION_OWNER_ID,
        status: "claimed",
      },
      { $set: { status: "auctioned" } },
    );
    if (activated.modifiedCount !== 1) {
      await releaseLiveAuctionLock(database, token);
      throw new LiveAuctionError("The next buffered item changed.");
    }
  }

  const acceptedAt = new Date().toISOString();
  const transferred = await database.collection<LiveAuctionItem>("items").updateOne(
    {
      _id: currentItem._id,
      owner: LIVE_AUCTION_OWNER_ID,
      status: "auctioned",
    },
    {
      $set: {
        owner: winnerId,
        status: "event_settlement_pending",
        tags: [],
        date_received: acceptedAt,
        "authenticity.identified": true,
        "authenticity.fee": locked.current_bid,
        "authenticity.liability_pending": false,
        live_auction_settlement_id: token,
      },
      $push: {
        transaction_history: {
          type: "auction",
          from_owner: LIVE_AUCTION_OWNER_ID,
          to_owner: winnerId,
          occurred_at: acceptedAt,
          source: "live auction",
          amount: locked.current_bid,
        },
      },
    },
  );
  if (transferred.modifiedCount !== 1) {
    await restoreNextLiveAuctionItem(database, nextItem);
    await releaseLiveAuctionLock(database, token);
    throw new LiveAuctionError("The current item changed before acceptance.");
  }

  const stats = await database.collection<LiveAuctionPlayer>("players").updateOne(
    {
      _id: winnerId,
      "profile.live_auction_settlement_ids": { $ne: token },
    },
    {
      $inc: {
        "profile.playthrough_stats.items_collected": 1,
        "profile.playthrough_stats.money_spent": locked.current_bid,
      },
      $addToSet: { "profile.live_auction_settlement_ids": token },
    },
  );
  if (stats.modifiedCount !== 1) {
    await database.collection<GameItem>("items").replaceOne(
      {
        _id: currentItem._id,
        owner: winnerId,
        status: "event_settlement_pending",
      },
      currentItem,
    );
    await restoreNextLiveAuctionItem(database, nextItem);
    await releaseLiveAuctionLock(database, token);
    throw new LiveAuctionError("The winning player is unavailable.");
  }
  const winnerTitle = await getItemTitle(database, currentItem);

  const finalized = await database.collection<LiveAuctionState>("metadata").updateOne(
    { _id: LIVE_AUCTION_STATE_ID, "lock.token": token },
    {
      $set: {
        live: nextState.live,
        hidden: nextState.hidden,
        buffer_item_ids: nextState.buffer_item_ids,
        current_item_id: nextState.current_item_id,
        current_bid: nextState.current_bid,
        minimum_bid: nextState.minimum_bid,
        increment: nextState.increment,
        winner_id: null,
        winner_name: null,
        pending_winner_notifications: [
          ...(locked.pending_winner_notifications ?? []),
          {
            id: token,
            player_id: winnerId,
            item_id: currentItem._id,
            title: winnerTitle,
            amount: locked.current_bid,
          },
        ],
        updated_at: nextState.updated_at,
        updated_by: updatedBy,
      },
      $unset: { lock: "", pending_winner_notification: "" },
      $inc: { version: 1 },
    },
  );
  if (finalized.modifiedCount !== 1) {
    await database.collection<LiveAuctionPlayer>("players").updateOne(
      { _id: winnerId },
      {
        $inc: {
          "profile.playthrough_stats.items_collected": -1,
          "profile.playthrough_stats.money_spent": -locked.current_bid,
        },
        $pull: { "profile.live_auction_settlement_ids": token },
      },
    );
    await database.collection<GameItem>("items").replaceOne(
      {
        _id: currentItem._id,
        owner: winnerId,
        status: "event_settlement_pending",
      },
      currentItem,
    );
    await restoreNextLiveAuctionItem(database, nextItem);
    throw new LiveAuctionError("The live auction changed during acceptance.");
  }

  await recordEconomyMetricsSafely(database, {
    amount: currentItem.values.actual,
    currency: "items",
    direction: "acquired",
    source: "live-auction-win",
  });
  try {
    await deliverLiveAuctionWinnerNotification(database);
  } catch (error) {
    console.error(
      "Unable to immediately deliver a live-auction winner notification",
      error,
    );
  }
}

export async function stopLiveAuction(
  database: Db,
  updatedBy: string,
): Promise<void> {
  await reconcileLiveAuctionState(database);
  const locked = await acquireLiveAuctionLock(database, "stop", { live: true });
  const token = locked.lock!.token;
  const currentItem = locked.current_item_id
    ? await database.collection<GameItem>("items").findOne({
        _id: locked.current_item_id,
        owner: LIVE_AUCTION_OWNER_ID,
        status: "auctioned",
      })
    : null;
  if (locked.current_item_id && !currentItem) {
    await releaseLiveAuctionLock(database, token);
    throw new LiveAuctionError("The current live-auction item is unavailable.");
  }

  if (currentItem) {
    const restored = await database.collection<GameItem>("items").updateOne(
      {
        _id: currentItem._id,
        owner: LIVE_AUCTION_OWNER_ID,
        status: "auctioned",
      },
      { $set: { status: "claimed" } },
    );
    if (restored.modifiedCount !== 1) {
      await releaseLiveAuctionLock(database, token);
      throw new LiveAuctionError("The current item changed before stopping.");
    }
  }

  const nextBuffer = currentItem
    ? [currentItem._id, ...locked.buffer_item_ids]
    : locked.buffer_item_ids;
  const stopRefund = locked.winner_id
    ? {
        id: `live-auction-stop:${token}`,
        player_id: locked.winner_id,
        amount: locked.current_bid,
      }
    : null;
  const finalized = await database.collection<LiveAuctionState>("metadata").updateOne(
    { _id: LIVE_AUCTION_STATE_ID, "lock.token": token },
    {
      $set: {
        live: false,
        hidden: true,
        buffer_item_ids: nextBuffer,
        current_item_id: null,
        current_bid: 0,
        minimum_bid: 0,
        increment: 1,
        winner_id: null,
        winner_name: null,
        pending_refunds: [
          ...(Array.isArray(locked.pending_refunds)
            ? locked.pending_refunds
            : []),
          ...(stopRefund ? [stopRefund] : []),
        ],
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      },
      $unset: { lock: "" },
      $inc: { version: 1 },
    },
  );
  if (finalized.modifiedCount !== 1) {
    if (currentItem) {
      await database.collection<GameItem>("items").updateOne(
        { _id: currentItem._id, status: "claimed" },
        { $set: { status: "auctioned" } },
      );
    }
    throw new LiveAuctionError("The live auction changed before it could stop.");
  }
  if (stopRefund) {
    try {
      await reconcileLiveAuctionRefunds(database);
    } catch (error) {
      console.error("Unable to immediately reconcile a live-auction stop refund", error);
    }
  }
}

async function reconcileLiveAuctionState(database: Db): Promise<void> {
  await reconcileLiveAuctionRefunds(database);
  const state = await ensureLiveAuctionState(database);
  const lock = state.lock;
  if (lock && lock.expires_at <= new Date().toISOString()) {
    const recoveryToken = randomUUID();
    const claimed = await database
      .collection<LiveAuctionState>("metadata")
      .findOneAndUpdate(
        {
          _id: LIVE_AUCTION_STATE_ID,
          "lock.token": lock.token,
          "lock.expires_at": { $lte: new Date().toISOString() },
        },
        {
          $set: {
            "lock.token": recoveryToken,
            "lock.operation_token": lock.operation_token ?? lock.token,
            "lock.expires_at": new Date(
              Date.now() + LIVE_AUCTION_LOCK_MS,
            ).toISOString(),
          },
        },
        { returnDocument: "after" },
      );
    if (claimed?.lock) {
      const normalized = normalizeLiveAuctionState(claimed);
      if (claimed.lock.action === "bid") {
        await reconcileInterruptedLiveAuctionBid(database, normalized);
      } else if (
        claimed.lock.action === "start" ||
        claimed.lock.action === "stop"
      ) {
        await reconcileInterruptedLiveAuctionTransition(database, normalized);
      } else if (claimed.lock.action === "accept") {
        await reconcileInterruptedLiveAuctionAcceptance(database, normalized);
      }
    }
  }
  try {
    await deliverLiveAuctionWinnerNotification(database);
  } catch (error) {
    console.error("Unable to deliver a live-auction winner notification", error);
  }
}

async function reconcileInterruptedLiveAuctionBid(
  database: Db,
  state: LiveAuctionState,
): Promise<void> {
  const lock = state.lock;
  if (!lock || lock.action !== "bid") return;
  const operationToken = lock.operation_token ?? lock.token;
  if (lock.player_id && lock.charge) {
    await refundLiveAuctionBidCharge(
      database,
      operationToken,
      lock.player_id,
      lock.charge,
    );
  }
  await releaseLiveAuctionLock(database, lock.token);
}

async function reconcileInterruptedLiveAuctionTransition(
  database: Db,
  state: LiveAuctionState,
): Promise<void> {
  const lock = state.lock;
  if (!lock || (lock.action !== "start" && lock.action !== "stop")) return;
  const operationToken = lock.operation_token ?? lock.token;
  const itemId =
    lock.action === "start"
      ? state.buffer_item_ids[0] ?? null
      : state.current_item_id;
  if (itemId) {
    const item = await database.collection<GameItem>("items").findOne({
      _id: itemId,
      owner: LIVE_AUCTION_OWNER_ID,
    });
    if (!item) {
      throw new Error(
        `Interrupted live-auction ${lock.action} ${operationToken} lost its item.`,
      );
    }
    const interruptedStatus = lock.action === "start" ? "auctioned" : "claimed";
    const restoredStatus = lock.action === "start" ? "claimed" : "auctioned";
    if (item.status === interruptedStatus) {
      const restored = await database.collection<GameItem>("items").updateOne(
        {
          _id: itemId,
          owner: LIVE_AUCTION_OWNER_ID,
          status: interruptedStatus,
        },
        { $set: { status: restoredStatus } },
      );
      if (restored.modifiedCount !== 1) {
        throw new Error(
          `Interrupted live-auction ${lock.action} ${operationToken} could not restore its item.`,
        );
      }
    } else if (item.status !== restoredStatus) {
      throw new Error(
        `Interrupted live-auction ${lock.action} ${operationToken} found an invalid item state.`,
      );
    }
  }
  await releaseLiveAuctionLock(database, lock.token);
}

async function refundLiveAuctionBidCharge(
  database: Db,
  token: string,
  playerId: string,
  charge: number,
): Promise<void> {
  const refunded = await database
    .collection<LiveAuctionPlayer>("players")
    .updateOne(
      {
        _id: playerId,
        "profile.live_auction_bid_operation_ids": token,
      },
      {
        $inc: { "profile.bank_balance": charge },
        $pull: { "profile.live_auction_bid_operation_ids": token },
      },
    );
  if (refunded.matchedCount === 0) {
    const player = await database
      .collection<LiveAuctionPlayer>("players")
      .findOne({ _id: playerId });
    if (!player) {
      throw new Error(
        `Interrupted live-auction bid ${token} lost player ${playerId}.`,
      );
    }
  }
}

async function reconcileLiveAuctionRefunds(database: Db): Promise<void> {
  const state = await ensureLiveAuctionState(database);
  const players = database.collection<LiveAuctionPlayer>("players");
  for (const refund of state.pending_refunds ?? []) {
    const refunded = await players.updateOne(
        {
          _id: refund.player_id,
          "profile.live_auction_refund_receipt": { $exists: false },
          "profile.live_auction_refund_ids": { $ne: refund.id },
        },
        {
          $inc: { "profile.bank_balance": refund.amount },
          $set: {
            "profile.live_auction_refund_receipt": {
              id: refund.id,
              credited_at: new Date().toISOString(),
            },
          },
        },
      );
    if (refunded.modifiedCount === 0) {
      const player = await players.findOne({ _id: refund.player_id });
      if (!player) {
        console.error(
          `Unable to reconcile live-auction refund ${refund.id}: player ${refund.player_id} is unavailable.`,
        );
        continue;
      }
      const alreadyCredited =
        player.profile.live_auction_refund_receipt?.id === refund.id ||
        player.profile.live_auction_refund_ids?.includes(refund.id);
      if (!alreadyCredited) continue;
    }
    const removed = await database
      .collection<LiveAuctionState>("metadata")
      .updateOne(
        {
          _id: LIVE_AUCTION_STATE_ID,
          "pending_refunds.id": refund.id,
        },
        {
          $pull: { pending_refunds: { id: refund.id } },
          $inc: { version: 1 },
        },
      );
    if (removed.modifiedCount === 1) {
      await Promise.all([
        players.updateOne(
          {
            _id: refund.player_id,
            "profile.live_auction_refund_receipt.id": refund.id,
          },
          { $unset: { "profile.live_auction_refund_receipt": "" } },
        ),
        players.updateOne(
          { _id: refund.player_id },
          { $pull: { "profile.live_auction_refund_ids": refund.id } },
        ),
      ]);
    }
    if (removed.modifiedCount === 1 && refunded.modifiedCount === 1) {
      await recordEconomyMetricsSafely(database, {
        amount: refund.amount,
        currency: "money",
        direction: "earned",
        source: "live-auction-refund",
      });
    }
  }
  await cleanupLiveAuctionRefundMarkers(database);
}

async function cleanupLiveAuctionRefundMarkers(database: Db): Promise<void> {
  const state = await ensureLiveAuctionState(database);
  const pendingIds = (state.pending_refunds ?? []).map((refund) => refund.id);
  const players = database.collection<LiveAuctionPlayer>("players");
  await players.updateMany(
    {
      "profile.live_auction_refund_receipt.id":
        pendingIds.length > 0 ? { $nin: pendingIds } : { $exists: true },
    },
    { $unset: { "profile.live_auction_refund_receipt": "" } },
  );
  await players.updateMany(
    pendingIds.length > 0
      ? { "profile.live_auction_refund_ids": { $nin: pendingIds } }
      : { "profile.live_auction_refund_ids": { $exists: true } },
    { $unset: { "profile.live_auction_refund_ids": "" } },
  );
}

async function reconcileInterruptedLiveAuctionAcceptance(
  database: Db,
  state: LiveAuctionState,
  now = new Date(),
): Promise<void> {
  const lock = state.lock;
  if (
    lock?.action !== "accept" ||
    !state.current_item_id ||
    !state.winner_id
  ) {
    return;
  }
  const operationToken = lock.operation_token ?? lock.token;
  const currentItem = await database
    .collection<LiveAuctionItem>("items")
    .findOne({ _id: state.current_item_id });
  const nextItemId = state.buffer_item_ids[0] ?? null;
  const nextItem = nextItemId
    ? await database
        .collection<GameItem>("items")
        .findOne({ _id: nextItemId, owner: LIVE_AUCTION_OWNER_ID })
    : null;
  if (
    currentItem?.owner === LIVE_AUCTION_OWNER_ID &&
    currentItem.status === "auctioned"
  ) {
    if (nextItem?.status === "auctioned") {
      await restoreNextLiveAuctionItem(database, nextItem);
    }
    await releaseLiveAuctionLock(database, lock.token);
    return;
  }
  if (
    !currentItem ||
    currentItem.owner !== state.winner_id ||
    !["event_settlement_pending", "claimed"].includes(currentItem.status)
  ) {
    throw new Error(
      `Live-auction acceptance ${operationToken} cannot be reconciled automatically.`,
    );
  }
  if (nextItemId && !nextItem) {
    throw new Error(
      `Live-auction acceptance ${operationToken} lost its next buffered item.`,
    );
  }
  if (nextItem?.status === "claimed") {
    const activated = await database.collection<GameItem>("items").updateOne(
      {
        _id: nextItem._id,
        owner: LIVE_AUCTION_OWNER_ID,
        status: "claimed",
      },
      { $set: { status: "auctioned" } },
    );
    if (activated.modifiedCount !== 1) {
      throw new Error(
        `Live-auction acceptance ${operationToken} could not activate its next item.`,
      );
    }
  } else if (nextItem && nextItem.status !== "auctioned") {
    throw new Error(
      `Live-auction acceptance ${operationToken} found an invalid next-item state.`,
    );
  }

  const stats = await database
    .collection<LiveAuctionPlayer>("players")
    .updateOne(
      {
        _id: state.winner_id,
        "profile.live_auction_settlement_ids": { $ne: operationToken },
      },
      {
        $inc: {
          "profile.playthrough_stats.items_collected": 1,
          "profile.playthrough_stats.money_spent": state.current_bid,
        },
        $addToSet: {
          "profile.live_auction_settlement_ids": operationToken,
        },
      },
    );
  if (stats.matchedCount === 0) {
    const winner = await database
      .collection<LiveAuctionPlayer>("players")
      .findOne({ _id: state.winner_id });
    if (!winner) {
      throw new Error(
        `Live-auction acceptance ${operationToken} lost its winning player.`,
      );
    }
  }
  const nextState = getAdvancedLiveAuctionState(state, nextItem, {
    now,
    updatedBy: "system:recovery",
  });
  const title = await getItemTitle(database, currentItem);
  const finalized = await database
    .collection<LiveAuctionState>("metadata")
    .updateOne(
      { _id: LIVE_AUCTION_STATE_ID, "lock.token": lock.token },
      {
        $set: {
          live: nextState.live,
          hidden: true,
          buffer_item_ids: nextState.buffer_item_ids,
          current_item_id: nextState.current_item_id,
          current_bid: nextState.current_bid,
          minimum_bid: nextState.minimum_bid,
          increment: nextState.increment,
          winner_id: null,
          winner_name: null,
          pending_winner_notifications: [
            ...(state.pending_winner_notifications ?? []),
            {
              id: operationToken,
              player_id: state.winner_id,
              item_id: currentItem._id,
              title,
              amount: state.current_bid,
            },
          ],
          updated_at: now.toISOString(),
          updated_by: "system:recovery",
        },
        $unset: { lock: "", pending_winner_notification: "" },
        $inc: { version: 1 },
      },
    );
  if (finalized.modifiedCount !== 1) return;
}

async function deliverLiveAuctionWinnerNotification(
  database: Db,
): Promise<void> {
  const state = await ensureLiveAuctionState(database);
  for (const pending of state.pending_winner_notifications ?? []) {
    await database.collection<LiveAuctionItem>("items").updateOne(
      {
        _id: pending.item_id,
        owner: pending.player_id,
        live_auction_settlement_id: pending.id,
      },
      {
        $set: { status: "claimed" },
        $unset: { live_auction_settlement_id: "" },
      },
    );
    await createPlayerNotification(database, pending.player_id, {
      kind: "success",
      message: `You won ${pending.title} for $${pending.amount.toLocaleString()} in the live auction.`,
      action: { href: "/play?section=collection", label: "View collection" },
      notificationId: `live-auction-winner:${pending.id}`,
    });
    await database.collection<LiveAuctionPlayer>("players").updateOne(
      { _id: pending.player_id },
      { $pull: { "profile.live_auction_settlement_ids": pending.id } },
    );
    await database.collection<LiveAuctionState>("metadata").updateOne(
      {
        _id: LIVE_AUCTION_STATE_ID,
        $or: [
          { "pending_winner_notifications.id": pending.id },
          { "pending_winner_notification.id": pending.id },
        ],
      },
      {
        $pull: { pending_winner_notifications: { id: pending.id } },
        $unset: { pending_winner_notification: "" },
      },
    );
  }
}

function normalizeLiveAuctionState(
  state: LiveAuctionState,
): LiveAuctionState {
  return {
    ...createInitialLiveAuctionState(
      new Date(state.updated_at || Date.now()),
      state.updated_by || "system",
    ),
    ...state,
    stream_url: normalizeStoredTwitchStreamUrl(state.stream_url),
    buffer_item_ids: Array.isArray(state.buffer_item_ids)
      ? state.buffer_item_ids
      : [],
    pending_refunds: Array.isArray(state.pending_refunds)
      ? state.pending_refunds
      : [],
    pending_winner_notifications: Array.isArray(
      state.pending_winner_notifications,
    )
      ? state.pending_winner_notifications
      : state.pending_winner_notification
        ? [state.pending_winner_notification]
        : [],
    version: Number.isSafeInteger(state.version) ? state.version : 0,
    configured_increment:
      Number.isSafeInteger(state.configured_increment) &&
      state.configured_increment > 0
        ? state.configured_increment
        : Number.isSafeInteger(state.increment) && state.increment > 0
          ? state.increment
          : 1,
  };
}

export function normalizeTwitchStreamUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length > 2048) {
    throw new LiveAuctionError("The stream URL is too long.", 400);
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      throw new Error("Twitch embeds require HTTPS");
    }
    const hostname = parsed.hostname.toLowerCase();
    const channel =
      hostname === "player.twitch.tv"
        ? parsed.searchParams.get("channel")
        : hostname === "twitch.tv" || hostname === "www.twitch.tv"
          ? parsed.pathname.split("/").filter(Boolean)[0]
          : null;
    if (!channel || !/^[a-zA-Z0-9_]{1,25}$/.test(channel)) {
      throw new Error("Missing Twitch channel");
    }
    return `https://www.twitch.tv/${channel.toLowerCase()}`;
  } catch {
    throw new LiveAuctionError(
      "Provide a Twitch channel URL or Twitch player embed URL.",
      400,
    );
  }
}

function normalizeStoredTwitchStreamUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    return normalizeTwitchStreamUrl(value);
  } catch {
    return "";
  }
}

async function acquireLiveAuctionLock(
  database: Db,
  action: LiveAuctionLock["action"],
  conditions: Filter<LiveAuctionState>,
): Promise<LiveAuctionState> {
  await ensureLiveAuctionState(database);
  const now = new Date();
  const lock: LiveAuctionLock = {
    token: randomUUID(),
    action,
    expires_at: new Date(now.getTime() + LIVE_AUCTION_LOCK_MS).toISOString(),
  };
  const state = await database.collection<LiveAuctionState>("metadata").findOneAndUpdate(
    {
      _id: LIVE_AUCTION_STATE_ID,
      ...conditions,
      $or: [
        { lock: { $exists: false } },
        { "lock.expires_at": { $lte: now.toISOString() } },
      ],
    },
    {
      $set: { lock, updated_at: now.toISOString() },
      $inc: { version: 1 },
    },
    { returnDocument: "after" },
  );
  if (!state) {
    const current = await ensureLiveAuctionState(database);
    if (current.lock) {
      throw new LiveAuctionError("The live auction is busy. Try again.");
    }
    if (action === "start") {
      throw new LiveAuctionError(
        current.live
          ? "The live auction has already started."
          : "Add an item to the buffer before starting.",
      );
    }
    if (action === "accept") {
      throw new LiveAuctionError("A winning bid is required.");
    }
    throw new LiveAuctionError("The live auction is not running.");
  }
  return normalizeLiveAuctionState(state);
}

async function releaseLiveAuctionLock(database: Db, token: string) {
  await database.collection<LiveAuctionState>("metadata").updateOne(
    { _id: LIVE_AUCTION_STATE_ID, "lock.token": token },
    { $unset: { lock: "" }, $inc: { version: 1 } },
  );
}

async function restoreNextLiveAuctionItem(
  database: Db,
  nextItem: GameItem | null,
) {
  if (!nextItem) return;
  await database.collection<GameItem>("items").updateOne(
    {
      _id: nextItem._id,
      owner: LIVE_AUCTION_OWNER_ID,
      status: "auctioned",
    },
    { $set: { status: "claimed" } },
  );
}

async function getItemTitle(database: Db, item: GameItem): Promise<string> {
  const [hydrated] = await hydrateGameItems(database, [item]);
  return hydrated?.artwork.title ?? "the live-auction item";
}
