import type { GameItem } from "./gameplay.ts";
import type { ItemPermission } from "./item-permissions.ts";

export function getPermanentCollectionPermission(
  item: Pick<GameItem, "_id" | "artwork_id" | "status" | "permanent">,
  ownedItems: readonly Pick<GameItem, "_id" | "artwork_id" | "status" | "permanent">[],
  permanentCap: number,
): ItemPermission {
  if (item.status !== "claimed") {
    return {
      allowed: false,
      reason:
        item.status === "displayed"
          ? "Stop promoting this artwork before changing its permanent collection status."
          : "Collect this artwork before adding it to your permanent collection.",
    };
  }
  if (item.permanent) return { allowed: true };
  if (
    ownedItems.some(
      (candidate) =>
        candidate._id !== item._id &&
        candidate.artwork_id === item.artwork_id &&
        (candidate.status === "displayed" || candidate.permanent),
    )
  ) {
    return { allowed: false, reason: "This artwork is already promoted or in your permanent collection." };
  }
  if (ownedItems.filter((candidate) => candidate.permanent).length >= permanentCap) {
    return { allowed: false, reason: `Your ${permanentCap}-item permanent collection is full.` };
  }
  return { allowed: true };
}
