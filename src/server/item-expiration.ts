import type { Db, Filter } from "mongodb";

import type { GameItem } from "./gameplay.ts";
import { transferHallOfFameItems } from "./hall-of-fame.ts";

export const UNCLAIMED_ITEM_EXPIRATION_MS = 60 * 60 * 1000;
export const CRATE_ITEM_EXPIRATION_MS = 30 * 60 * 1000;
export const NPC_OFFER_ITEM_EXPIRATION_MS = 10 * 60 * 1000;

type ItemExpirationGlobal = typeof globalThis & {
  artfunkItemExpirationIndexes?: Promise<void>;
};

const expirationGlobal = globalThis as ItemExpirationGlobal;

export function ensureItemExpirationIndexes(database: Db): Promise<void> {
  expirationGlobal.artfunkItemExpirationIndexes ??= Promise.all([
    database
      .collection<GameItem>("items")
      .createIndex({ status: 1, expires_at: 1 }),
    database
      .collection<GameItem>("items")
      .createIndex({ status: 1, source: 1, date_received: 1 }),
  ]).then(() => undefined);
  return expirationGlobal.artfunkItemExpirationIndexes;
}

export function getUnclaimedItemExpiration(now: Date): string {
  return new Date(now.getTime() + UNCLAIMED_ITEM_EXPIRATION_MS).toISOString();
}

export function getCrateItemExpiration(now: Date): string {
  return new Date(now.getTime() + CRATE_ITEM_EXPIRATION_MS).toISOString();
}

export function getNpcOfferItemExpiration(now: Date): string {
  return new Date(
    now.getTime() + NPC_OFFER_ITEM_EXPIRATION_MS,
  ).toISOString();
}

export function getExpiredTransientItemFilter(
  now: Date,
): Filter<GameItem> {
  const nowIso = now.toISOString();
  return {
    $or: [
      {
        status: "unclaimed",
        expires_at: { $lte: nowIso },
      },
      {
        status: "for_sale",
        expires_at: { $lte: nowIso },
      },
      {
        status: "unclaimed",
        expires_at: { $exists: false },
        source: { $regex: /crate/i },
        date_received: {
          $lte: new Date(
            now.getTime() - CRATE_ITEM_EXPIRATION_MS,
          ).toISOString(),
        },
      },
      {
        status: "unclaimed",
        expires_at: { $exists: false },
        source: "daily drop",
        date_received: {
          $lte: new Date(
            now.getTime() - UNCLAIMED_ITEM_EXPIRATION_MS,
          ).toISOString(),
        },
      },
      {
        status: "for_sale",
        expires_at: { $exists: false },
        source: { $in: ["art dealer", "art collector"] },
        date_received: {
          $lte: new Date(
            now.getTime() - NPC_OFFER_ITEM_EXPIRATION_MS,
          ).toISOString(),
        },
      },
      {
        status: "unclaimed",
        expires_at: { $exists: false },
        source: "art donor",
        date_received: {
          $lte: new Date(
            now.getTime() - NPC_OFFER_ITEM_EXPIRATION_MS,
          ).toISOString(),
        },
      },
    ],
  };
}

export async function removeExpiredTransientItems(
  database: Db,
  now = new Date(),
): Promise<number> {
  await ensureItemExpirationIndexes(database);
  const expiredItems = await database
    .collection<GameItem>("items")
    .find(getExpiredTransientItemFilter(now))
    .toArray();
  if (expiredItems.length === 0) return 0;
  const preservedIds = await transferHallOfFameItems(database, expiredItems);
  const deletableIds = expiredItems
    .map((item) => item._id)
    .filter((itemId) => !preservedIds.has(itemId));
  const result = await database.collection<GameItem>("items").deleteMany({
    _id: { $in: deletableIds },
    ...getExpiredTransientItemFilter(now),
  });
  return result.deletedCount;
}

export function getUnexpiredItemFilter(now: Date) {
  return {
    $or: [
      { expires_at: { $exists: false } },
      { expires_at: { $gt: now.toISOString() } },
    ],
  };
}
