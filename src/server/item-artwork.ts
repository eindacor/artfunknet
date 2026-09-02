import type { Db } from "mongodb";

import {
  getArchiveRecordArtStyles,
  getArchiveRecordModifiers,
  type ArchiveCategory,
  type PlayerArtworkArchive,
} from "./archive-gameplay.ts";
import type { Artwork, GameItem } from "./gameplay.ts";
import type { ItemPermission } from "./item-permissions.ts";

export type HydratedGameItem = GameItem & {
  artwork: Artwork;
  archivePermission?: ItemPermission;
  authenticationPermission?:
    | { allowed: true; cost: number }
    | { allowed: false; reason: string };
  redemptionPermission?: ItemPermission;
  archivedArtStyles?: string[];
  archivedCategories?: ArchiveCategory[];
};

export type HydratedPlayerArtworkArchive = PlayerArtworkArchive & {
  artwork: Artwork;
  modifiers: ArchiveCategory[];
  artStyles: string[];
};

export async function hydrateGameItems(
  database: Db,
  items: GameItem[],
): Promise<HydratedGameItem[]> {
  if (items.length === 0) return [];

  const artworkIds = [...new Set(items.map((item) => item.artwork_id))];
  const artworks = await database
    .collection<Artwork>("artworks")
    .find({ _id: { $in: artworkIds } })
    .project<Artwork>({ market_data: 0 })
    .toArray();
  const artworkById = new Map(
    artworks.map((artwork) => [artwork._id, artwork]),
  );

  return items.map((item) => {
    const artwork = artworkById.get(item.artwork_id);
    if (!artwork) {
      throw new Error(
        `Item ${item._id} references missing artwork ${item.artwork_id}.`,
      );
    }

    return {
      ...item,
      artwork: { ...artwork, ...item.artwork_overrides },
    };
  });
}

export async function hydratePlayerArtworkArchives(
  database: Db,
  archives: PlayerArtworkArchive[],
): Promise<HydratedPlayerArtworkArchive[]> {
  if (archives.length === 0) return [];

  const artworkIds = [
    ...new Set(archives.map((archive) => archive.artwork_id)),
  ];
  const artworks = await database
    .collection<Artwork>("artworks")
    .find({ _id: { $in: artworkIds } })
    .project<Artwork>({ market_data: 0 })
    .toArray();
  const artworkById = new Map(
    artworks.map((artwork) => [artwork._id, artwork]),
  );

  return archives.flatMap((archive) => {
    const artwork = artworkById.get(archive.artwork_id);
    return artwork
      ? [
          {
            ...archive,
            artwork,
            modifiers: getArchiveRecordModifiers(archive),
            artStyles: getArchiveRecordArtStyles(archive),
          },
        ]
      : [];
  });
}
