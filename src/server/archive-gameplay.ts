import {
  ARTWORK_RARITIES,
  type ArtworkRarity,
  type GameItem,
} from "./gameplay.ts";

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

export const ARCHIVE_FILTER_CATEGORIES = ARCHIVE_CATEGORIES.filter(
  (category): category is Exclude<ArchiveCategory, "standard"> =>
    category !== "standard",
);
export type ArchiveFilterCategory = (typeof ARCHIVE_FILTER_CATEGORIES)[number];
export type ArchiveFilterMode = "any" | "only" | "exclude";

export const ARCHIVE_SORTS = [
  "newest",
  "oldest",
  "value-high",
  "value-low",
  "title",
  "title-desc",
  "artist",
  "artist-desc",
  "rarity",
  "rarity-low",
  "progress-high",
  "progress-low",
  "count-high",
  "count-low",
  "artwork-newest",
  "artwork-oldest",
] as const;
export type ArchiveSort = (typeof ARCHIVE_SORTS)[number];

export type ArchiveBrowseFilters = {
  search: string;
  rarity: ArtworkRarity | "all";
  completion: "all" | "complete" | "incomplete";
  artStyle: string;
  variants: Record<ArchiveFilterCategory, ArchiveFilterMode>;
  sort: ArchiveSort;
};

export type ArchiveBrowseEntry = {
  archive: {
    _id: string;
    modifiers: readonly ArchiveCategory[];
    artStyles: readonly string[];
    combined_value: number;
    archived_count: number;
    updated_at: string;
    artwork: {
      title: string;
      artist: string;
      rarity: ArtworkRarity;
      date: string | number;
    };
  };
  progress: {
    archived: number;
    total: number;
  };
  complete: boolean;
};

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

export function getArchivePropertyOptions(
  archive: {
    modifiers: readonly ArchiveCategory[];
    artStyles: readonly string[];
  },
  {
    activeArtStyles,
    seasonalEligible,
  }: {
    activeArtStyles: readonly string[];
    seasonalEligible: boolean;
  },
): { modifiers: ArchiveCategory[]; artStyles: string[] } {
  const archivedModifiers = new Set(archive.modifiers);
  return {
    modifiers: ARCHIVE_CATEGORIES.filter(
      (category) =>
        category !== "seasonal" ||
        seasonalEligible ||
        archivedModifiers.has("seasonal"),
    ),
    artStyles: [
      ...new Set([
        ...activeArtStyles.filter((style) => style !== "museum"),
        ...archive.artStyles.filter((style) => style !== "museum"),
      ]),
    ],
  };
}

export function getArchivePropertyProgress(
  archive: {
    modifiers: readonly ArchiveCategory[];
    artStyles: readonly string[];
  },
  options: {
    activeArtStyles: readonly string[];
    seasonalEligible: boolean;
  },
): { archived: number; total: number } {
  const possible = getArchivePropertyOptions(archive, options);
  const archivedModifiers = new Set(archive.modifiers);
  const archivedArtStyles = new Set(
    archive.artStyles.filter((style) => style !== "museum"),
  );

  return {
    archived:
      possible.modifiers.filter((category) => archivedModifiers.has(category))
        .length + archivedArtStyles.size,
    total: possible.modifiers.length + possible.artStyles.length,
  };
}

export function getArchiveCategories(
  item: ArchiveProperties,
): ArchiveCategory[] {
  const categories: ArchiveCategory[] = ["standard"];
  if (item.mint) categories.push("mint");
  if (item.foil) categories.push("foil");
  if (item.unlocked) categories.push("unlocked");
  if (item.seasonal) categories.push("seasonal");
  if (item.vintage) categories.push("vintage");
  if (item.lottery > 0) categories.push("lottery");
  return categories;
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
  if (archive.entries.length > 0) modifiers.add("standard");
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
  if (archivedModifiers.length > 0 || archivedArtStyles.length > 0) {
    modifierSet.add("standard");
  }
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

export function getDefaultArchiveBrowseFilters(): ArchiveBrowseFilters {
  return {
    search: "",
    rarity: "all",
    completion: "all",
    artStyle: "",
    variants: Object.fromEntries(
      ARCHIVE_FILTER_CATEGORIES.map((category) => [category, "any"]),
    ) as Record<ArchiveFilterCategory, ArchiveFilterMode>,
    sort: "newest",
  };
}

export function filterAndSortArchiveEntries<T extends ArchiveBrowseEntry>(
  entries: readonly T[],
  filters: ArchiveBrowseFilters,
): T[] {
  const search = filters.search.trim().toLocaleLowerCase();
  return entries
    .filter(({ archive, complete }) => {
      if (
        search &&
        !archive.artwork.title.toLocaleLowerCase().includes(search) &&
        !archive.artwork.artist.toLocaleLowerCase().includes(search)
      ) {
        return false;
      }
      if (
        filters.rarity !== "all" &&
        archive.artwork.rarity !== filters.rarity
      ) {
        return false;
      }
      if (
        filters.completion !== "all" &&
        (filters.completion === "complete") !== complete
      ) {
        return false;
      }
      if (
        filters.artStyle &&
        !archive.artStyles.includes(filters.artStyle)
      ) {
        return false;
      }
      return ARCHIVE_FILTER_CATEGORIES.every((category) => {
        const hasCategory = archive.modifiers.includes(category);
        const mode = filters.variants[category];
        return (
          mode === "any" ||
          (mode === "only" && hasCategory) ||
          (mode === "exclude" && !hasCategory)
        );
      });
    })
    .sort(getArchiveBrowseComparator(filters.sort));
}

function getArchiveBrowseComparator<T extends ArchiveBrowseEntry>(
  sort: ArchiveSort,
): (left: T, right: T) => number {
  return (left, right) => {
    let comparison = 0;
    switch (sort) {
      case "oldest":
        comparison =
          Date.parse(left.archive.updated_at) -
          Date.parse(right.archive.updated_at);
        break;
      case "value-high":
        comparison =
          right.archive.combined_value - left.archive.combined_value;
        break;
      case "value-low":
        comparison =
          left.archive.combined_value - right.archive.combined_value;
        break;
      case "title":
        comparison = compareArchiveText(
          left.archive.artwork.title,
          right.archive.artwork.title,
        );
        break;
      case "title-desc":
        comparison = compareArchiveText(
          right.archive.artwork.title,
          left.archive.artwork.title,
        );
        break;
      case "artist":
        comparison = compareArchiveText(
          left.archive.artwork.artist,
          right.archive.artwork.artist,
        );
        break;
      case "artist-desc":
        comparison = compareArchiveText(
          right.archive.artwork.artist,
          left.archive.artwork.artist,
        );
        break;
      case "rarity":
        comparison =
          ARTWORK_RARITIES.indexOf(right.archive.artwork.rarity) -
          ARTWORK_RARITIES.indexOf(left.archive.artwork.rarity);
        break;
      case "rarity-low":
        comparison =
          ARTWORK_RARITIES.indexOf(left.archive.artwork.rarity) -
          ARTWORK_RARITIES.indexOf(right.archive.artwork.rarity);
        break;
      case "progress-high":
        comparison =
          getArchiveProgressRatio(right) - getArchiveProgressRatio(left);
        break;
      case "progress-low":
        comparison =
          getArchiveProgressRatio(left) - getArchiveProgressRatio(right);
        break;
      case "count-high":
        comparison =
          right.archive.archived_count - left.archive.archived_count;
        break;
      case "count-low":
        comparison =
          left.archive.archived_count - right.archive.archived_count;
        break;
      case "artwork-newest":
        comparison =
          Number(right.archive.artwork.date) -
          Number(left.archive.artwork.date);
        break;
      case "artwork-oldest":
        comparison =
          Number(left.archive.artwork.date) -
          Number(right.archive.artwork.date);
        break;
      case "newest":
        comparison =
          Date.parse(right.archive.updated_at) -
          Date.parse(left.archive.updated_at);
        break;
    }
    return (
      comparison ||
      Date.parse(right.archive.updated_at) -
        Date.parse(left.archive.updated_at) ||
      left.archive._id.localeCompare(right.archive._id)
    );
  };
}

function getArchiveProgressRatio(entry: ArchiveBrowseEntry): number {
  return entry.progress.total > 0
    ? entry.progress.archived / entry.progress.total
    : 0;
}

function compareArchiveText(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}
