import {
  ARTWORK_RARITIES,
  type ArtworkRarity,
  type GameItem,
  type ItemAttribute,
} from "./gameplay.ts";
import type { InventorySort } from "./player-view-settings.ts";

export const COLLECTION_STATUSES = [
  "claimed",
  "displayed",
  "auctioned",
] as const;
export type CollectionStatus = (typeof COLLECTION_STATUSES)[number];

export const COLLECTION_FLAG_KEYS = [
  "repairing",
  "for-sale",
  "foil",
  "unlocked",
  "seasonal",
  "lottery",
  "original",
  "vintage",
  "forgery",
] as const;
export type CollectionFlagKey = (typeof COLLECTION_FLAG_KEYS)[number];
export type CollectionFlagMode = "any" | "only" | "exclude";

export type CollectionFilters = {
  search: string;
  tag: string;
  artStyle: string;
  statuses: CollectionStatus[];
  rarities: ArtworkRarity[];
  flags: Record<CollectionFlagKey, CollectionFlagMode>;
  attributeIds: string[];
  attributeMinimum: number;
  specialAttributeIds: string[];
  specialAttributeMinimum: number;
};

export type CollectionInventoryItem = Pick<
  GameItem,
  | "_id"
  | "artwork_id"
  | "status"
  | "date_received"
  | "condition"
  | "level"
  | "card_renderer"
  | "repairing"
  | "foil"
  | "unlocked"
  | "seasonal"
  | "lottery"
  | "original"
  | "vintage"
  | "tags"
  | "attributes"
  | "authenticity"
  | "values"
> & {
  artwork: {
    title: string;
    artist: string;
    rarity: ArtworkRarity;
    date: string | number;
  };
};

export type CollectionAttributeOption = {
  id: string;
  label: string;
};

export function getDefaultCollectionFilters(): CollectionFilters {
  return {
    search: "",
    tag: "",
    artStyle: "",
    statuses: [...COLLECTION_STATUSES],
    rarities: [...ARTWORK_RARITIES],
    flags: Object.fromEntries(
      COLLECTION_FLAG_KEYS.map((key) => [key, "any"]),
    ) as Record<CollectionFlagKey, CollectionFlagMode>,
    attributeIds: [],
    attributeMinimum: 1,
    specialAttributeIds: [],
    specialAttributeMinimum: 1,
  };
}

export function filterCollectionItems<T extends CollectionInventoryItem>(
  items: readonly T[],
  filters: CollectionFilters,
  now = Date.now(),
): T[] {
  const search = parseCollectionSearch(filters.search);
  const duplicateSourceItems = items.filter((item) =>
    filters.statuses.includes(item.status as CollectionStatus),
  );
  const duplicateArtworkIds = new Set(
    duplicateSourceItems
      .map((item) => item.artwork_id)
      .filter(
        (artworkId, index, artworkIds) =>
          artworkIds.indexOf(artworkId) !==
          artworkIds.lastIndexOf(artworkId),
      ),
  );

  return items.filter((item) => {
    if (!filters.statuses.includes(item.status as CollectionStatus)) {
      return false;
    }
    if (!filters.rarities.includes(item.artwork.rarity)) return false;
    if (filters.tag && !item.tags.includes(filters.tag)) return false;
    if (
      filters.artStyle &&
      (item.card_renderer ?? "museum") !== filters.artStyle
    ) {
      return false;
    }
    if (
      search.tags.length > 0 &&
      !search.tags.some((tag) => item.tags.includes(tag))
    ) {
      return false;
    }
    if (
      search.terms.length > 0 &&
      !search.terms.some(
        (term) =>
          item.artwork.title.toLowerCase().includes(term) ||
          item.artwork.artist.toLowerCase().includes(term),
      )
    ) {
      return false;
    }
    if (
      search.keywords.includes("new") &&
      Date.parse(item.date_received) <= now - 60 * 60 * 1000
    ) {
      return false;
    }
    if (
      search.keywords.includes("dupes") &&
      !duplicateArtworkIds.has(item.artwork_id)
    ) {
      return false;
    }
    if (
      COLLECTION_FLAG_KEYS.some(
        (key) => !matchesFlagMode(item, key, filters.flags[key]),
      )
    ) {
      return false;
    }
    if (
      !matchesAttributeMinimum(
        item.attributes.locked
          .concat(item.attributes.unlocked)
          .concat(item.attributes.special),
        filters.attributeIds,
        filters.attributeMinimum,
      )
    ) {
      return false;
    }
    return matchesAttributeMinimum(
      item.attributes.special,
      filters.specialAttributeIds,
      filters.specialAttributeMinimum,
    );
  });
}

export function getCollectionTags(
  items: readonly CollectionInventoryItem[],
): string[] {
  return [...new Set(items.flatMap((item) => item.tags))].sort((left, right) =>
    left.localeCompare(right),
  );
}

export function getCollectionAttributeOptions(
  items: readonly CollectionInventoryItem[],
  specialOnly = false,
): CollectionAttributeOption[] {
  const byId = new Map<string, CollectionAttributeOption>();
  for (const item of items) {
    const attributes = specialOnly
      ? item.attributes.special
      : item.attributes.locked
          .concat(item.attributes.unlocked)
          .concat(item.attributes.special);
    for (const attribute of attributes) {
      byId.set(attribute._id, {
        id: attribute._id,
        label: attribute.npc_name || attribute.title,
      });
    }
  }
  return [...byId.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

export function getInventoryComparator(
  sort: InventorySort,
): <T extends CollectionInventoryItem>(left: T, right: T) => number {
  const byNewest = (
    left: CollectionInventoryItem,
    right: CollectionInventoryItem,
  ) => Date.parse(right.date_received) - Date.parse(left.date_received);
  const tieBreak = (
    left: CollectionInventoryItem,
    right: CollectionInventoryItem,
  ) => byNewest(left, right) || left._id.localeCompare(right._id);

  return <T extends CollectionInventoryItem>(left: T, right: T) => {
    let comparison = 0;
    switch (sort) {
      case "oldest":
        comparison =
          Date.parse(left.date_received) - Date.parse(right.date_received);
        break;
      case "value-high":
        comparison = right.values.actual - left.values.actual;
        break;
      case "value-low":
        comparison = left.values.actual - right.values.actual;
        break;
      case "title":
        comparison = compareText(left.artwork.title, right.artwork.title);
        break;
      case "title-desc":
        comparison = compareText(right.artwork.title, left.artwork.title);
        break;
      case "artist":
        comparison = compareText(left.artwork.artist, right.artwork.artist);
        break;
      case "artist-desc":
        comparison = compareText(right.artwork.artist, left.artwork.artist);
        break;
      case "rarity":
        comparison =
          ARTWORK_RARITIES.indexOf(right.artwork.rarity) -
          ARTWORK_RARITIES.indexOf(left.artwork.rarity);
        break;
      case "rarity-low":
        comparison =
          ARTWORK_RARITIES.indexOf(left.artwork.rarity) -
          ARTWORK_RARITIES.indexOf(right.artwork.rarity);
        break;
      case "condition":
        comparison = right.condition - left.condition;
        break;
      case "condition-low":
        comparison = left.condition - right.condition;
        break;
      case "level-high":
        comparison = right.level - left.level;
        break;
      case "level-low":
        comparison = left.level - right.level;
        break;
      case "artwork-newest":
        comparison = compareText(
          String(right.artwork.date),
          String(left.artwork.date),
        );
        break;
      case "artwork-oldest":
        comparison = compareText(
          String(left.artwork.date),
          String(right.artwork.date),
        );
        break;
      case "newest":
        comparison = byNewest(left, right);
        break;
    }
    return comparison || tieBreak(left, right);
  };
}

function parseCollectionSearch(search: string) {
  const parsed = {
    tags: [] as string[],
    terms: [] as string[],
    keywords: [] as string[],
  };
  for (const rawValue of search.split(",")) {
    const value = rawValue.trim().replace(/\s+/g, " ").toLowerCase();
    if (!value) continue;
    if (value.startsWith("#") && value.length > 1) {
      parsed.tags.push(value.slice(1));
    } else if (value.startsWith("*") && value.length > 1) {
      parsed.keywords.push(value.slice(1));
    } else {
      parsed.terms.push(value);
    }
  }
  return parsed;
}

function matchesFlagMode(
  item: CollectionInventoryItem,
  key: CollectionFlagKey,
  mode: CollectionFlagMode,
): boolean {
  if (mode === "any") return true;
  const matches = getFlagValue(item, key);
  return mode === "only" ? matches : !matches;
}

function getFlagValue(
  item: CollectionInventoryItem,
  key: CollectionFlagKey,
): boolean {
  switch (key) {
    case "for-sale":
      return item.tags.includes("for sale");
    case "lottery":
      return item.lottery > 0;
    case "forgery":
      return item.authenticity.identified && item.authenticity.forgery;
    default:
      return item[key];
  }
}

function matchesAttributeMinimum(
  itemAttributes: readonly ItemAttribute[],
  selectedIds: readonly string[],
  minimum: number,
): boolean {
  if (selectedIds.length === 0) return true;
  const itemIds = new Set(itemAttributes.map((attribute) => attribute._id));
  const matches = selectedIds.filter((id) => itemIds.has(id)).length;
  return matches >= Math.min(Math.max(1, minimum), selectedIds.length);
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
