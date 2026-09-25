import { randomUUID } from "node:crypto";

import type { Db } from "mongodb";

import type { Artwork, GameItem } from "./gameplay.ts";
import type { HydratedGameItem } from "./item-artwork.ts";

export type PlaythroughStats = {
  visitors_met: number;
  items_collected: number;
  money_spent: number;
};

export type PlaythroughSnapshot = {
  _id: string;
  player_id: string;
  playthrough_number: number;
  created_at: string;
  selected_vintage_item: HydratedGameItem;
  gallery_snapshot: HydratedGameItem[];
  stats: PlaythroughStats;
};

type StoredSnapshotItem = GameItem & {
  artwork?: Artwork;
  artwork_title?: string;
  artist_name?: string;
};

type StoredPlaythroughSnapshot = Omit<
  PlaythroughSnapshot,
  "selected_vintage_item" | "gallery_snapshot"
> & {
  selected_vintage_item: StoredSnapshotItem;
  gallery_snapshot: StoredSnapshotItem[];
};

export async function savePlaythroughSnapshot(
  database: Db,
  snapshotData: Omit<PlaythroughSnapshot, "_id">,
): Promise<PlaythroughSnapshot> {
  const snapshot: PlaythroughSnapshot = {
    _id: randomUUID(),
    ...snapshotData,
  };
  await database.collection<PlaythroughSnapshot>("playthrough_snapshots").insertOne(snapshot);
  return snapshot;
}

export async function getPlayerPlaythroughHistory(
  database: Db,
  playerId: string,
): Promise<PlaythroughSnapshot[]> {
  const snapshots = await database
    .collection<StoredPlaythroughSnapshot>("playthrough_snapshots")
    .find({ player_id: playerId })
    .sort({ playthrough_number: -1 })
    .toArray();

  const snapshotItems = snapshots.flatMap((snapshot) => [
    snapshot.selected_vintage_item,
    ...snapshot.gallery_snapshot,
  ]);
  const missingArtworkIds = [
    ...new Set(
      snapshotItems
        .filter((item) => !item.artwork)
        .map((item) => item.artwork_id),
    ),
  ];
  const artworks =
    missingArtworkIds.length > 0
      ? await database
          .collection<Artwork>("artworks")
          .find({ _id: { $in: missingArtworkIds } })
          .toArray()
      : [];
  const artworkById = new Map(artworks.map((artwork) => [artwork._id, artwork]));

  function hydrateSnapshotItem(item: StoredSnapshotItem): HydratedGameItem {
    const artwork = item.artwork ?? artworkById.get(item.artwork_id);
    if (!artwork) {
      throw new Error(
        `Playthrough snapshot item ${item._id} references missing artwork ${item.artwork_id}.`,
      );
    }
    return {
      ...item,
      artwork: { ...artwork, ...item.artwork_overrides },
    };
  }

  return snapshots.map((snapshot) => ({
    ...snapshot,
    selected_vintage_item: hydrateSnapshotItem(
      snapshot.selected_vintage_item,
    ),
    gallery_snapshot: snapshot.gallery_snapshot.map(hydrateSnapshotItem),
  }));
}
