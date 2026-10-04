import type { HydratedGameItem } from "./item-artwork.ts";

export function serializeGameClientItem(item: HydratedGameItem) {
  return {
    id: item._id,
    artworkId: item.artwork_id,
    title: item.artwork.title,
    artist: item.artwork.artist,
    rarity: item.artwork.rarity,
    status: item.status,
    condition: item.condition,
    foil: item.foil,
    artworkWidth: item.artwork.width,
    artworkHeight: item.artwork.height,
    cardImagePath: `/api/artwork/${item.artwork_id}/image?variant=card`,
    thumbnailImagePath: `/api/artwork/${item.artwork_id}/image?variant=thumb`,
  };
}
