import {
  getSavedBulkSaleProtections,
  type BulkSaleProtections,
} from "./bulk-sale.ts";
import { parseCratePurchaseCount } from "./crate-gameplay.ts";
import {
  ARTWORK_RARITIES,
  type ArtworkRarity,
} from "./gameplay.ts";

export const GALLERY_SORTS = ["value", "score", "works", "name"] as const;
export type GallerySort = (typeof GALLERY_SORTS)[number];

export const GALLERY_VIEW_MODES = ["expanded", "list"] as const;
export type GalleryViewMode = (typeof GALLERY_VIEW_MODES)[number];

export const INVENTORY_SORTS = [
  "newest",
  "oldest",
  "value-high",
  "value-low",
  "drop-chance-high",
  "drop-chance-low",
  "title",
  "title-desc",
  "artist",
  "artist-desc",
  "rarity",
  "rarity-low",
  "condition",
  "condition-low",
  "level-high",
  "level-low",
  "artwork-newest",
  "artwork-oldest",
] as const;
export type InventorySort = (typeof INVENTORY_SORTS)[number];

export const OFFER_SORTS = ["value", "drop-chance", "rarity"] as const;
export type OfferSort = (typeof OFFER_SORTS)[number];
export const OFFER_SORT_DIRECTIONS = ["asc", "desc"] as const;
export type OfferSortDirection = (typeof OFFER_SORT_DIRECTIONS)[number];

export const AUCTION_SORTS = [
  "remaining",
  "price",
  "seller",
  "title",
  "artist",
  "date",
  "medium",
  "rarity",
  "dropChance",
  "condition",
  "rolls",
  "level",
] as const;
export type AuctionSort = (typeof AUCTION_SORTS)[number];
export const AUCTION_SORT_DIRECTIONS = ["asc", "desc"] as const;
export type AuctionSortDirection = (typeof AUCTION_SORT_DIRECTIONS)[number];
export const AUCTION_EXCLUSIVITY_FILTERS = [
  "all",
  "public",
  "private",
] as const;
export type AuctionExclusivityFilter =
  (typeof AUCTION_EXCLUSIVITY_FILTERS)[number];
export const AUCTION_QUEST_FILTERS = ["all", "quest", "sought"] as const;
export type AuctionQuestFilter = (typeof AUCTION_QUEST_FILTERS)[number];
export const AUCTION_VIEW_MODES = ["expanded", "list"] as const;
export type AuctionViewMode = (typeof AUCTION_VIEW_MODES)[number];
export const AUCTION_PROPERTY_KEYS = [
  "mint",
  "foil",
  "unlocked",
  "seasonal",
  "lottery",
  "original",
  "vintage",
] as const;
export type AuctionPropertyKey = (typeof AUCTION_PROPERTY_KEYS)[number];
export const ITEM_FILTER_MODES = ["any", "only", "exclude"] as const;
export type ItemFilterMode = (typeof ITEM_FILTER_MODES)[number];

export type AuctionFilterSettings = {
  search: string;
  sort: AuctionSort;
  order: AuctionSortDirection;
  exclusivity: AuctionExclusivityFilter;
  quest: AuctionQuestFilter;
  rarities: ArtworkRarity[];
  artStyle: string;
  properties: Record<AuctionPropertyKey, ItemFilterMode>;
  attributeIds: string[];
  attributeMinimum: number;
  specialAttributeIds: string[];
  specialAttributeMinimum: number;
};

export type PlayerViewSettings = {
  gallerySort: GallerySort;
  galleryView: GalleryViewMode;
  inventorySort: InventorySort;
  offersSort: OfferSort;
  offersSortDirection: OfferSortDirection;
  cratePurchaseCount: number;
  enableReveals: boolean;
  showGalleryVisitors: boolean;
  bulkSaleProtections: BulkSaleProtections;
  auctionFilters: AuctionFilterSettings;
  auctionView: AuctionViewMode;
};

export const DEFAULT_AUCTION_FILTER_SETTINGS: AuctionFilterSettings = {
  search: "",
  sort: "remaining",
  order: "asc",
  exclusivity: "all",
  quest: "all",
  rarities: [...ARTWORK_RARITIES],
  artStyle: "",
  properties: Object.fromEntries(
    AUCTION_PROPERTY_KEYS.map((key) => [key, "any"]),
  ) as Record<AuctionPropertyKey, ItemFilterMode>,
  attributeIds: [],
  attributeMinimum: 1,
  specialAttributeIds: [],
  specialAttributeMinimum: 1,
};

export const DEFAULT_PLAYER_VIEW_SETTINGS: PlayerViewSettings = {
  gallerySort: "value",
  galleryView: "expanded",
  inventorySort: "newest",
  offersSort: "value",
  offersSortDirection: "desc",
  cratePurchaseCount: 1,
  enableReveals: true,
  showGalleryVisitors: true,
  bulkSaleProtections: getSavedBulkSaleProtections(null),
  auctionFilters: DEFAULT_AUCTION_FILTER_SETTINGS,
  auctionView: "list",
};

export function getPlayerViewSettings(value: unknown): PlayerViewSettings {
  const settings = isRecord(value) ? value : {};
  const auctionFilters = normalizeAuctionFilterSettings(
    settings.auctionFilters,
  );

  return {
    gallerySort: includes(GALLERY_SORTS, settings.gallerySort)
      ? settings.gallerySort
      : DEFAULT_PLAYER_VIEW_SETTINGS.gallerySort,
    galleryView: includes(GALLERY_VIEW_MODES, settings.galleryView)
      ? settings.galleryView
      : DEFAULT_PLAYER_VIEW_SETTINGS.galleryView,
    inventorySort: includes(INVENTORY_SORTS, settings.inventorySort)
      ? settings.inventorySort
      : DEFAULT_PLAYER_VIEW_SETTINGS.inventorySort,
    offersSort: includes(OFFER_SORTS, settings.offersSort)
      ? settings.offersSort
      : DEFAULT_PLAYER_VIEW_SETTINGS.offersSort,
    offersSortDirection: includes(
      OFFER_SORT_DIRECTIONS,
      settings.offersSortDirection,
    )
      ? settings.offersSortDirection
      : DEFAULT_PLAYER_VIEW_SETTINGS.offersSortDirection,
    cratePurchaseCount:
      parseCratePurchaseCount(settings.cratePurchaseCount) ??
      DEFAULT_PLAYER_VIEW_SETTINGS.cratePurchaseCount,
    enableReveals: settings.enableReveals !== false,
    showGalleryVisitors: settings.showGalleryVisitors !== false,
    bulkSaleProtections: getSavedBulkSaleProtections(settings.bulkSaleProtections),
    auctionFilters,
    auctionView: includes(AUCTION_VIEW_MODES, settings.auctionView)
      ? settings.auctionView
      : DEFAULT_PLAYER_VIEW_SETTINGS.auctionView,
  };
}

function normalizeAuctionFilterSettings(value: unknown): AuctionFilterSettings {
  const settings = isRecord(value) ? value : {};
  const properties = isRecord(settings.properties) ? settings.properties : {};
  const attributeIds = normalizeIdSelection(settings.attributeIds);
  const specialAttributeIds = normalizeIdSelection(settings.specialAttributeIds);
  return {
    search:
      typeof settings.search === "string" && settings.search.length <= 200
        ? settings.search
        : DEFAULT_AUCTION_FILTER_SETTINGS.search,
    sort: includes(AUCTION_SORTS, settings.sort)
      ? settings.sort
      : DEFAULT_AUCTION_FILTER_SETTINGS.sort,
    order: includes(AUCTION_SORT_DIRECTIONS, settings.order)
      ? settings.order
      : DEFAULT_AUCTION_FILTER_SETTINGS.order,
    exclusivity: includes(
      AUCTION_EXCLUSIVITY_FILTERS,
      settings.exclusivity,
    )
      ? settings.exclusivity
      : DEFAULT_AUCTION_FILTER_SETTINGS.exclusivity,
    quest: includes(AUCTION_QUEST_FILTERS, settings.quest)
      ? settings.quest
      : DEFAULT_AUCTION_FILTER_SETTINGS.quest,
    rarities: normalizeRarities(settings.rarities),
    artStyle:
      typeof settings.artStyle === "string" && settings.artStyle.length <= 100
        ? settings.artStyle
        : DEFAULT_AUCTION_FILTER_SETTINGS.artStyle,
    properties: Object.fromEntries(
      AUCTION_PROPERTY_KEYS.map((key) => [
        key,
        includes(ITEM_FILTER_MODES, properties[key]) ? properties[key] : "any",
      ]),
    ) as Record<AuctionPropertyKey, ItemFilterMode>,
    attributeIds,
    attributeMinimum: normalizeAttributeMinimum(
      settings.attributeMinimum,
      attributeIds.length,
    ),
    specialAttributeIds,
    specialAttributeMinimum: normalizeAttributeMinimum(
      settings.specialAttributeMinimum,
      specialAttributeIds.length,
    ),
  };
}

function normalizeRarities(value: unknown): ArtworkRarity[] {
  if (!Array.isArray(value)) return [...ARTWORK_RARITIES];
  const rarities = [
    ...new Set(
      value.filter(
        (rarity): rarity is ArtworkRarity =>
          typeof rarity === "string" &&
          ARTWORK_RARITIES.includes(rarity as ArtworkRarity),
      ),
    ),
  ];
  return rarities.length > 0 ? rarities : [...ARTWORK_RARITIES];
}

function normalizeIdSelection(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (id): id is string =>
          typeof id === "string" && id.length > 0 && id.length <= 100,
      ),
    ),
  ].slice(0, 50);
}

function normalizeAttributeMinimum(value: unknown, selectionCount: number) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > Math.max(1, selectionCount)
  ) {
    return 1;
  }
  return value;
}

function includes<const Values extends readonly string[]>(
  values: Values,
  value: unknown,
): value is Values[number] {
  return typeof value === "string" && values.includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
