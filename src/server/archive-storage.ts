import "server-only";

import type { Db } from "mongodb";

import {
  createArchiveEntry,
  type ArchiveEntry,
  type PlayerArtworkArchive,
} from "./archive-gameplay.ts";
import type { GameItem } from "./gameplay.ts";

type LegacyArchivedItem = Omit<GameItem, "status"> & {
  status: "archived";
  time_archived?: string;
};

declare global {
  var artfunkelArchiveStoragePromise: Promise<void> | undefined;
}

export async function ensureArchiveStorage(database: Db): Promise<void> {
  global.artfunkelArchiveStoragePromise ??= migrateAndIndexArchive(database)
    .catch((error) => {
      global.artfunkelArchiveStoragePromise = undefined;
      throw error;
    });
  return global.artfunkelArchiveStoragePromise;
}

export async function addItemToArchiveRecord(
  database: Db,
  item: GameItem | LegacyArchivedItem,
  archivedAt: string,
): Promise<boolean> {
  const entry = createArchiveEntry(item, archivedAt);
  const archiveId = getArchiveId(item.owner, item.artwork_id);
  const collection = database.collection<PlayerArtworkArchive>(
    "player_artwork_archives",
  );
  const filter = {
    _id: archiveId,
    "entries.source_item_id": { $ne: item._id },
  };
  const update = {
    $setOnInsert: {
      owner: item.owner,
      artwork_id: item.artwork_id,
      created_at: archivedAt,
    },
    $set: { updated_at: archivedAt },
    $push: { entries: entry },
    $inc: {
      archived_count: 1,
      combined_value: entry.value,
    },
  };
  try {
    const result = await collection.updateOne(filter, update, {
      upsert: true,
    });
    return result.upsertedCount === 1 || result.modifiedCount === 1;
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const retry = await collection.updateOne(filter, update);
    if (retry.modifiedCount === 1) return true;
    const existing = await collection.findOne({
      _id: archiveId,
      "entries.source_item_id": item._id,
    });
    if (existing) return false;
    throw error;
  }
}

export async function removeItemFromArchiveRecord(
  database: Db,
  owner: string,
  artworkId: string,
  entry: ArchiveEntry,
): Promise<void> {
  const archiveId = getArchiveId(owner, artworkId);
  const archive = await database
    .collection<PlayerArtworkArchive>("player_artwork_archives")
    .findOne({
      _id: archiveId,
      "entries.source_item_id": entry.source_item_id,
    });
  if (!archive) {
    throw new Error(
      `Unable to find archive contribution ${entry.source_item_id}.`,
    );
  }

  if (archive.entries.length === 1) {
    const removed = await database
      .collection<PlayerArtworkArchive>("player_artwork_archives")
      .deleteOne({
        _id: archiveId,
        archived_count: 1,
        "entries.source_item_id": entry.source_item_id,
      });
    if (removed.deletedCount !== 1) {
      throw new Error(`Unable to remove archive record ${archiveId}.`);
    }
    return;
  }

  const removed = await database
    .collection<PlayerArtworkArchive>("player_artwork_archives")
    .updateOne(
      {
        _id: archiveId,
        "entries.source_item_id": entry.source_item_id,
      },
      {
        $pull: {
          entries: { source_item_id: entry.source_item_id },
        },
        $inc: {
          archived_count: -1,
          combined_value: -entry.value,
        },
        $set: { updated_at: new Date().toISOString() },
      },
    );
  if (removed.modifiedCount !== 1) {
    throw new Error(
      `Unable to remove archive contribution ${entry.source_item_id}.`,
    );
  }
}

async function migrateAndIndexArchive(database: Db): Promise<void> {
  const archivedItems = await database
    .collection<LegacyArchivedItem>("items")
    .find({ status: "archived" })
    .toArray();
  archivedItems.sort(
    (left, right) =>
      getLegacyArchiveTime(left).localeCompare(getLegacyArchiveTime(right)) ||
      left._id.localeCompare(right._id),
  );

  for (const item of archivedItems) {
    await addItemToArchiveRecord(
      database,
      item,
      getLegacyArchiveTime(item),
    );
    const removed = await database
      .collection<LegacyArchivedItem>("items")
      .deleteOne({ _id: item._id, status: "archived" });
    if (removed.deletedCount !== 1) {
      throw new Error(`Unable to remove migrated archive item ${item._id}.`);
    }
  }

  await normalizeArchiveRecords(database);
  await database
    .collection<PlayerArtworkArchive>("player_artwork_archives")
    .createIndex({ owner: 1, artwork_id: 1 }, { unique: true });
  await database
    .collection<GameItem>("items")
    .dropIndex("owner_1_archive_slot_key_1")
    .catch((error: unknown) => {
      if (!isIndexNotFoundError(error)) throw error;
    });
}

async function normalizeArchiveRecords(database: Db): Promise<void> {
  const collection = database.collection<PlayerArtworkArchive>(
    "player_artwork_archives",
  );
  const archives = await collection.find({}).toArray();
  for (const archive of archives) {
    if (archive.entries.length === 0) {
      await collection.deleteOne({ _id: archive._id });
      continue;
    }
    const timestamps = archive.entries
      .map((entry) => entry.archived_at)
      .sort();
    await collection.updateOne(
      { _id: archive._id },
      {
        $set: {
          archived_count: archive.entries.length,
          combined_value: archive.entries.reduce(
            (total, entry) => total + entry.value,
            0,
          ),
          created_at: timestamps[0],
          updated_at: timestamps[timestamps.length - 1],
        },
      },
    );
  }
}

function getLegacyArchiveTime(item: LegacyArchivedItem): string {
  return item.time_archived ?? item.date_received ?? item.date_created;
}

function getArchiveId(owner: string, artworkId: string): string {
  return `${owner}:${artworkId}`;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

function isIndexNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "codeName" in error &&
    error.codeName === "IndexNotFound"
  );
}
