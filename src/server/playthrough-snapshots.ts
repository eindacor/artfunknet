import { randomUUID } from "node:crypto";

import type { Db } from "mongodb";

import type { GameItem } from "./gameplay.ts";

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
  selected_vintage_item: GameItem & { artwork_title?: string; artist_name?: string };
  gallery_snapshot: (GameItem & { artwork_title?: string; artist_name?: string })[];
  stats: PlaythroughStats;
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
  return database
    .collection<PlaythroughSnapshot>("playthrough_snapshots")
    .find({ player_id: playerId })
    .sort({ playthrough_number: -1 })
    .toArray();
}
