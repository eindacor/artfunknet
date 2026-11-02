import type { HydratedGameItem } from "./item-artwork.ts";
import { getArtworkImageUrl } from "./artwork-image-url.ts";

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
    cardImagePath: getArtworkImageUrl(item.artwork_id, "card", item.artwork.image),
    thumbnailImagePath: getArtworkImageUrl(item.artwork_id, "thumb", item.artwork.image),
  };
}
