import type { GameItem } from "./gameplay.ts";

type GallerySelectionItem = Pick<
  GameItem,
  "_id" | "artwork_id" | "permanent" | "repairing" | "status"
>;

export type GallerySelectionPlan =
  | {
      ok: true;
      takeDownIds: string[];
      displayIds: string[];
    }
  | {
      ok: false;
      reason: string;
    };

export function planGallerySelection(
  selectedItems: readonly GallerySelectionItem[],
  ownedItems: readonly GallerySelectionItem[],
  displayCap: number,
): GallerySelectionPlan {
  if (selectedItems.length === 0) {
    return { ok: false, reason: "Select at least one artwork." };
  }
  if (selectedItems.length > displayCap) {
    return {
      ok: false,
      reason: `Your gallery can display at most ${displayCap} ${
        displayCap === 1 ? "artwork" : "artworks"
      }.`,
    };
  }

  const artworkIds = new Set<string>();
  for (const item of selectedItems) {
    if (item.status !== "claimed" && item.status !== "displayed") {
      return {
        ok: false,
        reason: "Auctioned items cannot be added to the gallery.",
      };
    }
    if (item.permanent && item.status !== "displayed") {
      return {
        ok: false,
        reason: "Permanent artwork cannot be newly added to the gallery.",
      };
    }
    if (item.status === "claimed" && item.repairing) {
      return {
        ok: false,
        reason: "Stop repairing every selected artwork before displaying it.",
      };
    }
    if (artworkIds.has(item.artwork_id)) {
      return {
        ok: false,
        reason: "The gallery cannot display two copies of the same artwork.",
      };
    }
    artworkIds.add(item.artwork_id);
  }

  const selectedIds = new Set(selectedItems.map((item) => item._id));
  const conflictingPermanentItem = selectedItems.find((item) =>
    ownedItems.some(
      (candidate) =>
        !selectedIds.has(candidate._id) &&
        candidate.artwork_id === item.artwork_id &&
        candidate.permanent,
    ),
  );
  if (conflictingPermanentItem) {
    return {
      ok: false,
      reason:
        "A selected artwork is already represented by a permanent copy.",
    };
  }

  return {
    ok: true,
    takeDownIds: ownedItems
      .filter(
        (item) => item.status === "displayed" && !selectedIds.has(item._id),
      )
      .map((item) => item._id),
    displayIds: selectedItems
      .filter((item) => item.status === "claimed")
      .map((item) => item._id),
  };
}
