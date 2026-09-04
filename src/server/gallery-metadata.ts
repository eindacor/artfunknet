import "server-only";

import type { Db } from "mongodb";

import type { Artwork, ArtworkRarity, GameItem } from "./gameplay";
import {
  buildGalleryMetadataSnapshot,
  type GalleryAttributeAggregate,
} from "./gallery-metadata-core";

type GalleryPlayer = {
  _id: string;
  active: boolean;
  screen_name: string;
};

export type GalleryMetadata = {
  _id: string;
  schema_version: 2;
  owner_id: string;
  owner: string;
  value: number;
  score: number;
  display_count: number;
  attributes: GalleryAttributeAggregate[];
  display_rarities: ArtworkRarity[];
  active_unique_attributes: string[];
  featured_item_id: string | null;
  featured_artwork_id: string | null;
  featured_value: number;
  updated_at: string;
};

export async function refreshGalleryMetadata(
  database: Db,
  playerId: string,
  now = new Date(),
): Promise<GalleryMetadata | null> {
  const player = await database
    .collection<GalleryPlayer>("players")
    .findOne(
      { _id: playerId, active: true },
      { projection: { _id: 1, active: 1, screen_name: 1 } },
    );
  if (!player) {
    await database
      .collection<GalleryMetadata>("galleries")
      .deleteMany({ owner_id: playerId });
    return null;
  }

  const items = await database
    .collection<GameItem>("items")
    .find({ owner: playerId, status: "displayed" })
    .toArray();
  const artworkIds = [...new Set(items.map((item) => item.artwork_id))];
  const artworks =
    artworkIds.length > 0
      ? await database
          .collection<Artwork>("artworks")
          .find({ _id: { $in: artworkIds } })
          .project<Pick<Artwork, "_id" | "rarity">>({
            _id: 1,
            rarity: 1,
          })
          .toArray()
      : [];
  const rarityByArtworkId = new Map(
    artworks.map((artwork) => [artwork._id, artwork.rarity]),
  );
  const metadata: Omit<GalleryMetadata, "_id"> = {
    schema_version: 2,
    owner_id: playerId,
    owner: player.screen_name,
    ...buildGalleryMetadataSnapshot(items, rarityByArtworkId),
    updated_at: now.toISOString(),
  };
  const record: GalleryMetadata = { _id: playerId, ...metadata };
  const galleries = database.collection<GalleryMetadata>("galleries");
  const existing = await galleries.findOne(
    { owner_id: playerId },
    { projection: { _id: 1 } },
  );
  if (existing) {
    await galleries.replaceOne({ _id: existing._id }, metadata);
    return { ...record, _id: existing._id };
  }

  await galleries.insertOne(record);
  return record;
}

export async function ensureGalleryMetadata(
  database: Db,
): Promise<void> {
  const [players, galleries] = await Promise.all([
    database
      .collection<GalleryPlayer>("players")
      .find({ active: true })
      .project<Pick<GalleryPlayer, "_id">>({ _id: 1 })
      .toArray(),
    database
      .collection<GalleryMetadata>("galleries")
      .find({})
      .project<Pick<GalleryMetadata, "owner_id" | "schema_version">>({
        owner_id: 1,
        schema_version: 1,
      })
      .toArray(),
  ]);
  const currentOwnerIds = new Set(
    galleries
      .filter((gallery) => gallery.schema_version === 2)
      .map((gallery) => gallery.owner_id),
  );
  for (const player of players) {
    if (!currentOwnerIds.has(player._id)) {
      await refreshGalleryMetadata(database, player._id);
    }
  }
}

export async function refreshAllGalleryMetadata(
  database: Db,
): Promise<void> {
  const players = await database
    .collection<GalleryPlayer>("players")
    .find({ active: true })
    .project<Pick<GalleryPlayer, "_id">>({ _id: 1 })
    .toArray();
  for (const player of players) {
    await refreshGalleryMetadata(database, player._id);
  }
  await database.collection<GalleryMetadata>("galleries").deleteMany({
    owner_id: { $nin: players.map((player) => player._id) },
  });
}
