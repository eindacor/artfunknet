import type { Filter } from "mongodb";

import { sanitizePlayerFacingAuthenticity } from "./forgery-gameplay.ts";
import type { GameItem } from "./gameplay.ts";

export function getPublicGalleryItemFilter(
  playerId: string,
): Filter<GameItem> {
  return {
    owner: playerId,
    status: "displayed",
  };
}

export function prepareItemForPublicViewer<T extends GameItem>(
  item: T,
  viewerId: string | null,
): T {
  const ownerViewing = viewerId === item.owner;
  const sanitized = sanitizePlayerFacingAuthenticity(item, !ownerViewing);

  return ownerViewing
    ? sanitized
    : {
        ...sanitized,
        owner: "unknown",
        transaction_history: [],
      };
}
