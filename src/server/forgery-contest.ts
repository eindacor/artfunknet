import { randomUUID } from "node:crypto";

import type { Db } from "mongodb";

import { getArtworkEffect } from "./artwork-effects.ts";
import { deleteCommunityReactions } from "./community-reaction-cleanup.ts";
import {
  getDailyEventDayIndex,
  getMostRecentDailyEventAt,
  getNextDailyEventAt,
} from "./daily-event-time.ts";
import { getForgeryContestSchedule, type ForgeryContestPhase } from "./forgery-contest-schedule.ts";
import { recordEconomyMetricsSafely } from "./economy-metrics.ts";
import { getGameplaySettings, type GameplayConfig } from "./game-settings.ts";
import {
  calculateItemValues,
  generateDailyDrop,
  getItemAttributes,
  type Artwork,
  type ArtworkRarity,
  type GameItem,
  type ItemAttribute,
  type LootData,
} from "./gameplay.ts";
import { HALL_OF_FAME_OWNER_ID } from "./hall-of-fame.ts";
import {
  hydrateGameItems,
  type HydratedGameItem,
} from "./item-artwork.ts";
import { getItemDropChanceUpdate } from "./item-drop-chance.ts";
import { getRerollCost } from "./item-reroll.ts";
import { assignItemSerialNumbers, isOriginalItemConflict } from "./item-serials.ts";
import {
  createPlayerNotification,
  type PlayerNotification,
} from "./player-notifications.ts";

export const FORGERY_CONTEST_OWNER_ID = "system:forgery-contest";
export const FORGERY_CONTEST_STATE_ID = "forgery-contest-state";
export const FORGERY_CONTEST_DAY_INDEX = 2;
export const FORGERY_CONTEST_SETTLEMENT_HOUR = 12;
export const FORGERY_CONTEST_PRIZE_SOURCE = "duper tuesday prize";
const LEGACY_PRIZE_SOURCE = "forgery contest prize";
export const FORGERY_CONTEST_DEFAULT_BUFFER_COUNT = 2;

const ENTRY_PENDING_MILLISECONDS = 5 * 60 * 1000;
const SETTLEMENT_LOCK_MILLISECONDS = 10 * 60 * 1000;
const ORPHANED_PRIZE_GRACE_MILLISECONDS = 15 * 60 * 1000;
const PRIZE_RARITIES = ["legendary", "rare", "uncommon"] as const;
const PLACE_LABELS = ["1st", "2nd", "3rd"] as const;

export type ForgeryContestPlace = 1 | 2 | 3;

export type ForgeryContestPrize = {
  place: ForgeryContestPlace;
  item_id: string;
};

export type ForgeryContestPrizeView = {
  place: ForgeryContestPlace;
  item: HydratedGameItem;
};

export type ForgeryContestPrizeProperties = {
  artworkId: string;
  condition: number;
  itemLevel: number;
  foil: boolean;
  unlocked: boolean;
  mint: boolean;
  seasonal: boolean;
  cardRenderer: string;
};

export type ForgeryContestItemSnapshot = HydratedGameItem;

export type ForgeryContestWinner = {
  place: ForgeryContestPlace;
  player_id: string;
  player_screen_name: string;
  votes: number;
  won_at: string;
  money_reward?: number;
  entry_item_snapshot: ForgeryContestItemSnapshot;
  prize_item_snapshot: ForgeryContestItemSnapshot;
};

export type ForgeryContestState = {
  _id: typeof FORGERY_CONTEST_STATE_ID;
  cycle_id: string;
  next_settlement_at: string;
  prizes: ForgeryContestPrize[];
  buffer_prizes: ForgeryContestPrize[];
  last_winners: ForgeryContestWinner[];
  settlement_lock?: {
    token: string;
    cycle_id: string;
    expires_at: string;
  };
  pending_winner_notifications?: string;
  updated_at: string;
};

export type ForgeryContestEntry = {
  _id: string;
  cycle_id: string;
  player_id: string;
  item_id: string;
  submitted_at: string;
  pending: boolean;
  pending_until?: string;
};

export type ForgeryContestVote = {
  _id: string;
  cycle_id: string;
  player_id: string;
  entry_id: string;
  updated_at: string;
};

export type RankedForgeryContestEntry = {
  id: string;
  playerId: string;
  submittedAt: string;
  votes: number;
};

export type ForgeryContestEntryView = {
  id: string;
  playerId: string;
  playerScreenName: string;
  submittedAt: string;
  voteCount: number;
  viewerVoted: boolean;
  item: HydratedGameItem;
};

export type ForgeryContestPlayerView = {
  phase: ForgeryContestPhase;
  nextPhaseAt: string;
  settling: boolean;
  submissionsOpen: boolean;
  votingOpen: boolean;
  nextSettlementAt: string;
  prizes: ForgeryContestPrizeView[];
  currentEntry: Pick<ForgeryContestEntryView, "id"> | null;
  eligibleForgeries: HydratedGameItem[];
  entries: ForgeryContestEntryView[];
  viewerVoteEntryId: string | null;
  lastWinners: ForgeryContestWinner[];
};

export type ForgeryContestAdminView = {
  nextSettlementAt: string;
  prizes: ForgeryContestPrizeView[];
  bufferPrizes: ForgeryContestPrizeView[];
  minimumBufferCount: number;
};

export class ForgeryContestError extends Error {
  readonly status: number;

  constructor(
    message: string,
    status = 409,
  ) {
    super(message);
    this.name = "ForgeryContestError";
    this.status = status;
  }
}

type ContestPlayer = {
  _id: string;
  screen_name: string;
  active?: boolean;
  profile?: {
    bank_balance?: number;
    forgery_contest_reward_ids?: string[];
  };
};

type ContestHeldGameItem = GameItem & {
  forgery_contest?: {
    cycle_id: string;
    entry_id: string;
    original_owner: string;
  };
  forgery_contest_settlement_id?: string;
};

const indexPromises = new WeakMap<Db, Promise<void>>();

export function isForgeryContestActionDay(now = new Date()): boolean {
  return getDailyEventDayIndex(now) === FORGERY_CONTEST_DAY_INDEX;
}

export function getForgeryContestNextSettlementAt(now = new Date()): Date {
  return getNextDailyEventAt(
    FORGERY_CONTEST_DAY_INDEX,
    FORGERY_CONTEST_SETTLEMENT_HOUR,
    now,
  );
}

export function getForgeryContestFollowingSettlementAt(
  cycleId: string,
  now = new Date(),
): Date {
  const cycleTime = new Date(cycleId).getTime();
  const referenceTime = Number.isFinite(cycleTime)
    ? Math.max(cycleTime, now.getTime())
    : now.getTime();
  return getForgeryContestNextSettlementAt(new Date(referenceTime + 1_000));
}

export function getForgeryContestMoneyReward(
  place: ForgeryContestPlace,
  estimatedValue: number,
): number {
  const value = Math.max(0, Math.floor(estimatedValue));
  if (place === 1) return value;
  if (place === 2) return Math.floor(value / 2);
  return 0;
}

export function getForgeryContestSubmissionPermission({
  alreadyEntered,
  itemEligible,
}: {
  alreadyEntered: boolean;
  itemEligible: boolean;
}): { allowed: true } | { allowed: false; reason: string } {
  if (alreadyEntered) {
    return {
      allowed: false,
      reason: "You have already submitted a forgery for this Duper Tuesday round.",
    };
  }
  if (!itemEligible) {
    return {
      allowed: false,
      reason: "Choose an owned, claimed, identified forgery.",
    };
  }
  return { allowed: true };
}

export function getForgeryContestVotePermission({
  entryExists,
  ownsEntry,
}: {
  entryExists: boolean;
  ownsEntry: boolean;
}): { allowed: true } | { allowed: false; reason: string } {
  if (!entryExists) {
    return {
      allowed: false,
      reason: "That Duper Tuesday entry is no longer available.",
    };
  }
  if (ownsEntry) {
    return {
      allowed: false,
      reason: "You cannot vote for your own Duper Tuesday entry.",
    };
  }
  return { allowed: true };
}

export function rankForgeryContestEntries<
  T extends RankedForgeryContestEntry,
>(entries: readonly T[]): T[] {
  return [...entries].sort(
    (left, right) =>
      right.votes - left.votes ||
      left.submittedAt.localeCompare(right.submittedAt) ||
      left.id.localeCompare(right.id),
  );
}

export async function getForgeryContestPlayerView(
  database: Db,
  playerId: string,
  now = new Date(),
): Promise<ForgeryContestPlayerView> {
  const state = await settleForgeryContestIfDue(database, now);
  await cleanupContestDocuments(database, state, now);
  const schedule = getForgeryContestSchedule(now);
  const settling = hasActiveSettlementLock(state, now);

  const [entries, votes, eligibleItems, prizes, currentEntry] = await Promise.all([
    schedule.votingOpen ? database
      .collection<ForgeryContestEntry>("forgery_contest_entries")
      .find({ cycle_id: state.cycle_id, pending: false })
      .sort({ submitted_at: 1, _id: 1 })
      .toArray() : [],
    schedule.votingOpen ? database
      .collection<ForgeryContestVote>("forgery_contest_votes")
      .find({ cycle_id: state.cycle_id })
      .toArray() : [],
    schedule.submissionsOpen ? database
      .collection<GameItem>("items")
      .find({
        owner: playerId,
        status: "claimed",
        "authenticity.forgery": true,
        "authenticity.identified": true,
      })
      .sort({ date_received: -1, _id: 1 })
      .toArray() : [],
    hydrateContestPrizes(database, state.prizes),
    database.collection<ForgeryContestEntry>("forgery_contest_entries")
      .findOne({ cycle_id: state.cycle_id, player_id: playerId, pending: false }),
  ]);

  const entryItems = await database
    .collection<GameItem>("items")
    .find({ _id: { $in: entries.map((entry) => entry.item_id) } })
    .toArray();
  if (entryItems.length !== entries.length) {
    throw new Error("One or more Duper Tuesday entries are unavailable.");
  }

  const [hydratedEntryItems, hydratedEligibleItems, players] =
    await Promise.all([
      hydrateGameItems(database, entryItems),
      hydrateGameItems(database, eligibleItems),
      database
        .collection<ContestPlayer>("players")
        .find({ _id: { $in: entries.map((entry) => entry.player_id) } })
        .project<ContestPlayer>({ _id: 1, screen_name: 1 })
        .toArray(),
    ]);
  const itemById = new Map(
    hydratedEntryItems.map((item) => [
      item._id,
      stripContestHoldMetadata(item),
    ]),
  );
  const playerById = new Map(players.map((player) => [player._id, player]));
  const voteCountByEntryId = new Map<string, number>();
  for (const vote of votes) {
    voteCountByEntryId.set(
      vote.entry_id,
      (voteCountByEntryId.get(vote.entry_id) ?? 0) + 1,
    );
  }
  const viewerVote =
    votes.find((vote) => vote.player_id === playerId)?.entry_id ?? null;
  const entryViews = entries.map((entry): ForgeryContestEntryView => {
    const item = itemById.get(entry.item_id);
    if (!item) {
      throw new Error(`Duper Tuesday item ${entry.item_id} is unavailable.`);
    }
    return {
      id: entry._id,
      playerId: entry.player_id,
      playerScreenName:
        playerById.get(entry.player_id)?.screen_name ?? "[redacted]",
      submittedAt: entry.submitted_at,
      voteCount: voteCountByEntryId.get(entry._id) ?? 0,
      viewerVoted: viewerVote === entry._id,
      item,
    };
  });

  return {
    ...schedule,
    settling,
    submissionsOpen: schedule.submissionsOpen && !settling,
    votingOpen: schedule.votingOpen && !settling,
    nextSettlementAt: state.next_settlement_at,
    prizes,
    currentEntry: currentEntry ? { id: currentEntry._id } : null,
    eligibleForgeries: hydratedEligibleItems,
    entries: entryViews,
    viewerVoteEntryId: viewerVote,
    lastWinners: schedule.phase === "results"
      ? state.last_winners.filter((winner) =>
        new Date(winner.won_at) >= getMostRecentDailyEventAt(2, 12, now) &&
        new Date(winner.won_at) <= now)
      : [],
  };
}

export async function submitForgeryContestEntry(
  database: Db,
  playerId: string,
  itemId: string,
  now = new Date(),
): Promise<void> {
  if (!getForgeryContestSchedule(now).submissionsOpen) {
    throw new ForgeryContestError(
      "Duper Tuesday entries are closed on Tuesdays. Submissions reopen Wednesday at 12am New York time.",
    );
  }
  const state = await settleForgeryContestIfDue(database, now);
  await cleanupContestDocuments(database, state, now);
  if (hasActiveSettlementLock(state, now)) {
    throw new ForgeryContestError(
      "Duper Tuesday settlement is currently in progress.",
    );
  }
  const entries = database.collection<ForgeryContestEntry>(
    "forgery_contest_entries",
  );
  const entryId = `${state.cycle_id}:${playerId}`;
  const [existingEntry, item] = await Promise.all([
    entries.findOne({ _id: entryId }),
    database.collection<ContestHeldGameItem>("items").findOne({
      _id: itemId,
      owner: playerId,
      status: "claimed",
      "authenticity.forgery": true,
      "authenticity.identified": true,
    }),
  ]);
  const permission = getForgeryContestSubmissionPermission({
    alreadyEntered: Boolean(existingEntry),
    itemEligible: Boolean(item),
  });
  if (!permission.allowed) {
    throw new ForgeryContestError(
      permission.reason,
      existingEntry ? 409 : item ? 403 : 400,
    );
  }
  if (!item) {
    throw new ForgeryContestError(
      "Choose an owned, claimed, identified forgery.",
      400,
    );
  }

  const submittedAt = now.toISOString();
  const entry: ForgeryContestEntry = {
    _id: entryId,
    cycle_id: state.cycle_id,
    player_id: playerId,
    item_id: item._id,
    submitted_at: submittedAt,
    pending: true,
    pending_until: new Date(
      now.getTime() + ENTRY_PENDING_MILLISECONDS,
    ).toISOString(),
  };
  try {
    await entries.insertOne(entry);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new ForgeryContestError(
        "You have already submitted a forgery for this Duper Tuesday round.",
      );
    }
    throw error;
  }

  const transferred = await database
    .collection<ContestHeldGameItem>("items")
    .updateOne(
      {
        _id: item._id,
        owner: playerId,
        status: "claimed",
        "authenticity.forgery": true,
        "authenticity.identified": true,
      },
      {
        $set: {
          owner: FORGERY_CONTEST_OWNER_ID,
          date_received: submittedAt,
          forgery_contest: {
            cycle_id: state.cycle_id,
            entry_id: entryId,
            original_owner: playerId,
          },
        },
        $push: {
          transaction_history: {
            type: "transfer",
            from_owner: playerId,
            to_owner: FORGERY_CONTEST_OWNER_ID,
            occurred_at: submittedAt,
            source: "duper tuesday submission",
          },
        },
      },
    );
  if (transferred.modifiedCount !== 1) {
    await entries.deleteOne({ _id: entryId, pending: true });
    throw new ForgeryContestError(
      "That forgery changed before it could be submitted.",
    );
  }

  const currentState = await database
    .collection<ForgeryContestState>("metadata")
    .findOne({ _id: FORGERY_CONTEST_STATE_ID });
  if (
    !currentState ||
    currentState.cycle_id !== state.cycle_id ||
    hasActiveSettlementLock(currentState, now)
  ) {
    await rollbackSubmittedItem(database, item, entryId);
    throw new ForgeryContestError(
      "Settlement began before the forgery could be submitted.",
    );
  }

  const activated = await entries.updateOne(
    { _id: entryId, pending: true },
    { $set: { pending: false }, $unset: { pending_until: "" } },
  );
  if (activated.modifiedCount !== 1) {
    await rollbackSubmittedItem(database, item, entryId);
    throw new Error(
      "The Duper Tuesday entry could not be activated and was restored.",
    );
  }
  const stateAfterActivation = await database
    .collection<ForgeryContestState>("metadata")
    .findOne({ _id: FORGERY_CONTEST_STATE_ID });
  if (
    !stateAfterActivation ||
    stateAfterActivation.cycle_id !== state.cycle_id ||
    hasActiveSettlementLock(stateAfterActivation, now)
  ) {
    await rollbackSubmittedItem(database, item, entryId);
    throw new ForgeryContestError(
      "Settlement began before the forgery could be submitted.",
    );
  }
}

export async function setForgeryContestVote(
  database: Db,
  playerId: string,
  entryId: string,
  now = new Date(),
): Promise<void> {
  if (!getForgeryContestSchedule(now).votingOpen) {
    throw new ForgeryContestError(
      "Duper Tuesday voting is only open Tuesday from 12am to noon New York time.",
    );
  }
  const state = await settleForgeryContestIfDue(database, now);
  if (hasActiveSettlementLock(state, now)) {
    throw new ForgeryContestError(
      "Duper Tuesday settlement is currently in progress.",
    );
  }
  const entry = await database
    .collection<ForgeryContestEntry>("forgery_contest_entries")
    .findOne({
      _id: entryId,
      cycle_id: state.cycle_id,
      pending: false,
    });
  const permission = getForgeryContestVotePermission({
    entryExists: Boolean(entry),
    ownsEntry: entry?.player_id === playerId,
  });
  if (!permission.allowed) {
    throw new ForgeryContestError(
      permission.reason,
      entry ? 403 : 404,
    );
  }

  const voteId = `${state.cycle_id}:${playerId}`;
  await database
    .collection<ForgeryContestVote>("forgery_contest_votes")
    .updateOne(
      { _id: voteId },
      {
        $set: {
          cycle_id: state.cycle_id,
          player_id: playerId,
          entry_id: entryId,
          updated_at: now.toISOString(),
        },
      },
      { upsert: true },
    );

  const currentState = await database
    .collection<ForgeryContestState>("metadata")
    .findOne({ _id: FORGERY_CONTEST_STATE_ID });
  if (
    !currentState ||
    currentState.cycle_id !== state.cycle_id ||
    hasActiveSettlementLock(currentState, now)
  ) {
    await database
      .collection<ForgeryContestVote>("forgery_contest_votes")
      .deleteOne({ _id: voteId, cycle_id: state.cycle_id });
    throw new ForgeryContestError(
      "Settlement began before your vote could be saved.",
    );
  }
}

export async function getForgeryContestAdminView(
  database: Db,
  now = new Date(),
): Promise<ForgeryContestAdminView> {
  const state = await settleForgeryContestIfDue(database, now);
  const [prizes, bufferPrizes] = await Promise.all([
    hydrateContestPrizes(database, state.prizes),
    hydrateContestPrizes(database, state.buffer_prizes ?? []),
  ]);
  return {
    nextSettlementAt: state.next_settlement_at,
    prizes,
    bufferPrizes,
    minimumBufferCount: FORGERY_CONTEST_DEFAULT_BUFFER_COUNT,
  };
}

async function hydrateContestPrizes(
  database: Db,
  prizes: ForgeryContestPrize[],
): Promise<ForgeryContestPrizeView[]> {
  const items = await database
    .collection<GameItem>("items")
    .find({ _id: { $in: prizes.map((prize) => prize.item_id) } })
    .toArray();
  if (items.length !== prizes.length) {
    throw new Error("One or more Duper Tuesday prizes are unavailable.");
  }
  const hydrated = await hydrateGameItems(database, items);
  const itemById = new Map(hydrated.map((item) => [item._id, item]));
  return prizes.map((prize) => {
    const item = itemById.get(prize.item_id);
    if (!item) {
      throw new Error(
        `Duper Tuesday prize ${prize.item_id} is unavailable.`,
      );
    }
    return { place: prize.place, item };
  });
}

export async function replaceForgeryContestPrize(
  database: Db,
  place: ForgeryContestPlace,
  now = new Date(),
): Promise<void> {
  await withContestPrizeLock(database, now, async (state, token) => {
    const currentPrize = state.prizes.find((prize) => prize.place === place);
    const replacement = state.buffer_prizes.find(
      (prize) => prize.place === place,
    );
    if (!currentPrize || !replacement) {
      throw new ForgeryContestError("That prize place is unavailable.", 404);
    }
    const config = (await getGameplaySettings(database)).active;
    const refill = await generateForgeryContestPrize(
      database, config, place, now,
    );
    const replaced = await database
      .collection<ForgeryContestState>("metadata")
      .updateOne(
        { _id: FORGERY_CONTEST_STATE_ID, "settlement_lock.token": token },
        {
          $set: {
            prizes: state.prizes.map((prize) =>
              prize.place === place ? replacement : prize,
            ),
            buffer_prizes: [
              ...state.buffer_prizes.filter(
                (prize) => prize.item_id !== replacement.item_id,
              ),
              { place, item_id: refill._id },
            ],
            updated_at: now.toISOString(),
          },
        },
      );
    if (replaced.modifiedCount !== 1) {
      await database.collection<GameItem>("items").deleteOne({
        _id: refill._id,
        owner: FORGERY_CONTEST_OWNER_ID,
      });
      throw new ForgeryContestError(
        "The Duper Tuesday prizes changed before replacement completed.",
      );
    }
    await database.collection<GameItem>("items").deleteOne({
      _id: currentPrize.item_id,
      owner: FORGERY_CONTEST_OWNER_ID,
    });
    await deleteCommunityReactions(database, "item", [currentPrize.item_id]);
  });
}

export async function createForgeryContestBufferedPrize(
  database: Db,
  place: ForgeryContestPlace,
  now = new Date(),
): Promise<void> {
  await withContestPrizeLock(database, now, async (state, token) => {
    if (state.buffer_prizes.filter((prize) => prize.place === place).length >=
      FORGERY_CONTEST_DEFAULT_BUFFER_COUNT) {
      throw new ForgeryContestError(
        `Each place is limited to ${FORGERY_CONTEST_DEFAULT_BUFFER_COUNT} buffered prizes.`,
      );
    }
    const config = (await getGameplaySettings(database)).active;
    const item = await generateForgeryContestPrize(database, config, place, now);
    const appended = await database
      .collection<ForgeryContestState>("metadata")
      .updateOne(
        { _id: FORGERY_CONTEST_STATE_ID, "settlement_lock.token": token },
        { $push: { buffer_prizes: { place, item_id: item._id } } },
      );
    if (appended.modifiedCount !== 1) {
      await database.collection<GameItem>("items").deleteOne({
        _id: item._id,
        owner: FORGERY_CONTEST_OWNER_ID,
      });
      throw new ForgeryContestError(
        "The Duper Tuesday buffer changed before the item could be added.",
      );
    }
  });
}

export async function removeForgeryContestBufferedPrize(
  database: Db,
  place: ForgeryContestPlace,
  itemId: string,
  now = new Date(),
): Promise<void> {
  await withContestPrizeLock(database, now, async (state, token) => {
    const buffer = state.buffer_prizes.filter((prize) => prize.place === place);
    if (!buffer.some((prize) => prize.item_id === itemId)) {
      throw new ForgeryContestError("Choose a buffered prize for this place.", 404);
    }
    if (buffer.length <= FORGERY_CONTEST_DEFAULT_BUFFER_COUNT) {
      throw new ForgeryContestError(
        `Each place must retain at least ${FORGERY_CONTEST_DEFAULT_BUFFER_COUNT} buffered prizes.`,
      );
    }
    const removed = await database
      .collection<ForgeryContestState>("metadata")
      .updateOne(
        { _id: FORGERY_CONTEST_STATE_ID, "settlement_lock.token": token },
        { $pull: { buffer_prizes: { place, item_id: itemId } } },
      );
    if (removed.modifiedCount !== 1) {
      throw new ForgeryContestError(
        "The Duper Tuesday buffer changed before the item could be removed.",
      );
    }
    await database.collection<GameItem>("items").deleteOne({
      _id: itemId,
      owner: FORGERY_CONTEST_OWNER_ID,
    });
    await deleteCommunityReactions(database, "item", [itemId]);
  });
}

export async function updateForgeryContestBufferedPrize(
  database: Db,
  place: ForgeryContestPlace,
  itemId: string,
  properties: ForgeryContestPrizeProperties,
  now = new Date(),
): Promise<HydratedGameItem> {
  return withContestPrizeLock(database, now, async (state) => {
    if (!state.buffer_prizes.some(
      (prize) => prize.place === place && prize.item_id === itemId,
    )) {
      throw new ForgeryContestError(
        "Only buffered prizes for this place can be edited.",
      );
    }
    const [item, artwork, metadata, attributes, settings] = await Promise.all([
      database.collection<GameItem>("items").findOne({
        _id: itemId, owner: FORGERY_CONTEST_OWNER_ID, status: "claimed",
      }),
      database.collection<Artwork>("artworks").findOne({
        _id: properties.artworkId, active: true,
      }),
      database.collection<{ _id: string; loot_data: LootData }>("metadata")
        .findOne({ _id: "loot-data" }),
      database.collection<ItemAttribute>("attributes")
        .find({ active: true }).toArray(),
      getGameplaySettings(database),
    ]);
    if (!item || !artwork || !metadata || attributes.length === 0) {
      throw new ForgeryContestError(
        "Duper Tuesday prize data is unavailable.", 404,
      );
    }
    const regenerateAttributes =
      item.artwork_id !== artwork._id || item.unlocked !== properties.unlocked;
    const nextItem: GameItem = {
      ...item,
      artwork_id: artwork._id,
      condition: properties.mint ? 1 : properties.condition,
      level: properties.itemLevel,
      foil: properties.foil,
      unlocked: properties.unlocked,
      mint: properties.mint,
      mint_value_multiplier: properties.mint ? settings.active.mintValueMultiplier : 1,
      seasonal: properties.seasonal,
      card_renderer: properties.cardRenderer,
      attributes: regenerateAttributes
        ? getItemAttributes(
            artwork, properties.unlocked, attributes,
            await getArtworkEffect(database, artwork),
          )
        : item.attributes,
      artwork_overrides:
        item.artwork_id === artwork._id ? item.artwork_overrides : undefined,
      misprint: item.artwork_id === artwork._id ? item.misprint : false,
    };
    Object.assign(
      nextItem, await getItemDropChanceUpdate(database, nextItem, artwork),
    );
    nextItem.values = calculateItemValues(
      nextItem, { ...artwork, ...nextItem.artwork_overrides }, metadata.loot_data,
    );
    nextItem.reroll_cost = getRerollCost(
      nextItem, artwork.rarity, metadata.loot_data,
    );
    if (item.artwork_id !== artwork._id) {
      await assignItemSerialNumbers(database, [nextItem]);
    }
    try {
      const updated = await database.collection<GameItem>("items").replaceOne(
        { _id: item._id, owner: FORGERY_CONTEST_OWNER_ID, status: "claimed" },
        nextItem,
      );
      if (updated.matchedCount !== 1) {
        throw new ForgeryContestError(
          "The buffered prize changed before it could be updated.",
        );
      }
    } catch (error) {
      if (isOriginalItemConflict(error)) {
        throw new ForgeryContestError(
          "That artwork already has an active Original item.",
        );
      }
      throw error;
    }
    const [hydrated] = await hydrateGameItems(database, [nextItem]);
    return hydrated;
  });
}

async function withContestPrizeLock<T>(
  database: Db,
  now: Date,
  operation: (state: ForgeryContestState, token: string) => Promise<T>,
): Promise<T> {
  const state = await settleForgeryContestIfDue(database, now);
  const token = randomUUID();
  const locked = await database
    .collection<ForgeryContestState>("metadata")
    .findOneAndUpdate(
      {
        _id: FORGERY_CONTEST_STATE_ID,
        cycle_id: state.cycle_id,
        $or: [
          { settlement_lock: { $exists: false } },
          { "settlement_lock.expires_at": { $lte: now.toISOString() } },
        ],
      },
      {
        $set: {
          settlement_lock: {
            token,
            cycle_id: state.cycle_id,
            expires_at: new Date(
              now.getTime() + SETTLEMENT_LOCK_MILLISECONDS,
            ).toISOString(),
          },
        },
      },
      { returnDocument: "after" },
    );
  if (!locked) {
    throw new ForgeryContestError(
      "Duper Tuesday prizes cannot be changed during settlement or another prize update.",
    );
  }
  try {
    return await operation(locked, token);
  } finally {
    await releaseSettlementLock(database, token);
  }
}

export async function settleForgeryContestIfDue(
  database: Db,
  now = new Date(),
): Promise<ForgeryContestState> {
  let state = await ensureForgeryContestState(database, now);
  state = await ensureWinnerMoneyRewards(database, state, now);
  await deliverPendingWinnerNotifications(database, state).catch((error) => {
    console.error(
      "Unable to deliver Duper Tuesday winner notifications",
      error,
    );
  });
  state =
    (await database
      .collection<ForgeryContestState>("metadata")
      .findOne({ _id: FORGERY_CONTEST_STATE_ID })) ?? state;
  await cleanupContestDocuments(database, state, now);
  if (new Date(state.next_settlement_at).getTime() > now.getTime()) {
    return state;
  }

  const token = randomUUID();
  const locked = await database
    .collection<ForgeryContestState>("metadata")
    .findOneAndUpdate(
      {
        _id: FORGERY_CONTEST_STATE_ID,
        cycle_id: state.cycle_id,
        next_settlement_at: { $lte: now.toISOString() },
        $or: [
          { settlement_lock: { $exists: false } },
          { "settlement_lock.expires_at": { $lte: now.toISOString() } },
        ],
      },
      {
        $set: {
          settlement_lock: {
            token,
            cycle_id: state.cycle_id,
            expires_at: new Date(
              now.getTime() + SETTLEMENT_LOCK_MILLISECONDS,
            ).toISOString(),
          },
          updated_at: now.toISOString(),
        },
      },
      { returnDocument: "after" },
    );
  if (!locked) {
    return (
      (await database
        .collection<ForgeryContestState>("metadata")
        .findOne({ _id: FORGERY_CONTEST_STATE_ID })) ?? state
    );
  }
  state = locked;

  const [entries, votes, prizeItems] = await Promise.all([
    database
      .collection<ForgeryContestEntry>("forgery_contest_entries")
      .find({ cycle_id: state.cycle_id, pending: false })
      .toArray(),
    database
      .collection<ForgeryContestVote>("forgery_contest_votes")
      .find({ cycle_id: state.cycle_id })
      .toArray(),
    database
      .collection<GameItem>("items")
      .find({ _id: { $in: state.prizes.map((prize) => prize.item_id) } })
      .toArray(),
  ]);
  const entryItems = await database
    .collection<GameItem>("items")
    .find({ _id: { $in: entries.map((entry) => entry.item_id) } })
    .toArray();
  if (
    entryItems.length !== entries.length ||
    prizeItems.length !== state.prizes.length
  ) {
    await releaseSettlementLock(database, token);
    throw new Error(
      "Duper Tuesday settlement stopped because an entry or prize disappeared.",
    );
  }

  const voteCountByEntryId = new Map<string, number>();
  for (const vote of votes) {
    voteCountByEntryId.set(
      vote.entry_id,
      (voteCountByEntryId.get(vote.entry_id) ?? 0) + 1,
    );
  }
  const activeEntries = entries.filter((entry) => !entry.pending);
  const ranked = rankForgeryContestEntries(
    activeEntries.map((entry) => ({
      id: entry._id,
      playerId: entry.player_id,
      submittedAt: entry.submitted_at,
      votes: voteCountByEntryId.get(entry._id) ?? 0,
    })),
  );
  const winningRanks = ranked.slice(0, PRIZE_RARITIES.length);
  const winningEntryByPlace = new Map(
    winningRanks.map((rank, index) => [
      (index + 1) as ForgeryContestPlace,
      rank,
    ]),
  );
  const playerIds = [...new Set(entries.map((entry) => entry.player_id))];
  const players = await database
    .collection<ContestPlayer>("players")
    .find({ _id: { $in: playerIds } })
    .project<ContestPlayer>({ _id: 1, screen_name: 1 })
    .toArray();
  const playerById = new Map(players.map((player) => [player._id, player]));
  const [hydratedEntryItems, hydratedPrizeItems] = await Promise.all([
    hydrateGameItems(database, entryItems),
    hydrateGameItems(database, prizeItems),
  ]);
  const entryItemById = new Map(
    hydratedEntryItems.map((item) => [item._id, item]),
  );
  const prizeItemById = new Map(
    hydratedPrizeItems.map((item) => [item._id, item]),
  );
  const entryById = new Map(entries.map((entry) => [entry._id, entry]));
  const config = (await getGameplaySettings(database)).active;
  const generatedPrizes: GameItem[] = [];
  const nextPrizes: ForgeryContestPrize[] = [];
  const nextBufferPrizes = [...state.buffer_prizes];
  const originalsToRestore: Array<{
    item: GameItem;
    expectedOwner: string;
  }> = [];
  let stateAdvanced = false;

  try {
    for (const place of [1, 2, 3] as const) {
      const index = nextBufferPrizes.findIndex((prize) => prize.place === place);
      if (index < 0) throw new Error(`The ${PLACE_LABELS[place - 1]} place prize buffer was exhausted.`);
      nextPrizes.push(...nextBufferPrizes.splice(index, 1));
      const refill = await generateForgeryContestPrize(database, config, place, now);
      generatedPrizes.push(refill);
      nextBufferPrizes.push({ place, item_id: refill._id });
    }

    for (const entry of entries) {
      const item = entryItems.find((candidate) => candidate._id === entry.item_id);
      if (!item) throw new Error(`Contest entry ${entry._id} lost its item.`);
      if (
        item.owner === FORGERY_CONTEST_OWNER_ID ||
        item.owner === entry.player_id
      ) {
        const transferred = await database
          .collection<ContestHeldGameItem>("items")
          .updateOne(
            { _id: item._id, owner: item.owner },
            {
              $set: {
                owner: HALL_OF_FAME_OWNER_ID,
                status: "claimed",
                date_received: now.toISOString(),
              },
              $unset: {
                forgery_contest: "",
                forgery_contest_settlement_id: "",
              },
              $push: {
                transaction_history: {
                  type: "transfer",
                  from_owner: item.owner,
                  to_owner: HALL_OF_FAME_OWNER_ID,
                  occurred_at: now.toISOString(),
                  source: "duper tuesday submission",
                },
              },
            },
          );
        if (transferred.modifiedCount !== 1) {
          throw new Error(
            `Contest item ${item._id} could not be transferred to Artfunkel Inc.`,
          );
        }
        originalsToRestore.push({
          item,
          expectedOwner: HALL_OF_FAME_OWNER_ID,
        });
      } else if (item.owner === HALL_OF_FAME_OWNER_ID) {
        await database.collection<ContestHeldGameItem>("items").updateOne(
          { _id: item._id, owner: HALL_OF_FAME_OWNER_ID },
          {
            $set: { status: "claimed" },
            $unset: {
              forgery_contest: "",
              forgery_contest_settlement_id: "",
            },
          },
        );
      } else {
        throw new Error(`Contest item ${item._id} has an unexpected owner.`);
      }
    }

    for (const prize of state.prizes) {
      const winner = winningEntryByPlace.get(prize.place);
      if (!winner) continue;
      const item = prizeItems.find(
        (candidate) => candidate._id === prize.item_id,
      );
      if (!item) throw new Error(`Contest prize ${prize.item_id} disappeared.`);
      if (item.owner === FORGERY_CONTEST_OWNER_ID) {
        const transferred = await database
          .collection<GameItem>("items")
          .updateOne(
            { _id: item._id, owner: FORGERY_CONTEST_OWNER_ID },
            {
              $set: {
                owner: winner.playerId,
                status: "event_settlement_pending",
                date_received: now.toISOString(),
                "authenticity.liable": winner.playerId,
                "authenticity.original_owner": winner.playerId,
                forgery_contest_settlement_id: state.cycle_id,
              },
              $push: {
                transaction_history: {
                  type: "transfer",
                  from_owner: FORGERY_CONTEST_OWNER_ID,
                  to_owner: winner.playerId,
                  occurred_at: now.toISOString(),
                  source: FORGERY_CONTEST_PRIZE_SOURCE,
                },
              },
            },
          );
        if (transferred.modifiedCount !== 1) {
          throw new Error(`Contest prize ${item._id} could not be awarded.`);
        }
        originalsToRestore.push({
          item,
          expectedOwner: winner.playerId,
        });
      } else if (item.owner !== winner.playerId) {
        throw new Error(`Contest prize ${item._id} has an unexpected owner.`);
      }
    }

    const winners: ForgeryContestWinner[] = winningRanks.map((rank, index) => {
      const place = (index + 1) as ForgeryContestPlace;
      const entry = entryById.get(rank.id);
      const prize = state.prizes.find((candidate) => candidate.place === place);
      const entryItem = entry ? entryItemById.get(entry.item_id) : undefined;
      const prizeItem = prize ? prizeItemById.get(prize.item_id) : undefined;
      if (!entry || !entryItem || !prizeItem) {
        throw new Error("Winner snapshots could not be prepared.");
      }
      return {
        place,
        player_id: rank.playerId,
        player_screen_name:
          playerById.get(rank.playerId)?.screen_name ?? "[redacted]",
        votes: rank.votes,
        won_at: now.toISOString(),
        money_reward: getForgeryContestMoneyReward(
          place,
          entryItem.values.actual,
        ),
        entry_item_snapshot: stripContestHoldMetadata(entryItem),
        prize_item_snapshot: prizeItem,
      };
    });
    const nextSettlement = getForgeryContestFollowingSettlementAt(
      state.cycle_id,
      now,
    );
    const advanced = await database
      .collection<ForgeryContestState>("metadata")
      .updateOne(
        {
          _id: FORGERY_CONTEST_STATE_ID,
          cycle_id: state.cycle_id,
          "settlement_lock.token": token,
          prizes: state.prizes,
        },
        {
          $set: {
            cycle_id: nextSettlement.toISOString(),
            next_settlement_at: nextSettlement.toISOString(),
            prizes: nextPrizes,
            buffer_prizes: nextBufferPrizes,
            last_winners: winners,
            ...(winners.length > 0
              ? { pending_winner_notifications: state.cycle_id }
              : {}),
            updated_at: now.toISOString(),
          },
          $unset: {
            settlement_lock: "",
            ...(winners.length === 0
              ? { pending_winner_notifications: "" }
              : {}),
          },
        },
      );
    if (advanced.modifiedCount !== 1) {
      throw new Error(
        "Duper Tuesday state changed before settlement could finish.",
      );
    }
    stateAdvanced = true;

    const cleanupResults = await Promise.allSettled([
      database
        .collection<ForgeryContestEntry>("forgery_contest_entries")
        .deleteMany({ cycle_id: state.cycle_id }),
      database
        .collection<ForgeryContestVote>("forgery_contest_votes")
        .deleteMany({ cycle_id: state.cycle_id }),
      ...state.prizes
        .filter((prize) => !winningEntryByPlace.has(prize.place))
        .map((prize) =>
          database.collection<GameItem>("items").deleteOne({
            _id: prize.item_id,
            owner: FORGERY_CONTEST_OWNER_ID,
          }),
        ),
    ]);
    for (const result of cleanupResults) {
      if (result.status === "rejected") {
        console.error("Duper Tuesday post-settlement cleanup failed", result.reason);
      }
    }
    const unawardedIds = state.prizes
      .filter((prize) => !winningEntryByPlace.has(prize.place))
      .map((prize) => prize.item_id);
    await deleteCommunityReactions(database, "item", unawardedIds).catch(
      (error) => {
        console.error(
          "Unable to clean reactions for old Duper Tuesday prizes",
          error,
        );
      },
    );
    const settled =
      (await database
        .collection<ForgeryContestState>("metadata")
        .findOne({ _id: FORGERY_CONTEST_STATE_ID })) ?? state;
    await deliverPendingWinnerNotifications(database, settled).catch(
      (error) => {
        console.error(
          "Unable to deliver Duper Tuesday winner notifications",
          error,
        );
      },
    );
    return (
      (await database
        .collection<ForgeryContestState>("metadata")
        .findOne({ _id: FORGERY_CONTEST_STATE_ID })) ?? settled
    );
  } catch (error) {
    if (stateAdvanced) {
      console.error("Duper Tuesday post-settlement work failed", error);
      return (
        (await database
          .collection<ForgeryContestState>("metadata")
          .findOne({ _id: FORGERY_CONTEST_STATE_ID })) ?? state
      );
    }
    const rollbackErrors: unknown[] = [];
    for (const rollback of [...originalsToRestore].reverse()) {
      try {
        const restored = await database.collection<GameItem>("items").replaceOne(
          { _id: rollback.item._id, owner: rollback.expectedOwner },
          rollback.item,
        );
        if (restored.matchedCount !== 1) {
          throw new Error(
            `Contest item ${rollback.item._id} changed before rollback.`,
          );
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    try {
      await database.collection<GameItem>("items").deleteMany({
        _id: { $in: generatedPrizes.map((item) => item._id) },
        owner: FORGERY_CONTEST_OWNER_ID,
      });
    } catch (cleanupError) {
      rollbackErrors.push(cleanupError);
    }
    await releaseSettlementLock(database, token).catch((unlockError) => {
      rollbackErrors.push(unlockError);
    });
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "Duper Tuesday settlement and rollback both failed.",
      );
    }
    throw error;
  }
}

export async function drawForgeryContestForDebug(
  database: Db,
  now = new Date(),
): Promise<ForgeryContestState> {
  const state = await ensureForgeryContestState(database, now);
  const entryCount = await database
    .collection<ForgeryContestEntry>("forgery_contest_entries")
    .countDocuments({
      cycle_id: state.cycle_id,
      pending: false,
    });
  if (entryCount === 0) {
    throw new ForgeryContestError(
      "The Duper Tuesday has no active entries to draw.",
    );
  }
  const dueAt = new Date(now.getTime() - 1).toISOString();
  const prepared = await database
    .collection<ForgeryContestState>("metadata")
    .updateOne(
      {
        _id: FORGERY_CONTEST_STATE_ID,
        cycle_id: state.cycle_id,
        $or: [
          { settlement_lock: { $exists: false } },
          { "settlement_lock.expires_at": { $lte: now.toISOString() } },
        ],
      },
      {
        $set: {
          next_settlement_at: dueAt,
          updated_at: now.toISOString(),
        },
      },
    );
  if (prepared.modifiedCount !== 1) {
    throw new ForgeryContestError(
      "The Duper Tuesday is already settling.",
    );
  }
  return settleForgeryContestIfDue(database, now);
}

async function ensureForgeryContestState(
  database: Db,
  now: Date,
): Promise<ForgeryContestState> {
  await ensureForgeryContestIndexes(database);
  let state = await database
    .collection<ForgeryContestState>("metadata")
    .findOne({ _id: FORGERY_CONTEST_STATE_ID });
  if (!state) {
    const config = (await getGameplaySettings(database)).active;
    const generated: GameItem[] = [];
    try {
      for (const place of [1, 2, 3] as const) {
        generated.push(
          await generateForgeryContestPrize(database, config, place, now),
        );
      }
      const nextSettlement = getForgeryContestNextSettlementAt(now);
      const candidate: ForgeryContestState = {
        _id: FORGERY_CONTEST_STATE_ID,
        cycle_id: nextSettlement.toISOString(),
        next_settlement_at: nextSettlement.toISOString(),
        prizes: generated.map((item, index) => ({
          place: (index + 1) as ForgeryContestPlace,
          item_id: item._id,
        })),
        buffer_prizes: [],
        last_winners: [],
        updated_at: now.toISOString(),
      };
      try {
        await database
          .collection<ForgeryContestState>("metadata")
          .insertOne(candidate);
        state = candidate;
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        await database.collection<GameItem>("items").deleteMany({
          _id: { $in: generated.map((item) => item._id) },
          owner: FORGERY_CONTEST_OWNER_ID,
        });
        state = await database
          .collection<ForgeryContestState>("metadata")
          .findOne({ _id: FORGERY_CONTEST_STATE_ID });
      }
    } catch (error) {
      await database.collection<GameItem>("items").deleteMany({
        _id: { $in: generated.map((item) => item._id) },
        owner: FORGERY_CONTEST_OWNER_ID,
      });
      throw error;
    }
  }
  if (!state) {
    throw new Error("Duper Tuesday state could not be initialized.");
  }
  state = await ensureForgeryContestBuffers(database, state, now);
  await cleanupOrphanedContestPrizes(database, state, now);
  return state;
}

async function ensureForgeryContestBuffers(
  database: Db,
  state: ForgeryContestState,
  now: Date,
): Promise<ForgeryContestState> {
  if (hasActiveSettlementLock(state, now)) return state;
  const current = state.buffer_prizes ?? [];
  const bufferedItems = await database.collection<GameItem>("items")
    .find({
      _id: { $in: current.map((prize) => prize.item_id) },
      owner: FORGERY_CONTEST_OWNER_ID,
      status: "claimed",
    })
    .project<Pick<GameItem, "_id">>({ _id: 1 })
    .toArray();
  const availableIds = new Set(bufferedItems.map((item) => item._id));
  const referencedIds = new Set(state.prizes.map((prize) => prize.item_id));
  const buffer: ForgeryContestPrize[] = [];
  const generated: GameItem[] = [];
  try {
    for (const place of [1, 2, 3] as const) {
      const prizes = current.filter((prize) => prize.place === place);
      const valid: ForgeryContestPrize[] = [];
      for (const prize of prizes) {
        if (valid.length >= FORGERY_CONTEST_DEFAULT_BUFFER_COUNT) break;
        if (!availableIds.has(prize.item_id) || referencedIds.has(prize.item_id)) {
          continue;
        }
        referencedIds.add(prize.item_id);
        valid.push(prize);
      }
      while (valid.length < FORGERY_CONTEST_DEFAULT_BUFFER_COUNT) {
        const config = (await getGameplaySettings(database)).active;
        const item = await generateForgeryContestPrize(
          database, config, place, now,
        );
        generated.push(item);
        valid.push({ place, item_id: item._id });
      }
      buffer.push(...valid);
    }
  } catch (error) {
    await database.collection<GameItem>("items").deleteMany({
      _id: { $in: generated.map((item) => item._id) },
      owner: FORGERY_CONTEST_OWNER_ID,
    });
    throw error;
  }
  if (
    state.buffer_prizes &&
    buffer.length === current.length &&
    buffer.every((prize, index) =>
      prize.item_id === current[index].item_id &&
      prize.place === current[index].place,
    )
  ) {
    return state;
  }
  const updated = await database
    .collection<ForgeryContestState>("metadata")
    .findOneAndUpdate(
      {
        _id: FORGERY_CONTEST_STATE_ID,
        cycle_id: state.cycle_id,
        prizes: state.prizes,
        buffer_prizes: state.buffer_prizes ?? { $exists: false },
        $or: [
          { settlement_lock: { $exists: false } },
          { "settlement_lock.expires_at": { $lte: now.toISOString() } },
        ],
      },
      { $set: { buffer_prizes: buffer, updated_at: now.toISOString() } },
      { returnDocument: "after" },
    );
  if (updated) return updated;
  await database.collection<GameItem>("items").deleteMany({
    _id: { $in: generated.map((item) => item._id) },
    owner: FORGERY_CONTEST_OWNER_ID,
  });
  return (
    (await database.collection<ForgeryContestState>("metadata")
      .findOne({ _id: FORGERY_CONTEST_STATE_ID })) ?? state
  );
}

async function ensureForgeryContestIndexes(database: Db): Promise<void> {
  let indexPromise = indexPromises.get(database);
  if (!indexPromise) {
    indexPromise = Promise.all([
      database
        .collection<ForgeryContestEntry>("forgery_contest_entries")
        .createIndex({ cycle_id: 1, player_id: 1 }, { unique: true }),
      database
        .collection<ForgeryContestEntry>("forgery_contest_entries")
        .createIndex({ cycle_id: 1, pending: 1, submitted_at: 1 }),
      database
        .collection<ForgeryContestVote>("forgery_contest_votes")
        .createIndex({ cycle_id: 1, player_id: 1 }, { unique: true }),
      database
        .collection<ForgeryContestVote>("forgery_contest_votes")
        .createIndex({ cycle_id: 1, entry_id: 1 }),
      database
        .collection<GameItem>("items")
        .createIndex({
          owner: 1,
          status: 1,
          "authenticity.forgery": 1,
          "authenticity.identified": 1,
        }),
    ]).then(() => undefined);
    indexPromises.set(database, indexPromise);
  }
  await indexPromise;
}

async function generateForgeryContestPrize(
  database: Db,
  config: GameplayConfig,
  place: ForgeryContestPlace,
  now: Date,
): Promise<GameItem> {
  const rarity = PRIZE_RARITIES[place - 1];
  const rarityMap = {
    common: 0,
    uncommon: 0,
    rare: 0,
    legendary: 0,
    masterpiece: 0,
    [rarity]: 1,
  } satisfies Record<ArtworkRarity, number>;
  const [item] = await generateDailyDrop(
    database,
    FORGERY_CONTEST_OWNER_ID,
    50,
    {
      now,
      itemCount: 1,
      generationMap: {
        rarity: rarityMap,
        foil: 0.35,
        mint: 1,
        unlocked: 0.5,
        cardStyle: 1,
      },
      useRawRarityMap: true,
      mintValueMultiplier: config.mintValueMultiplier,
      source: FORGERY_CONTEST_PRIZE_SOURCE,
      status: "claimed",
    },
  );
  if (!item || !item.mint || !item.card_renderer) {
    if (item) {
      await database.collection<GameItem>("items").deleteOne({
        _id: item._id,
        owner: FORGERY_CONTEST_OWNER_ID,
      });
    }
    throw new Error(
      "Duper Tuesday prizes require an active non-museum card renderer.",
    );
  }
  return item;
}

async function cleanupContestDocuments(
  database: Db,
  state: ForgeryContestState,
  now: Date,
): Promise<void> {
  const entries = database.collection<ForgeryContestEntry>(
    "forgery_contest_entries",
  );
  const stalePending = await entries
    .find({
      pending: true,
      pending_until: { $lte: now.toISOString() },
    })
    .toArray();
  for (const entry of stalePending) {
    const item = await database
      .collection<ContestHeldGameItem>("items")
      .findOne({
      _id: entry.item_id,
      });
    if (item?.owner === FORGERY_CONTEST_OWNER_ID) {
      await database.collection<ContestHeldGameItem>("items").updateOne(
        { _id: item._id, owner: FORGERY_CONTEST_OWNER_ID },
        {
          $set: {
            owner: entry.player_id,
            status: "claimed",
            date_received: now.toISOString(),
          },
          $unset: { forgery_contest: "" },
          $push: {
            transaction_history: {
              type: "transfer",
              from_owner: FORGERY_CONTEST_OWNER_ID,
              to_owner: entry.player_id,
              occurred_at: now.toISOString(),
              source: "duper tuesday submission recovery",
            },
          },
        },
      );
    }
    await entries.deleteOne({ _id: entry._id, pending: true });
  }
  const strandedItems = await database
    .collection<ContestHeldGameItem>("items")
    .find({
      owner: FORGERY_CONTEST_OWNER_ID,
      "forgery_contest.cycle_id": {
        $exists: true,
        $ne: state.cycle_id,
      },
    })
    .toArray();
  for (const item of strandedItems) {
    const originalOwner = item.forgery_contest?.original_owner;
    if (!originalOwner) continue;
    await database.collection<ContestHeldGameItem>("items").updateOne(
      {
        _id: item._id,
        owner: FORGERY_CONTEST_OWNER_ID,
        "forgery_contest.original_owner": originalOwner,
      },
      {
        $set: {
          owner: originalOwner,
          status: "claimed",
          date_received: now.toISOString(),
        },
        $unset: { forgery_contest: "" },
        $push: {
          transaction_history: {
            type: "transfer",
            from_owner: FORGERY_CONTEST_OWNER_ID,
            to_owner: originalOwner,
            occurred_at: now.toISOString(),
            source: "duper tuesday recovery",
          },
        },
      },
    );
  }
  await Promise.all([
    entries.deleteMany({
      cycle_id: { $ne: state.cycle_id },
      pending: false,
    }),
    database
      .collection<ForgeryContestVote>("forgery_contest_votes")
      .deleteMany({ cycle_id: { $ne: state.cycle_id } }),
  ]);
}

async function rollbackSubmittedItem(
  database: Db,
  original: GameItem,
  entryId: string,
): Promise<void> {
  const restored = await database.collection<GameItem>("items").replaceOne(
    { _id: original._id, owner: FORGERY_CONTEST_OWNER_ID },
    original,
  );
  await database
    .collection<ForgeryContestEntry>("forgery_contest_entries")
    .deleteOne({ _id: entryId });
  if (restored.matchedCount !== 1) {
    const current = await database
      .collection<GameItem>("items")
      .findOne({ _id: original._id });
    if (current?.owner === original.owner) return;
    throw new Error(
      "The Duper Tuesday submission failed and its item could not be restored.",
    );
  }
}

async function cleanupOrphanedContestPrizes(
  database: Db,
  state: ForgeryContestState,
  now: Date,
): Promise<void> {
  if (hasActiveSettlementLock(state, now)) return;
  const referenced = [...state.prizes, ...(state.buffer_prizes ?? [])]
    .map((prize) => prize.item_id);
  const orphaned = await database
    .collection<GameItem>("items")
    .find({
      owner: FORGERY_CONTEST_OWNER_ID,
      source: { $in: [FORGERY_CONTEST_PRIZE_SOURCE, LEGACY_PRIZE_SOURCE] },
      date_created: {
        $lte: new Date(
          now.getTime() - ORPHANED_PRIZE_GRACE_MILLISECONDS,
        ).toISOString(),
      },
      ...(referenced.length > 0 ? { _id: { $nin: referenced } } : {}),
    })
    .project<GameItem>({ _id: 1 })
    .toArray();
  if (orphaned.length === 0) return;
  const ids = orphaned.map((item) => item._id);
  await database.collection<GameItem>("items").deleteMany({
    _id: { $in: ids },
    owner: FORGERY_CONTEST_OWNER_ID,
    source: { $in: [FORGERY_CONTEST_PRIZE_SOURCE, LEGACY_PRIZE_SOURCE] },
  });
  await deleteCommunityReactions(database, "item", ids);
}

async function deliverPendingWinnerNotifications(
  database: Db,
  state: ForgeryContestState,
): Promise<void> {
  if (!state.pending_winner_notifications) return;
  await database.collection<ContestHeldGameItem>("items").updateMany(
    {
      forgery_contest_settlement_id: state.pending_winner_notifications,
    },
    {
      $set: { status: "claimed" },
      $unset: {
        forgery_contest: "",
        forgery_contest_settlement_id: "",
      },
    },
  );
  for (const winner of state.last_winners) {
    const moneyReward =
      winner.money_reward ??
      getForgeryContestMoneyReward(
        winner.place,
        winner.entry_item_snapshot.values.actual,
      );
    await awardForgeryContestMoney(
      database,
      state.pending_winner_notifications,
      winner,
      moneyReward,
    );
    await database.collection<PlayerNotification>("player_notifications").deleteOne({
      _id: `forgery-contest-winner:${state.pending_winner_notifications}:${winner.player_id}`,
      user_id: winner.player_id,
    });
    const cashText =
      moneyReward > 0
        ? ` You also received $${moneyReward.toLocaleString()} based on your submitted work's estimated value.`
        : "";
    await createPlayerNotification(database, winner.player_id, {
      kind: "success",
      message: `You won ${PLACE_LABELS[winner.place - 1]} place in Duper Tuesday with ${winner.votes} ${winner.votes === 1 ? "vote" : "votes"}. Your prize was added to your collection.${cashText}`,
      notificationId: `forgery-contest-winner:${state.pending_winner_notifications}:${winner.won_at}:${winner.player_id}`,
    });
  }
  await database.collection<ForgeryContestState>("metadata").updateOne(
    {
      _id: FORGERY_CONTEST_STATE_ID,
      pending_winner_notifications: state.pending_winner_notifications,
    },
    { $unset: { pending_winner_notifications: "" } },
  );
}

async function ensureWinnerMoneyRewards(
  database: Db,
  state: ForgeryContestState,
  now: Date,
): Promise<ForgeryContestState> {
  if (
    state.last_winners.length === 0 ||
    state.last_winners.every((winner) => Number.isFinite(winner.money_reward))
  ) {
    return state;
  }
  const winners = state.last_winners.map((winner) => ({
    ...winner,
    money_reward: getForgeryContestMoneyReward(
      winner.place,
      winner.entry_item_snapshot.values.actual,
    ),
  }));
  const updated = await database
    .collection<ForgeryContestState>("metadata")
    .findOneAndUpdate(
      {
        _id: FORGERY_CONTEST_STATE_ID,
        updated_at: state.updated_at,
      },
      {
        $set: {
          last_winners: winners,
          pending_winner_notifications: state.cycle_id,
          updated_at: now.toISOString(),
        },
      },
      { returnDocument: "after" },
    );
  return updated ?? state;
}

async function awardForgeryContestMoney(
  database: Db,
  settlementId: string,
  winner: ForgeryContestWinner,
  amount: number,
): Promise<void> {
  const rewardId = `forgery-contest:${settlementId}:${winner.won_at}:${winner.player_id}`;
  const result = await database.collection<ContestPlayer>("players").updateOne(
    {
      _id: winner.player_id,
      "profile.forgery_contest_reward_ids": { $ne: rewardId },
    },
    {
      $inc: { "profile.bank_balance": amount },
      $addToSet: { "profile.forgery_contest_reward_ids": rewardId },
    },
  );
  if (result.modifiedCount === 0) {
    const player = await database
      .collection<ContestPlayer>("players")
      .findOne({
        _id: winner.player_id,
        "profile.forgery_contest_reward_ids": rewardId,
      });
    if (player) return;
    throw new Error(
      `Duper Tuesday cash reward could not be awarded to ${winner.player_id}.`,
    );
  }
  if (amount > 0) {
    await recordEconomyMetricsSafely(database, {
      amount,
      currency: "money",
      direction: "earned",
      source: "forgery-contest-reward",
    });
  }
}

async function releaseSettlementLock(
  database: Db,
  token: string,
): Promise<void> {
  await database.collection<ForgeryContestState>("metadata").updateOne(
    {
      _id: FORGERY_CONTEST_STATE_ID,
      "settlement_lock.token": token,
    },
    {
      $unset: { settlement_lock: "" },
      $set: { updated_at: new Date().toISOString() },
    },
  );
}

function hasActiveSettlementLock(
  state: ForgeryContestState,
  now: Date,
): boolean {
  return Boolean(
    state.settlement_lock &&
      new Date(state.settlement_lock.expires_at).getTime() > now.getTime(),
  );
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function stripContestHoldMetadata<T extends GameItem>(item: T): T {
  const clean = {
    ...item,
  } as T & Pick<ContestHeldGameItem, "forgery_contest">;
  delete clean.forgery_contest;
  return clean as T;
}
