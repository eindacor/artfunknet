import type { Filter } from "mongodb";

import { sanitizePlayerFacingAuthenticity } from "./forgery-gameplay.ts";
import type { Artwork, GameItem } from "./gameplay.ts";

export function prepareArtworkForPublicViewer(artwork: Artwork): Artwork {
  const {
    _id, artist_id, artist, title, date, genre, medium, rarity, value_scale, height, width, active,
    image, effect_id, art_style_adjustments, detail_image_adjustments, thumbnail_adjustment,
    feature_card_adjustment, special_attributes, unique_attributes,
  } = artwork;
  return {
    _id, artist_id, artist, title, date, genre, medium, rarity, value_scale, height, width, active,
    image, effect_id, art_style_adjustments, detail_image_adjustments, thumbnail_adjustment,
    feature_card_adjustment, special_attributes, unique_attributes,
  };
}

export function getPublicGalleryItemFilter(
  playerId: string,
): Filter<GameItem> {
  return {
    owner: playerId,
    $or: [
      { status: "displayed" },
      { permanent: true, status: "claimed" },
    ],
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
