import type { Db, Filter } from "mongodb";

import type { GameItem } from "./gameplay.ts";

export const UNCLAIMED_ITEM_EXPIRATION_MS = 60 * 60 * 1000;
export const DEALER_ITEM_EXPIRATION_MS = 20 * 60 * 1000;

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

export function getDealerItemExpiration(now: Date): string {
  return new Date(now.getTime() + DEALER_ITEM_EXPIRATION_MS).toISOString();
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
        source: { $regex: /(?:crate|daily drop)/i },
        date_received: {
          $lte: new Date(
            now.getTime() - UNCLAIMED_ITEM_EXPIRATION_MS,
          ).toISOString(),
        },
      },
      {
        status: "for_sale",
        expires_at: { $exists: false },
        source: "art dealer",
        date_received: {
          $lte: new Date(
            now.getTime() - DEALER_ITEM_EXPIRATION_MS,
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
  const result = await database
    .collection<GameItem>("items")
    .deleteMany(getExpiredTransientItemFilter(now));
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
