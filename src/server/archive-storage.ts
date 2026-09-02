import "server-only";

import type { Db } from "mongodb";

import { getArchiveSignature } from "./archive-gameplay.ts";
import type { GameItem } from "./gameplay.ts";

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

async function migrateAndIndexArchive(database: Db): Promise<void> {
  const archivedItems = await database.collection<GameItem>("items").find({
    status: "archived",
  }).toArray();
  if (archivedItems.length > 0) {
    await database.collection<GameItem>("items").updateMany(
      { _id: { $in: archivedItems.map((item) => item._id) } },
      { $unset: { archive_slot_key: "" } },
    );
  }

  const groups = new Map<string, GameItem[]>();
  for (const item of archivedItems) {
    const signature = getArchiveSignature(item);
    await database.collection<GameItem>("items").updateOne(
      { _id: item._id, status: "archived" },
      { $set: { archive_signature: signature } },
    );
    if (item.displaced === true) {
      continue;
    }
    const slotKey = `${item.artwork_id}:${signature}`;
    const key = `${item.owner}:${slotKey}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  for (const items of groups.values()) {
    items.sort(
      (left, right) =>
        new Date(right.time_archived ?? right.date_created).getTime() -
          new Date(left.time_archived ?? left.date_created).getTime() ||
        right._id.localeCompare(left._id),
    );
    const [activeItem, ...duplicates] = items;
    const signature = getArchiveSignature(activeItem);
    const slotKey = `${activeItem.artwork_id}:${signature}`;

    if (duplicates.length > 0) {
      await database.collection<GameItem>("items").updateMany(
        {
          _id: { $in: duplicates.map((item) => item._id) },
          status: "archived",
        },
        {
          $set: { displaced: true },
          $unset: { archive_slot_key: "" },
          $addToSet: { tags: "displaced" },
        },
      );
    }
    await database.collection<GameItem>("items").updateOne(
      { _id: activeItem._id, status: "archived" },
      {
        $set: {
          displaced: false,
          archive_signature: signature,
          archive_slot_key: slotKey,
        },
        $pull: { tags: "displaced" },
      },
    );
  }

  await database.collection<GameItem>("items").createIndex(
    { owner: 1, archive_slot_key: 1 },
    {
      unique: true,
      partialFilterExpression: {
        archive_slot_key: { $type: "string" },
      },
    },
  );
}
