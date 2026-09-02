import { randomUUID } from "node:crypto";

import type { Db } from "mongodb";

import {
  calculateItemValues,
  generateDailyDrop,
  type Artwork,
  type GameItem,
  type LootData,
} from "./gameplay.ts";
import type { GameplayConfig } from "./game-settings.ts";

export const RAFFLE_OWNER_ID = "raffle-house";
export const RAFFLE_STATE_ID = "raffle-state";
export const RAFFLE_MAX_POTENCY = 10;
export const RAFFLE_PRIZE_COUNT = 3;
export const RAFFLE_DRAW_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export type RafflePrize = {
  item_id: string;
  potency: number;
};

export type RaffleWinner = {
  player_id: string;
  screen_name: string;
  item_id: string;
  won_at: string;
};

export type RaffleState = {
  _id: typeof RAFFLE_STATE_ID;
  prizes: RafflePrize[];
  next_draw_at: string;
  previous_winners: RaffleWinner[];
  draw_lock?: { token: string; expires_at: string };
};

export type RaffleEntry = {
  _id: string;
  player_id: string;
  item_id: string;
  tickets: number;
  updated_at: string;
};

type RafflePlayer = {
  _id: string;
  active: boolean;
  screen_name: string;
  profile: {
    lottery_tickets: number;
  };
};

export async function ensureRaffleState(
  database: Db,
  config: GameplayConfig,
  now = new Date(),
): Promise<RaffleState> {
  await database.collection<RaffleState>("metadata").updateOne(
    { _id: RAFFLE_STATE_ID },
    {
      $setOnInsert: {
        _id: RAFFLE_STATE_ID,
        prizes: [],
        next_draw_at: new Date(
          now.getTime() + RAFFLE_DRAW_INTERVAL_MS,
        ).toISOString(),
        previous_winners: [],
      },
    },
    { upsert: true },
  );
  let state = await database
    .collection<RaffleState>("metadata")
    .findOne({ _id: RAFFLE_STATE_ID });
  if (!state) throw new Error("Raffle state could not be initialized.");

  const validPrizes: RafflePrize[] = [];
  for (const prize of state.prizes) {
    const item = await database.collection<GameItem>("items").findOne({
      _id: prize.item_id,
      owner: RAFFLE_OWNER_ID,
    });
    if (item) {
      validPrizes.push({
        item_id: item._id,
        potency: Math.max(1, item.lottery || prize.potency),
      });
    }
  }
  const generated: GameItem[] = [];
  while (validPrizes.length < RAFFLE_PRIZE_COUNT) {
    const reward = await generateRafflePrize(database, config, now);
    generated.push(reward);
    validPrizes.push({ item_id: reward._id, potency: 1 });
  }
  const currentState = state;
  if (
    generated.length > 0 ||
    validPrizes.some(
      (prize, index) =>
        prize.item_id !== currentState.prizes[index]?.item_id ||
        prize.potency !== currentState.prizes[index]?.potency,
    )
  ) {
    const updated = await database.collection<RaffleState>("metadata").updateOne(
      { _id: RAFFLE_STATE_ID, prizes: currentState.prizes },
      { $set: { prizes: validPrizes } },
    );
    if (updated.modifiedCount !== 1) {
      await database.collection<GameItem>("items").deleteMany({
        _id: { $in: generated.map((item) => item._id) },
        owner: RAFFLE_OWNER_ID,
      });
    }
    state =
      (await database
        .collection<RaffleState>("metadata")
        .findOne({ _id: RAFFLE_STATE_ID })) ?? currentState;
  }
  return state;
}

export async function settleRaffleIfDue(
  database: Db,
  config: GameplayConfig,
  now = new Date(),
  random = Math.random,
): Promise<RaffleState> {
  let state = await ensureRaffleState(database, config, now);
  if (new Date(state.next_draw_at).getTime() > now.getTime()) return state;

  const token = randomUUID();
  const locked = await database.collection<RaffleState>("metadata").findOneAndUpdate(
    {
      _id: RAFFLE_STATE_ID,
      next_draw_at: { $lte: now.toISOString() },
      $or: [
        { draw_lock: { $exists: false } },
        { "draw_lock.expires_at": { $lte: now.toISOString() } },
      ],
    },
    {
      $set: {
        draw_lock: {
          token,
          expires_at: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
        },
      },
    },
    { returnDocument: "after" },
  );
  if (!locked) return state;
  state = locked;

  const originalPrizes = await database
    .collection<GameItem>("items")
    .find({ _id: { $in: state.prizes.map((prize) => prize.item_id) } })
    .toArray();
  if (originalPrizes.length !== state.prizes.length) {
    await database.collection<RaffleState>("metadata").updateOne(
      { _id: RAFFLE_STATE_ID, "draw_lock.token": token },
      { $unset: { draw_lock: "" } },
    );
    throw new Error("One or more raffle prizes disappeared before settlement.");
  }
  const replacementItemIds: string[] = [];

  try {
    const nextPrizes: RafflePrize[] = [];
    const winners: RaffleWinner[] = [];
    for (const prize of state.prizes) {
      const entries = await database
        .collection<RaffleEntry>("raffle_entries")
        .find({ item_id: prize.item_id, tickets: { $gt: 0 } })
        .toArray();
      const winnerEntry =
        entries.length > 0 &&
        (random() < 0.2 || prize.potency >= RAFFLE_MAX_POTENCY)
          ? selectWeightedRaffleEntry(entries, random)
          : null;
      if (!winnerEntry) {
        const potency = Math.min(
          prize.potency + 1,
          RAFFLE_MAX_POTENCY,
        );
        await setRafflePrizePotency(database, prize.item_id, potency);
        nextPrizes.push({ item_id: prize.item_id, potency });
        continue;
      }

      const player = await database.collection<RafflePlayer>("players").findOne({
        _id: winnerEntry.player_id,
        active: true,
      });
      if (!player) {
        nextPrizes.push(prize);
        continue;
      }
      const nextReward = await generateRafflePrize(database, config, now);
      replacementItemIds.push(nextReward._id);
      const transferred = await database.collection<GameItem>("items").updateOne(
        { _id: prize.item_id, owner: RAFFLE_OWNER_ID },
        {
          $set: {
            owner: player._id,
            status: "claimed",
            date_received: now.toISOString(),
            "authenticity.liable": player._id,
            "authenticity.original_owner": player._id,
          },
          $push: {
            transaction_history: {
              type: "transfer",
              from_owner: RAFFLE_OWNER_ID,
              to_owner: player._id,
              occurred_at: now.toISOString(),
              source: "weekly raffle",
            },
          },
        },
      );
      if (transferred.modifiedCount !== 1) {
        throw new Error("Raffle prize could not be transferred.");
      }
      nextPrizes.push({ item_id: nextReward._id, potency: 1 });
      winners.push({
        player_id: player._id,
        screen_name: player.screen_name,
        item_id: prize.item_id,
        won_at: now.toISOString(),
      });
    }

    const nextDraw = new Date(
      new Date(state.next_draw_at).getTime() + RAFFLE_DRAW_INTERVAL_MS,
    );
    while (nextDraw.getTime() <= now.getTime()) {
      nextDraw.setTime(nextDraw.getTime() + RAFFLE_DRAW_INTERVAL_MS);
    }
    const advanced = await database.collection<RaffleState>("metadata").updateOne(
      { _id: RAFFLE_STATE_ID, "draw_lock.token": token },
      {
        $set: {
          prizes: nextPrizes,
          next_draw_at: nextDraw.toISOString(),
        },
        ...(winners.length > 0
          ? {
              $push: {
                previous_winners: {
                  $each: winners,
                  $slice: -30,
                },
              },
            }
          : {}),
        $unset: { draw_lock: "" },
      },
    );
    if (advanced.modifiedCount !== 1) {
      throw new Error("Raffle state changed during drawing settlement.");
    }
  } catch (error) {
    let compensationFailed = false;
    for (const originalPrize of originalPrizes) {
      try {
        const restored = await database.collection<GameItem>("items").replaceOne(
          { _id: originalPrize._id },
          originalPrize,
        );
        compensationFailed ||= restored.matchedCount !== 1;
      } catch {
        compensationFailed = true;
      }
    }
    if (replacementItemIds.length > 0) {
      try {
        const removed = await database.collection<GameItem>("items").deleteMany({
          _id: { $in: replacementItemIds },
          owner: RAFFLE_OWNER_ID,
        });
        compensationFailed ||=
          removed.deletedCount !== replacementItemIds.length;
      } catch {
        compensationFailed = true;
      }
    }
    try {
      await database.collection<RaffleState>("metadata").updateOne(
        { _id: RAFFLE_STATE_ID, "draw_lock.token": token },
        { $unset: { draw_lock: "" } },
      );
    } catch {
      compensationFailed = true;
    }
    if (compensationFailed) {
      throw new Error(
        "Raffle settlement failed and could not be fully rolled back.",
        { cause: error },
      );
    }
    throw error;
  }

  try {
    await database.collection<RaffleEntry>("raffle_entries").deleteMany({
      item_id: { $in: state.prizes.map((prize) => prize.item_id) },
    });
  } catch (error) {
    console.error("Raffle settled, but old ticket entries were not removed.", error);
  }

  return (
    (await database
      .collection<RaffleState>("metadata")
      .findOne({ _id: RAFFLE_STATE_ID })) ?? state
  );
}

export function selectWeightedRaffleEntry<T extends Pick<RaffleEntry, "tickets">>(
  entries: T[],
  random = Math.random,
): T {
  const total = entries.reduce((sum, entry) => sum + entry.tickets, 0);
  let roll = random() * total;
  for (const entry of entries) {
    roll -= entry.tickets;
    if (roll < 0) return entry;
  }
  return entries[entries.length - 1];
}

export async function generateRafflePrize(
  database: Db,
  config: GameplayConfig,
  now = new Date(),
): Promise<GameItem> {
  const [reward] = await generateDailyDrop(database, RAFFLE_OWNER_ID, 50, {
    now,
    itemCount: 1,
    rarityWeights: {
      common: 0,
      uncommon: 0,
      rare: 0,
      legendary: 9_999,
      masterpiece: 1,
    },
    useRawRarityMap: true,
    cardRendererProbability: config.cardRendererProbability,
    cardStyleWeights: config.cardStyleWeights,
    foilProbability: config.foilProbability,
    mintProbability: config.mintProbability,
    mintValueMultiplier: config.mintValueMultiplier,
    unlockedProbability: config.unlockedProbability,
    source: "raffle",
    status: "claimed",
  });
  await setRafflePrizePotency(database, reward._id, 1);
  const updated = await database
    .collection<GameItem>("items")
    .findOne({ _id: reward._id });
  if (!updated) throw new Error("Generated raffle prize was not found.");
  return updated;
}

export async function setRafflePrizePotency(
  database: Db,
  itemId: string,
  potency: number,
) {
  const [item, metadata] = await Promise.all([
    database.collection<GameItem>("items").findOne({
      _id: itemId,
      owner: RAFFLE_OWNER_ID,
    }),
    database
      .collection<{ _id: string; loot_data: LootData }>("metadata")
      .findOne({ _id: "loot-data" }),
  ]);
  if (!item || !metadata) throw new Error("Raffle prize data is unavailable.");
  const artwork = await database
    .collection<Artwork>("artworks")
    .findOne({ _id: item.artwork_id });
  if (!artwork) throw new Error("Raffle prize artwork is unavailable.");
  const nextItem = { ...item, lottery: potency };
  const updated = await database.collection<GameItem>("items").updateOne(
    { _id: item._id, owner: RAFFLE_OWNER_ID },
    {
      $set: {
        lottery: potency,
        values: calculateItemValues(nextItem, artwork, metadata.loot_data),
      },
    },
  );
  if (updated.matchedCount !== 1) {
    throw new Error("Raffle prize potency could not be updated.");
  }
}
