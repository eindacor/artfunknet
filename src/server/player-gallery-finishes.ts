import type { Db } from "mongodb";

import {
  getGalleryFinishes,
  isGalleryFinishId,
  parseGalleryFinishUpdate,
  type GalleryFinishes,
  type PlayerGalleryFinishes,
} from "./gallery-finishes.ts";

type FinishPlayer = {
  _id: string;
  active: boolean;
  gallery_finishes?: PlayerGalleryFinishes | null;
  updated_at?: Date;
};

type FinishGallery = {
  _id: string;
  owner_id: string;
  active: boolean;
};

export async function getPlayerGalleryFinishes(
  database: Db,
  playerId: string,
  galleryId: string,
): Promise<GalleryFinishes> {
  const players = database.collection<FinishPlayer>("players");
  const player = await players.findOne(
    { _id: playerId, active: true },
    { projection: { gallery_finishes: 1 } },
  );
  const stored = player?.gallery_finishes;
  const value = stored && Object.hasOwn(stored, galleryId)
    ? stored[galleryId]
    : undefined;
  const finishes = getGalleryFinishes(value);
  if (player && value === undefined && isGalleryFinishId(galleryId)) {
    if (stored === null) {
      await players.updateOne(
        { _id: playerId, active: true, gallery_finishes: null },
        { $set: { gallery_finishes: {} } },
      );
    }
    const path = `gallery_finishes.${galleryId}`;
    await players.updateOne(
      { _id: playerId, active: true, [path]: { $exists: false } },
      { $set: { [path]: finishes } },
    );
  }
  return finishes;
}

export async function savePlayerGalleryFinishes(
  database: Db,
  playerId: string,
  galleryId: string,
  finishes: GalleryFinishes,
): Promise<boolean> {
  const update = parseGalleryFinishUpdate({ galleryId, finishes });
  if (!update) return false;
  const gallery = await database.collection<FinishGallery>("galleries").findOne({
    _id: galleryId,
    owner_id: playerId,
    active: true,
  });
  if (!gallery) return false;

  const players = database.collection<FinishPlayer>("players");
  await players.updateOne(
    { _id: playerId, active: true, gallery_finishes: null },
    { $set: { gallery_finishes: {} } },
  );
  const result = await players.updateOne(
    { _id: playerId, active: true },
    {
      $set: {
        [`gallery_finishes.${galleryId}`]: update.finishes,
        updated_at: new Date(),
      },
    },
  );
  return result.matchedCount === 1;
}
