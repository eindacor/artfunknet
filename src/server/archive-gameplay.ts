import type { GameItem } from "./gameplay.ts";

export const ARCHIVE_CATEGORIES = [
  "standard",
  "foil",
  "unlocked",
  "seasonal",
  "vintage",
  "lottery",
] as const;

export type ArchiveCategory = (typeof ARCHIVE_CATEGORIES)[number];

type ArchiveProperties = Pick<
  GameItem,
  "foil" | "unlocked" | "seasonal" | "lottery" | "vintage"
>;

export function getArchiveSignature(item: ArchiveProperties): string {
  const signature = [
    item.foil ? "f" : "",
    item.unlocked ? "u" : "",
    item.seasonal ? "s" : "",
    item.lottery > 0 ? "l" : "",
    item.vintage ? "v" : "",
  ].join("");
  return signature || "standard";
}

export function getArchiveCategories(
  item: ArchiveProperties,
): ArchiveCategory[] {
  const categories: ArchiveCategory[] = [];
  if (item.foil) categories.push("foil");
  if (item.unlocked) categories.push("unlocked");
  if (item.seasonal) categories.push("seasonal");
  if (item.vintage) categories.push("vintage");
  if (item.lottery > 0) categories.push("lottery");
  return categories.length > 0 ? categories : ["standard"];
}

export function getArchivedCategoriesByArtwork(
  items: Array<
    ArchiveProperties &
      Pick<GameItem, "artwork_id" | "status"> & { displaced?: boolean }
  >,
): Map<string, ArchiveCategory[]> {
  const categoriesByArtwork = new Map<string, Set<ArchiveCategory>>();
  for (const item of items) {
    if (item.status !== "archived" || item.displaced === true) continue;
    const categories =
      categoriesByArtwork.get(item.artwork_id) ??
      new Set<ArchiveCategory>();
    for (const category of getArchiveCategories(item)) {
      categories.add(category);
    }
    categoriesByArtwork.set(item.artwork_id, categories);
  }
  return new Map(
    [...categoriesByArtwork].map(([artworkId, categories]) => [
      artworkId,
      ARCHIVE_CATEGORIES.filter((category) => categories.has(category)),
    ]),
  );
}

export function getArchivedArtStylesByArtwork(
  items: Array<
    Pick<GameItem, "artwork_id" | "card_renderer" | "status"> & {
      displaced?: boolean;
    }
  >,
): Map<string, string[]> {
  const stylesByArtwork = new Map<string, Set<string>>();
  for (const item of items) {
    if (item.status !== "archived" || item.displaced === true) continue;
    const styles = stylesByArtwork.get(item.artwork_id) ?? new Set<string>();
    styles.add(item.card_renderer ?? "museum");
    stylesByArtwork.set(item.artwork_id, styles);
  }
  return new Map(
    [...stylesByArtwork].map(([artworkId, styles]) => [
      artworkId,
      [...styles],
    ]),
  );
}
