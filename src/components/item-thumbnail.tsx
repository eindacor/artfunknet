import ArtworkThumbnail from "./artwork-thumbnail";
import type { HydratedGameItem } from "@/server/item-artwork";

export default function ItemThumbnail({
  alt = "",
  className,
  item,
  size = 72,
}: {
  alt?: string;
  className?: string;
  item: Pick<
    HydratedGameItem,
    "artwork_id" | "card_renderer" | "foil" | "repairing" | "status" | "tags"
  >;
  size?: number;
}) {
  const hasArtStyle =
    Boolean(item.card_renderer) && item.card_renderer !== "museum";
  const isAuctioned = item.status === "auctioned";
  const isDealerOffer = item.status === "for_sale";
  const isCollectorSale =
    item.status === "claimed" && item.tags.includes("for sale");

  return (
    <ArtworkThumbnail
      alt={alt}
      artworkId={item.artwork_id}
      className={className}
      size={size}
    >
      {item.foil ? (
        <span aria-hidden="true" className="thumbnail-foil-shine" />
      ) : null}
      {hasArtStyle ||
      item.repairing ||
      isAuctioned ||
      isDealerOffer ||
      isCollectorSale ? (
        <span className="thumbnail-status-watermarks">
          {hasArtStyle ? (
            <i
              aria-label="Art style applied"
              className="fa fa-paint-brush thumbnail-art-style"
              role="img"
            />
          ) : null}
          {item.repairing ? (
            <i
              aria-label="Being repaired"
              className="fa fa-wrench"
              role="img"
            />
          ) : null}
          {isAuctioned ? (
            <i
              aria-label="Up for auction"
              className="fa fa-gavel"
              role="img"
            />
          ) : null}
          {isDealerOffer ? (
            <i
              aria-label="Dealer offer"
              className="fa fa-shopping-cart"
              role="img"
            />
          ) : null}
          {isCollectorSale ? (
            <i
              aria-label="For sale to collectors"
              className="fa fa-binoculars thumbnail-collector-sale"
              role="img"
            />
          ) : null}
        </span>
      ) : null}
    </ArtworkThumbnail>
  );
}
