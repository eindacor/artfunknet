import type { GameItem } from "./gameplay.ts";

export const ARCHIVE_CATEGORIES = [
  "standard",
  "mint",
  "foil",
  "unlocked",
  "seasonal",
  "vintage",
  "lottery",
] as const;

export type ArchiveCategory = (typeof ARCHIVE_CATEGORIES)[number];

type ArchiveProperties = Pick<
  GameItem,
  "mint" | "foil" | "unlocked" | "seasonal" | "lottery" | "vintage"
>;

export type ArchiveEntry = {
  source_item_id: string;
  modifiers: ArchiveCategory[];
  art_style: string;
  value: number;
  archived_at: string;
};

export type PlayerArtworkArchive = {
  _id: string;
  owner: string;
  artwork_id: string;
  entries: ArchiveEntry[];
  combined_value: number;
  archived_count: number;
  created_at: string;
  updated_at: string;
};

export function getArchiveCategories(
  item: ArchiveProperties,
): ArchiveCategory[] {
  const categories: ArchiveCategory[] = [];
  if (item.mint) categories.push("mint");
  if (item.foil) categories.push("foil");
  if (item.unlocked) categories.push("unlocked");
  if (item.seasonal) categories.push("seasonal");
  if (item.vintage) categories.push("vintage");
  if (item.lottery > 0) categories.push("lottery");
  return categories.length > 0 ? categories : ["standard"];
}

export function getArchiveArtStyle(
  item: Pick<GameItem, "card_renderer">,
): string {
  return item.card_renderer ?? "museum";
}

export function createArchiveEntry(
  item: Pick<
    GameItem,
    | "_id"
    | "card_renderer"
    | "foil"
    | "lottery"
    | "mint"
    | "seasonal"
    | "unlocked"
    | "vintage"
  > & { values: Pick<GameItem["values"], "actual"> },
  archivedAt: string,
): ArchiveEntry {
  return {
    source_item_id: item._id,
    modifiers: getArchiveCategories(item),
    art_style: getArchiveArtStyle(item),
    value: item.values.actual,
    archived_at: archivedAt,
  };
}

export function getArchiveRecordModifiers(
  archive: Pick<PlayerArtworkArchive, "entries">,
): ArchiveCategory[] {
  const modifiers = new Set(
    archive.entries.flatMap((entry) => entry.modifiers),
  );
  return ARCHIVE_CATEGORIES.filter((category) => modifiers.has(category));
}

export function getArchiveRecordArtStyles(
  archive: Pick<PlayerArtworkArchive, "entries">,
): string[] {
  return [
    ...new Set(
      archive.entries
        .map((entry) => entry.art_style)
        .filter((style) => style !== "museum"),
    ),
  ];
}

export function getUnarchivedArchiveData(
  item: ArchiveProperties & Pick<GameItem, "card_renderer">,
  archivedModifiers: readonly ArchiveCategory[] = [],
  archivedArtStyles: readonly string[] = [],
): {
  modifiers: ArchiveCategory[];
  artStyles: string[];
} {
  const modifierSet = new Set(archivedModifiers);
  const artStyleSet = new Set(archivedArtStyles);
  const artStyle = getArchiveArtStyle(item);
  return {
    modifiers: getArchiveCategories(item).filter(
      (category) => !modifierSet.has(category),
    ),
    artStyles:
      artStyle !== "museum" && !artStyleSet.has(artStyle)
        ? [artStyle]
        : [],
  };
}
