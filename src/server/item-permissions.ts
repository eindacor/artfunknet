import type { GameItem } from "./gameplay.ts";
import {
  getUnarchivedArchiveData,
  type ArchiveCategory,
} from "./archive-gameplay.ts";

export type ItemPermission =
  | { allowed: true; reason?: never }
  | { allowed: false; reason: string };

export function getDisplayPermission(
  item: Pick<
    GameItem,
    "_id" | "artwork_id" | "status" | "repairing" | "permanent"
  >,
  ownedItems: Array<
    Pick<GameItem, "_id" | "artwork_id" | "status" | "permanent">
  >,
  displayCap: number,
): ItemPermission {
  if (item.status !== "claimed") {
    return { allowed: false, reason: "This item is not in your inventory." };
  }
  if (item.repairing) {
    return {
      allowed: false,
      reason: "This item is currently being repaired.",
    };
  }

  const duplicate = ownedItems.some(
    (candidate) =>
      candidate.artwork_id === item.artwork_id &&
      (candidate.status === "displayed" || candidate.permanent),
  );
  if (duplicate) {
    return {
      allowed: false,
      reason: "An item of this artwork is already on display.",
    };
  }

  const displayCount = ownedItems.filter(
    (candidate) => candidate.status === "displayed",
  ).length;
  if (displayCount >= displayCap) {
    return {
      allowed: false,
      reason: "You have reached your display limit.",
    };
  }

  return { allowed: true };
}

export function getArchivePermission(
  item: Pick<
    GameItem,
    | "card_renderer"
    | "foil"
    | "lottery"
    | "mint"
    | "original"
    | "repairing"
    | "seasonal"
    | "status"
    | "unlocked"
    | "vintage"
    | "authenticity"
  >,
  archivedModifiers: readonly ArchiveCategory[],
  archivedArtStyles: readonly string[],
): ItemPermission {
  if (!["claimed", "unclaimed", "for_sale"].includes(item.status)) {
    return {
      allowed: false,
      reason: "This item is not eligible for the archive.",
    };
  }
  if (item.original) {
    return {
      allowed: false,
      reason: "Original artwork cannot be archived.",
    };
  }
  if (item.repairing) {
    return {
      allowed: false,
      reason: "Stop repairing this item before archiving it.",
    };
  }
  if (item.authenticity.forgery && item.authenticity.identified) {
    return {
      allowed: false,
      reason: "An identified forgery cannot be archived.",
    };
  }
  if (item.authenticity.forgery) {
    return { allowed: true };
  }

  const additions = getUnarchivedArchiveData(
    item,
    archivedModifiers,
    archivedArtStyles,
  );
  if (additions.modifiers.length === 0 && additions.artStyles.length === 0) {
    return {
      allowed: false,
      reason:
        "This item's modifiers and art style are already represented in the archive.",
    };
  }
  return { allowed: true };
}
