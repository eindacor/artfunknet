import "server-only";

import type { Db } from "mongodb";

import type { GameItem } from "./gameplay";
import { hydrateGameItems, type HydratedGameItem } from "./item-artwork";
import {
  getPublicGalleryItemFilter,
  prepareItemForPublicViewer,
} from "./public-showcase-core";

export type PublicGalleryOwner = {
  playerId: string;
  screenName: string;
  level: number;
  vintageLevel: number;
};

type PublicPlayerRecord = {
  _id: string;
  active: boolean;
  screen_name: string;
  profile: {
    level: number;
    vintage_count?: number;
  };
};

export type PublicItemView = {
  item: HydratedGameItem;
  owner: Pick<PublicGalleryOwner, "playerId" | "screenName"> | null;
  displayOwner: PublicGalleryOwner | null;
};

export type PublicGalleryView = {
  owner: PublicGalleryOwner;
  items: HydratedGameItem[];
};

export async function getPublicItemView(
  database: Db,
  itemId: string,
  viewerId: string | null,
): Promise<PublicItemView | null> {
  const rawItem = await database.collection<GameItem>("items").findOne({
    _id: itemId,
  });
  if (!rawItem) return null;

  const shared = rawItem.status === "displayed" || (rawItem.permanent && rawItem.status === "claimed");
  const ownerRecord = await database
    .collection<PublicPlayerRecord>("players")
    .findOne(
      { _id: rawItem.owner, active: true, account_deletion: { $ne: true } },
      {
        projection: {
          _id: 1,
          screen_name: 1,
          "profile.level": 1,
          "profile.vintage_count": 1,
        },
      },
    );
  const [item] = await hydrateGameItems(database, [
    prepareItemForPublicViewer(rawItem, viewerId),
  ]);

  return {
    item,
    owner: ownerRecord ? { playerId: ownerRecord._id, screenName: ownerRecord.screen_name } : null,
    displayOwner: shared
      ? {
          playerId: rawItem.owner,
          screenName: ownerRecord?.screen_name ?? "[redacted]",
          level: ownerRecord?.profile.level ?? 1,
          vintageLevel: ownerRecord?.profile.vintage_count ?? 0,
        }
      : null,
  };
}

export async function getPublicGalleryView(
  database: Db,
  playerId: string,
  viewerId: string | null,
): Promise<PublicGalleryView | null> {
  const owner = await database
    .collection<PublicPlayerRecord>("players")
    .findOne(
      { _id: playerId, active: true, account_deletion: { $ne: true } },
      {
        projection: {
          _id: 1,
          screen_name: 1,
          "profile.level": 1,
          "profile.vintage_count": 1,
        },
      },
    );
  if (!owner) return null;

  const [rawItems, vintageItemCount] = await Promise.all([
    database
      .collection<GameItem>("items")
      .find(getPublicGalleryItemFilter(owner._id))
      .sort({ time_displayed: 1, date_received: 1 })
      .toArray(),
    database.collection<GameItem>("items").countDocuments({
      owner: owner._id,
      vintage: true,
    }),
  ]);
  const items = await hydrateGameItems(
    database,
    rawItems.map((item) => prepareItemForPublicViewer(item, viewerId)),
  );

  return {
    owner: {
      playerId: owner._id,
      screenName: owner.screen_name,
      level: owner.profile.level,
      vintageLevel: Math.max(
        owner.profile.vintage_count ?? 0,
        vintageItemCount,
      ),
    },
    items,
  };
}
