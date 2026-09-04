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
};

type PublicPlayerRecord = {
  _id: string;
  active: boolean;
  screen_name: string;
};

export type PublicItemView = {
  item: HydratedGameItem;
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

  const displayOwnerRecord =
    rawItem.status === "displayed"
      ? await database
          .collection<PublicPlayerRecord>("players")
          .findOne(
            { _id: rawItem.owner, active: true },
            { projection: { _id: 1, screen_name: 1 } },
          )
      : null;
  const [item] = await hydrateGameItems(database, [
    prepareItemForPublicViewer(rawItem, viewerId),
  ]);

  return {
    item,
    displayOwner: displayOwnerRecord
      ? {
          playerId: displayOwnerRecord._id,
          screenName: displayOwnerRecord.screen_name,
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
      { _id: playerId, active: true },
      { projection: { _id: 1, screen_name: 1 } },
    );
  if (!owner) return null;

  const rawItems = await database
    .collection<GameItem>("items")
    .find(getPublicGalleryItemFilter(owner._id))
    .sort({ time_displayed: 1, date_received: 1 })
    .toArray();
  const items = await hydrateGameItems(
    database,
    rawItems.map((item) => prepareItemForPublicViewer(item, viewerId)),
  );

  return {
    owner: {
      playerId: owner._id,
      screenName: owner.screen_name,
    },
    items,
  };
}
