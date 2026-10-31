import type { AnyBulkWriteOperation, Db, Filter } from "mongodb";

import type { Artwork, GameItem, LootData } from "./gameplay.ts";
import {
  createRandomForgerySerial,
  getArtworkSerialPrefix,
} from "./item-serial-format.ts";

const ORIGINAL_ARTWORK_INDEX_NAME = "active_artwork_original_unique";

export async function ensureOriginalItemIndex(database: Db): Promise<void> {
  await database.collection<GameItem>("items").createIndex(
    { artwork_id: 1 },
    {
      name: ORIGINAL_ARTWORK_INDEX_NAME,
      unique: true,
      partialFilterExpression: { original: true },
    },
  );
}

export function isOriginalItemConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const failure = error as {
    code?: number;
    message?: string;
    keyPattern?: Record<string, number>;
    keyValue?: Record<string, unknown>;
  };
  return failure.code === 11000 && (
    failure.message?.includes(ORIGINAL_ARTWORK_INDEX_NAME) === true ||
    (failure.keyPattern?.artwork_id === 1 && failure.keyValue?.serial_number === 0)
  );
}

export async function allocateArtworkSerialNumbers(
  database: Db,
  artworkId: string,
  count: number,
): Promise<number[]> {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error("Serial allocation requires a positive whole item count.");
  }
  const artwork = await database.collection<Artwork>("artworks").findOneAndUpdate(
    {
      _id: artworkId,
      $or: [
        { serial_counter: { $exists: false } },
        { serial_counter: { $gte: 0, $lte: Number.MAX_SAFE_INTEGER - count } },
      ],
    },
    { $inc: { serial_counter: count } },
    { returnDocument: "after", projection: { serial_counter: 1 } },
  );
  const last = artwork?.serial_counter;
  if (last === undefined || !Number.isSafeInteger(last)) {
    throw new Error(`Artwork ${artworkId} is missing or its serial counter is invalid or exhausted.`);
  }
  return Array.from({ length: count }, (_, index) => last - count + index + 1);
}

export async function assignItemSerialNumbers(
  database: Db,
  items: GameItem[],
): Promise<void> {
  if (items.some((item) => item.original)) {
    await ensureOriginalItemIndex(database);
  }
  const genuineByArtwork = new Map<string, GameItem[]>();
  for (const item of items) {
    if (item.original) {
      item.serial_number = 0;
      if (item.authenticity?.forgery) {
        item.serial_prefix ??= getArtworkSerialPrefix(item.artwork_id);
      } else {
        delete item.serial_prefix;
      }
      continue;
    }
    if (item.authenticity?.forgery) {
      if (item.serial_number === undefined) {
        item.serial_number = createRandomForgerySerial(item.artwork_id).serial_number;
      }
      if (!Number.isSafeInteger(item.serial_number) || item.serial_number < 1) {
        throw new Error("Non-Original items must have a positive serial number.");
      }
      item.serial_prefix ??= getArtworkSerialPrefix(item.artwork_id);
      continue;
    }
    const group = genuineByArtwork.get(item.artwork_id) ?? [];
    group.push(item);
    genuineByArtwork.set(item.artwork_id, group);
  }
  await Promise.all([...genuineByArtwork].map(async ([artworkId, group]) => {
    const numbers = await allocateArtworkSerialNumbers(database, artworkId, group.length);
    group.forEach((item, index) => {
      item.serial_number = numbers[index];
      delete item.serial_prefix;
    });
  }));
}

async function demoteDuplicateOriginals(database: Db): Promise<number> {
  const items = database.collection<GameItem>("items");
  const duplicates = await items.aggregate<{ _id: string }>([
    { $match: { original: true } },
    { $group: { _id: "$artwork_id", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();
  if (duplicates.length === 0) return 0;

  // Pricing is loaded during migration, not while gameplay imports the allocator.
  const [{ calculateItemValues }, metadata, artworks] = await Promise.all([
    import("./gameplay.ts"),
    database.collection<{ _id: string; loot_data: LootData }>("metadata")
      .findOne({ _id: "loot-data" }),
    database.collection<Artwork>("artworks")
      .find({ _id: { $in: duplicates.map((entry) => entry._id) } }).toArray(),
  ]);
  if (!metadata || artworks.length !== duplicates.length) {
    throw new Error("Artwork and loot metadata are required to reprice duplicate Originals.");
  }
  const artworkById = new Map(artworks.map((artwork) => [artwork._id, artwork]));
  let operations: AnyBulkWriteOperation<GameItem>[] = [];
  let demoted = 0;
  async function flush() {
    if (operations.length === 0) return;
    demoted += (await items.bulkWrite(operations)).modifiedCount;
    operations = [];
  }
  for (const entry of duplicates) {
    const artwork = artworkById.get(entry._id)!;
    let oldest = true;
    for await (const item of items.find({ artwork_id: entry._id, original: true })
      .sort({ date_created: 1, _id: 1 })) {
      if (oldest) {
        oldest = false;
        continue;
      }
      operations.push({
        updateOne: {
          filter: { _id: item._id, original: true },
          update: {
            $set: {
              original: false,
              values: calculateItemValues(
                { ...item, original: false },
                { ...artwork, ...item.artwork_overrides },
                metadata.loot_data,
              ),
            },
          },
        },
      });
      if (operations.length === 500) await flush();
    }
  }
  await flush();
  return demoted;
}

export async function backfillItemSerialNumbers(database: Db) {
  const artworks = database.collection<Artwork>("artworks");
  const prefixIds = new Map<number, string>();
  for await (const artwork of artworks.find({}).project<Artwork>({
    serial_counter: 1,
  })) {
    if (
      artwork.serial_counter !== undefined &&
      (!Number.isSafeInteger(artwork.serial_counter) || artwork.serial_counter < 0)
    ) {
      throw new Error(`Artwork ${artwork._id} has an invalid serial counter.`);
    }
    const prefix = getArtworkSerialPrefix(artwork._id);
    const otherId = prefixIds.get(prefix);
    if (otherId !== undefined && otherId !== artwork._id) {
      throw new Error(`Artwork serial prefix collision between ${otherId} and ${artwork._id}.`);
    }
    prefixIds.set(prefix, artwork._id);
  }
  const initialized = await artworks.updateMany(
    { serial_counter: { $exists: false } },
    { $set: { serial_counter: 0 } },
  );
  const items = database.collection<GameItem>("items");
  const existing = items.aggregate<{ _id: string; last: number }>([
    { $match: { "authenticity.forgery": { $ne: true }, serial_number: { $type: "number", $gt: 0 } } },
    { $group: { _id: "$artwork_id", last: { $max: "$serial_number" } } },
  ]);
  for await (const entry of existing) {
    if (!Number.isSafeInteger(entry.last) || entry.last < 1) {
      throw new Error(`Artwork ${entry._id} has an invalid existing item serial number.`);
    }
    await artworks.updateOne({ _id: entry._id }, { $max: { serial_counter: entry.last } });
  }
  const originalsDemoted = await demoteDuplicateOriginals(database);
  await ensureOriginalItemIndex(database);

  let updated = 0;
  async function serializePending(filter: Filter<GameItem>) {
    let batch: GameItem[] = [];
    async function flush() {
      if (batch.length === 0) return;
      for (const item of batch) {
        if (!item.original && item.authenticity?.forgery && item.serial_number === 0) {
          delete item.serial_number;
        }
      }
      await assignItemSerialNumbers(database, batch);
      const operations: AnyBulkWriteOperation<GameItem>[] = batch.map((item) => ({
        updateOne: {
          filter: { _id: item._id, ...filter },
          update: {
            $set: {
              serial_number: item.serial_number,
              ...(item.authenticity?.forgery ? { serial_prefix: item.serial_prefix } : {}),
            },
            ...(!item.authenticity?.forgery ? { $unset: { serial_prefix: "" } } : {}),
          },
        },
      }));
      updated += (await items.bulkWrite(operations)).modifiedCount;
      batch = [];
    }
    const pending = items.find(filter)
      .sort({ date_created: 1, _id: 1 })
      .project<GameItem>({
        artwork_id: 1, date_created: 1, authenticity: 1,
        original: 1, serial_number: 1, serial_prefix: 1,
      });
    for await (const item of pending) {
      batch.push(item);
      if (batch.length === 500) await flush();
    }
    await flush();
  }
  await serializePending({
    original: { $ne: true },
    $or: [{ serial_number: { $exists: false } }, { serial_number: 0 }],
  });
  await serializePending({
    original: true,
    $or: [
      { serial_number: { $ne: 0 } },
      { "authenticity.forgery": true, serial_prefix: { $exists: false } },
      { "authenticity.forgery": { $ne: true }, serial_prefix: { $exists: true } },
    ],
  });
  await items.createIndex(
    { artwork_id: 1, serial_number: 1 },
    {
      name: "genuine_artwork_serial_unique",
      unique: true,
      partialFilterExpression: {
        "authenticity.forgery": { $in: [false, null] },
        serial_number: { $type: "number" },
      },
    },
  );
  return {
    artworksInitialized: initialized.modifiedCount,
    itemsUpdated: updated,
    originalsDemoted,
  };
}
