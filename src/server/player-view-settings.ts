import type { BulkSaleProtections } from "./bulk-sale.ts";

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

export type PlayerViewSettings = {
  gallerySort: GallerySort;
  galleryView: GalleryViewMode;
  inventorySort: InventorySort;
  offersSort: OfferSort;
  offersSortDirection: OfferSortDirection;
  bulkSaleProtections: BulkSaleProtections;
};

export const DEFAULT_PLAYER_VIEW_SETTINGS: PlayerViewSettings = {
  gallerySort: "value",
  galleryView: "expanded",
  inventorySort: "newest",
  offersSort: "value",
  offersSortDirection: "desc",
  bulkSaleProtections: {
    keepArtStyles: true,
    keepRares: true,
    keepLegendaries: true,
    keepMasterpieces: true,
    keepUnfoundQuestTargets: true,
    keepUnarchived: true,
  },
};

export function getPlayerViewSettings(value: unknown): PlayerViewSettings {
  const settings = isRecord(value) ? value : {};
  const protections = isRecord(settings.bulkSaleProtections)
    ? settings.bulkSaleProtections
    : {};

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
    bulkSaleProtections: {
      keepArtStyles: protections.keepArtStyles !== false,
      keepRares: protections.keepRares !== false,
      keepLegendaries: protections.keepLegendaries !== false,
      keepMasterpieces: protections.keepMasterpieces !== false,
      keepUnfoundQuestTargets: protections.keepUnfoundQuestTargets !== false,
      keepUnarchived: protections.keepUnarchived !== false,
    },
  };
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
