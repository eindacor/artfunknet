import type { GameItem } from "./gameplay.ts";
import { MAX_PLAYER_LEVEL } from "./collection-gameplay.ts";

export const VINTAGE_STARTING_BALANCE = 100_000;

export type VintagePermission =
  | { allowed: true }
  | { allowed: false; reason: string };

export function partitionVintageItems<T extends Pick<GameItem, "_id" | "vintage">>(
  items: T[],
  selectedItemId: string,
) {
  return {
    keptItems: items.filter(
      (item) => item.vintage || item._id === selectedItemId,
    ),
    removedItems: items.filter(
      (item) => !item.vintage && item._id !== selectedItemId,
    ),
  };
}

export function getVintagePlaythroughPermission({
  level,
  activeAuctionCount,
  selectedItem,
}: {
  level: number;
  activeAuctionCount: number;
  selectedItem: Pick<
    GameItem,
    "owner" | "status" | "original" | "vintage" | "repairing"
  > | null;
}): VintagePermission {
  if (level < MAX_PLAYER_LEVEL) {
    return {
      allowed: false,
      reason: `Reach level ${MAX_PLAYER_LEVEL} before beginning a new playthrough.`,
    };
  }
  if (activeAuctionCount > 0) {
    return {
      allowed: false,
      reason:
        "Resolve every auction you are selling or currently winning before beginning a new playthrough.",
    };
  }
  if (!selectedItem || selectedItem.status !== "claimed") {
    return {
      allowed: false,
      reason: "Choose an item from your inventory to make vintage.",
    };
  }
  if (selectedItem.original) {
    return {
      allowed: false,
      reason: "Original artwork cannot be converted into a vintage item.",
    };
  }
  if (selectedItem.vintage) {
    return {
      allowed: false,
      reason: "Choose an item that is not already vintage.",
    };
  }
  if (selectedItem.repairing) {
    return {
      allowed: false,
      reason: "Stop repairing the selected item before making it vintage.",
    };
  }
  return { allowed: true };
}
