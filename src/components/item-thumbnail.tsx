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
    "artwork_id" | "card_renderer" | "repairing" | "status"
  >;
  size?: number;
}) {
  const hasArtStyle =
    Boolean(item.card_renderer) && item.card_renderer !== "museum";
  const isAuctioned = item.status === "auctioned";
  const isDealerOffer = item.status === "for_sale";

  return (
    <ArtworkThumbnail
      alt={alt}
      artworkId={item.artwork_id}
      className={className}
      size={size}
    >
      {hasArtStyle || item.repairing || isAuctioned || isDealerOffer ? (
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
        </span>
      ) : null}
    </ArtworkThumbnail>
  );
}
