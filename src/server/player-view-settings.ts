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
  "title",
  "artist",
  "rarity",
  "condition",
] as const;
export type InventorySort = (typeof INVENTORY_SORTS)[number];

export type PlayerViewSettings = {
  gallerySort: GallerySort;
  galleryView: GalleryViewMode;
  inventorySort: InventorySort;
  bulkSaleProtections: BulkSaleProtections;
};

export const DEFAULT_PLAYER_VIEW_SETTINGS: PlayerViewSettings = {
  gallerySort: "value",
  galleryView: "expanded",
  inventorySort: "newest",
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
