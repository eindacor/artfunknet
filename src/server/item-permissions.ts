import type { GameItem } from "./gameplay.ts";

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
