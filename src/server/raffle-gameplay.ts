import { randomUUID } from "node:crypto";

import type { Db } from "mongodb";

import { deleteCommunityReactions } from "./community-reaction-cleanup.ts";
import {
  calculateItemValues,
  generateDailyDrop,
  type Artwork,
  type GameItem,
  type LootData,
} from "./gameplay.ts";
import {
  getGameplayGenerationMap,
  type GameplayConfig,
} from "./game-settings.ts";
import { createPlayerNotification } from "./player-notifications.ts";
import { RAFFLE_OWNER_ID } from "./raffle-core.ts";

export { RAFFLE_OWNER_ID } from "./raffle-core.ts";
export const RAFFLE_STATE_ID = "raffle-state";
export const RAFFLE_MAX_POTENCY = 10;
export const RAFFLE_PRIZE_COUNT = 3;
export const RAFFLE_BUFFER_COUNT = 3;
export const RAFFLE_DRAW_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const LOTTERY_HIT_PROBABILITY = 0.2;

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
  buffer_prizes: RafflePrize[];
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
        buffer_prizes: [],
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
  if (!state) throw new Error("Lottery state could not be initialized.");
  const latestNextDrawAt = new Date(
    now.getTime() + RAFFLE_DRAW_INTERVAL_MS,
  ).toISOString();
  if (state.next_draw_at > latestNextDrawAt) {
    state =
      (await database.collection<RaffleState>("metadata").findOneAndUpdate(
        {
          _id: RAFFLE_STATE_ID,
          next_draw_at: state.next_draw_at,
        },
        { $set: { next_draw_at: latestNextDrawAt } },
        { returnDocument: "after" },
      )) ?? state;
  }

  const validPrizes: RafflePrize[] = [];
  const validBufferPrizes: RafflePrize[] = [];
  const referencedItemIds = new Set<string>();
  for (const [prizes, target, limit] of [
    [state.prizes, validPrizes, RAFFLE_PRIZE_COUNT],
    [state.buffer_prizes ?? [], validBufferPrizes, RAFFLE_BUFFER_COUNT],
  ] as const) {
    for (const prize of prizes) {
      if (target.length >= limit || referencedItemIds.has(prize.item_id)) {
        continue;
      }
      const item = await database.collection<GameItem>("items").findOne({
        _id: prize.item_id,
        owner: RAFFLE_OWNER_ID,
      });
      if (item) {
        if (!item.card_renderer) {
          await database.collection<GameItem>("items").updateOne(
            { _id: item._id, owner: RAFFLE_OWNER_ID },
            { $set: { card_renderer: "legacy" } },
          );
        }
        referencedItemIds.add(item._id);
        target.push({
          item_id: item._id,
          potency: Math.max(1, item.lottery || prize.potency),
        });
      }
    }
  }
  const generated: GameItem[] = [];
  while (validPrizes.length < RAFFLE_PRIZE_COUNT) {
    const reward = await generateRafflePrize(database, config, now);
    generated.push(reward);
    validPrizes.push({ item_id: reward._id, potency: 1 });
  }
  while (validBufferPrizes.length < RAFFLE_BUFFER_COUNT) {
    const reward = await generateRafflePrize(database, config, now);
    generated.push(reward);
    validBufferPrizes.push({ item_id: reward._id, potency: 1 });
  }
  const currentState = state;
  if (
    generated.length > 0 ||
    validPrizes.length !== currentState.prizes.length ||
    validPrizes.some(
      (prize, index) =>
        prize.item_id !== currentState.prizes[index]?.item_id ||
        prize.potency !== currentState.prizes[index]?.potency,
    ) ||
    validBufferPrizes.some(
      (prize, index) =>
        prize.item_id !== currentState.buffer_prizes?.[index]?.item_id ||
        prize.potency !== currentState.buffer_prizes?.[index]?.potency,
    ) ||
    validBufferPrizes.length !== (currentState.buffer_prizes?.length ?? 0)
  ) {
    const updated = await database.collection<RaffleState>("metadata").updateOne(
      {
        _id: RAFFLE_STATE_ID,
        prizes: currentState.prizes,
        ...(currentState.buffer_prizes
          ? { buffer_prizes: currentState.buffer_prizes }
          : { buffer_prizes: { $exists: false } }),
      },
      {
        $set: {
          prizes: validPrizes,
          buffer_prizes: validBufferPrizes,
        },
      },
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
  options: {
    forceDraw?: boolean;
  } = {},
): Promise<RaffleState> {
  let state = await ensureRaffleState(database, config, now);
  if (
    !options.forceDraw &&
    new Date(state.next_draw_at).getTime() > now.getTime()
  ) {
    return state;
  }

  const token = randomUUID();
  const locked = await database.collection<RaffleState>("metadata").findOneAndUpdate(
    {
      _id: RAFFLE_STATE_ID,
      ...(options.forceDraw
        ? {}
        : { next_draw_at: { $lte: now.toISOString() } }),
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
  if (!locked) {
    if (options.forceDraw) {
      throw new Error("Another lottery drawing is already in progress.");
    }
    return state;
  }
  state = locked;

  const originalPrizes = await database
    .collection<GameItem>("items")
    .find({ _id: { $in: state.prizes.map((prize) => prize.item_id) } })
    .toArray();
  const originalBufferPrizes = await database
    .collection<GameItem>("items")
    .find({
      _id: { $in: state.buffer_prizes.map((prize) => prize.item_id) },
      owner: RAFFLE_OWNER_ID,
    })
    .toArray();
  if (originalPrizes.length !== state.prizes.length) {
    await database.collection<RaffleState>("metadata").updateOne(
      { _id: RAFFLE_STATE_ID, "draw_lock.token": token },
      { $unset: { draw_lock: "" } },
    );
    throw new Error("One or more lottery items disappeared before settlement.");
  }
  if (originalBufferPrizes.length !== state.buffer_prizes.length) {
    await database.collection<RaffleState>("metadata").updateOne(
      { _id: RAFFLE_STATE_ID, "draw_lock.token": token },
      { $unset: { draw_lock: "" } },
    );
    throw new Error("One or more buffered lottery items disappeared before settlement.");
  }
  const generatedBufferItemIds: string[] = [];
  const expiredPrizeItemIds: string[] = [];
  const completedPrizeItemIds: string[] = [];
  const artworkById = new Map(
    (
      await database
        .collection<Artwork>("artworks")
        .find({
          _id: { $in: originalPrizes.map((item) => item.artwork_id) },
        })
        .toArray()
    ).map((artwork) => [artwork._id, artwork]),
  );
  const winnerNotifications: { playerId: string; title: string }[] = [];
  const announcements: { content: string; eventKey: string }[] = [];

  try {
    const nextPrizes: RafflePrize[] = [];
    const nextBufferPrizes = [...state.buffer_prizes];
    const winners: RaffleWinner[] = [];
    function takeBufferedPrize(): RafflePrize {
      const bufferedPrize = nextBufferPrizes.shift();
      if (!bufferedPrize) {
        throw new Error("The lottery prize buffer was exhausted.");
      }
      return bufferedPrize;
    }
    for (const prize of state.prizes) {
      const entries = await database
        .collection<RaffleEntry>("raffle_entries")
        .find({ item_id: prize.item_id, tickets: { $gt: 0 } })
        .toArray();
      const players = await database
        .collection<RafflePlayer>("players")
        .find({
          _id: { $in: entries.map((entry) => entry.player_id) },
          active: true,
        })
        .toArray();
      const playerById = new Map(
        players.map((player) => [player._id, player]),
      );
      const eligibleEntries = entries.filter((entry) =>
        playerById.has(entry.player_id),
      );
      const outcome = getLotteryPrizeDrawOutcome(
        eligibleEntries.reduce(
          (total, entry) => total + entry.tickets,
          0,
        ),
        prize.potency,
        eligibleEntries.length > 0 &&
          random() < LOTTERY_HIT_PROBABILITY,
      );
      if (outcome === "replace") {
        expiredPrizeItemIds.push(prize.item_id);
        completedPrizeItemIds.push(prize.item_id);
        nextPrizes.push(takeBufferedPrize());
        continue;
      }
      if (outcome === "rollover") {
        const potency = Math.min(
          prize.potency + 1,
          RAFFLE_MAX_POTENCY,
        );
        await setRafflePrizePotency(database, prize.item_id, potency);
        nextPrizes.push({ item_id: prize.item_id, potency });
        announcements.push({
          content: `Daily lottery rollover: /items/${prize.item_id} is now at potency ${potency}.`,
          eventKey: `lottery:${state.next_draw_at}:${prize.item_id}:rollover`,
        });
        continue;
      }
      const winnerEntry = selectWeightedRaffleEntry(
        eligibleEntries,
        random,
      );
      const player = playerById.get(winnerEntry.player_id);
      if (!player) {
        throw new Error("The selected lottery winner is unavailable.");
      }
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
              source: "daily lottery",
            },
          },
        },
      );
      if (transferred.modifiedCount !== 1) {
        throw new Error("Lottery item could not be transferred.");
      }
      completedPrizeItemIds.push(prize.item_id);
      nextPrizes.push(takeBufferedPrize());
      winners.push({
        player_id: player._id,
        screen_name: player.screen_name,
        item_id: prize.item_id,
        won_at: now.toISOString(),
      });
      winnerNotifications.push({
        playerId: player._id,
        title:
          artworkById.get(
            originalPrizes.find((item) => item._id === prize.item_id)
              ?.artwork_id ?? "",
          )?.title ?? "an artwork",
      });
      announcements.push({
        content: `Daily lottery: @${player.screen_name} won /items/${prize.item_id}!`,
        eventKey: `lottery:${state.next_draw_at}:${prize.item_id}:winner`,
      });
    }
    while (nextBufferPrizes.length < RAFFLE_BUFFER_COUNT) {
      const reward = await generateRafflePrize(database, config, now);
      generatedBufferItemIds.push(reward._id);
      nextBufferPrizes.push({ item_id: reward._id, potency: 1 });
    }

    const nextDraw = options.forceDraw
      ? new Date(now.getTime() + RAFFLE_DRAW_INTERVAL_MS)
      : new Date(
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
          buffer_prizes: nextBufferPrizes,
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
      throw new Error("Lottery state changed during drawing settlement.");
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
    if (generatedBufferItemIds.length > 0) {
      try {
        const removed = await database.collection<GameItem>("items").deleteMany({
          _id: { $in: generatedBufferItemIds },
          owner: RAFFLE_OWNER_ID,
        });
        compensationFailed ||=
          removed.deletedCount !== generatedBufferItemIds.length;
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
        "Lottery settlement failed and could not be fully rolled back.",
        { cause: error },
      );
    }
    throw error;
  }

  try {
    await Promise.all([
      completedPrizeItemIds.length > 0
        ? database.collection<RaffleEntry>("raffle_entries").deleteMany({
            item_id: { $in: completedPrizeItemIds },
          })
        : Promise.resolve(),
      expiredPrizeItemIds.length > 0
        ? database.collection<GameItem>("items").deleteMany({
            _id: { $in: expiredPrizeItemIds },
            owner: RAFFLE_OWNER_ID,
          })
        : Promise.resolve(),
    ]);
    await deleteCommunityReactions(database, "item", expiredPrizeItemIds);
  } catch (error) {
    console.error(
      "Lottery settled, but expired items or old ticket entries were not removed.",
      error,
    );
  }

  const notificationResults = await Promise.allSettled(
    winnerNotifications.map(({ playerId, title }) =>
      createPlayerNotification(database, playerId, {
        kind: "success",
        message: `You won ${title} in the daily lottery.`,
        dedupeUnread: false,
      }),
    ),
  );
  for (const result of notificationResults) {
    if (result.status === "rejected") {
      console.error("Unable to create lottery winner notification", result.reason);
    }
  }
  if (announcements.length > 0) {
    const { createGlobalSystemChatMessage } = await import("./gallery-chat.ts");
    const announcementResults = await Promise.allSettled(
      announcements.map((announcement) =>
        createGlobalSystemChatMessage(database, {
          ...announcement,
          now,
        }),
      ),
    );
    for (const result of announcementResults) {
      if (result.status === "rejected") {
        console.error("Unable to create lottery announcement", result.reason);
      }
    }
  }

  return (
    (await database
      .collection<RaffleState>("metadata")
      .findOne({ _id: RAFFLE_STATE_ID })) ?? state
  );
}

export async function drawRaffleNow(
  database: Db,
  config: GameplayConfig,
  now = new Date(),
  random = Math.random,
): Promise<RaffleState> {
  return settleRaffleIfDue(database, config, now, random, {
    forceDraw: true,
  });
}

export type LotteryPrizeDrawOutcome = "award" | "rollover" | "replace";

export function getLotteryPrizeDrawOutcome(
  ticketCount: number,
  potency: number,
  hit: boolean,
): LotteryPrizeDrawOutcome {
  if (ticketCount <= 0) {
    return potency >= RAFFLE_MAX_POTENCY ? "replace" : "rollover";
  }
  return hit || potency >= RAFFLE_MAX_POTENCY ? "award" : "rollover";
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
    generationMap: {
      ...getGameplayGenerationMap(config),
      cardStyle: 1,
      rarity: {
        common: 0,
        uncommon: 0,
        rare: 0,
        legendary: 9_999,
        masterpiece: 1,
      },
    },
    useRawRarityMap: true,
    mintValueMultiplier: config.mintValueMultiplier,
    source: "lottery",
    status: "claimed",
  });
  if (!reward.card_renderer) {
    await database.collection<GameItem>("items").updateOne(
      { _id: reward._id, owner: RAFFLE_OWNER_ID },
      { $set: { card_renderer: "legacy" } },
    );
  }
  await setRafflePrizePotency(database, reward._id, 1);
  const updated = await database
    .collection<GameItem>("items")
    .findOne({ _id: reward._id });
  if (!updated) throw new Error("Generated lottery item was not found.");
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
  if (!item || !metadata) throw new Error("Lottery item data is unavailable.");
  const artwork = await database
    .collection<Artwork>("artworks")
    .findOne({ _id: item.artwork_id });
  if (!artwork) throw new Error("Lottery item artwork is unavailable.");
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
    throw new Error("Lottery item level could not be updated.");
  }
}
