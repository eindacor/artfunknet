"use client";

import ArtworkThumbnail from "./artwork-thumbnail";
import { ItemExpirationTint } from "./item-expiration-display";
import type { HydratedGameItem } from "@/server/item-artwork";
import { getArtworkThumbnailAdjustment } from "./item-cards/artwork-image-adjustments";

type ItemStatusIconItem = Pick<
  HydratedGameItem,
  | "archivePermission"
  | "card_renderer"
  | "repairing"
  | "status"
  | "tags"
> &
  Partial<Pick<HydratedGameItem, "permanent">>;

export default function ItemThumbnail({
  alt = "",
  className,
  item,
  researchTarget = false,
  showDisplayStatus = false,
  size = 72,
}: {
  alt?: string;
  className?: string;
  item: Pick<
    HydratedGameItem,
    | "artwork_id"
    | "archivePermission"
    | "card_renderer"
    | "date_received"
    | "expires_at"
    | "foil"
    | "repairing"
    | "status"
    | "tags"
  > & Partial<Pick<HydratedGameItem, "artwork" | "permanent">>;
  researchTarget?: boolean | "submitted";
  showDisplayStatus?: boolean;
  size?: number;
}) {
  return (
    <ArtworkThumbnail
      adjustment={getArtworkThumbnailAdjustment(item.artwork ?? {})}
      alt={alt}
      artworkId={item.artwork_id}
      image={item.artwork?.image}
      className={className}
      size={size}
    >
      {item.foil ? (
        <span aria-hidden="true" className="thumbnail-foil-shine" />
      ) : null}
      <ItemExpirationTint item={item} />
      <ItemStatusIcons
        item={item}
        researchTarget={researchTarget}
        showDisplayStatus={showDisplayStatus}
      />
    </ArtworkThumbnail>
  );
}

export function ItemStatusIcons({
  className = "",
  item,
  researchTarget = false,
  showDisplayStatus = false,
}: {
  className?: string;
  item: ItemStatusIconItem;
  researchTarget?: boolean | "submitted";
  showDisplayStatus?: boolean;
}) {
  const hasArtStyle =
    Boolean(item.card_renderer) && item.card_renderer !== "museum";
  const isAuctioned = item.status === "auctioned";
  const isDealerOffer = item.status === "for_sale";
  const isCollectorSale =
    item.status === "claimed" && item.tags.includes("for sale");
  const isArchivable = item.archivePermission?.allowed === true;
  const isDisplayed = showDisplayStatus && item.status === "displayed";

  if (
    !hasArtStyle &&
    !researchTarget &&
    !item.repairing &&
    !isAuctioned &&
    !isDealerOffer &&
    !isCollectorSale &&
    !isArchivable &&
    !item.permanent &&
    !isDisplayed
  ) {
    return null;
  }

  return (
    <span className={`thumbnail-status-watermarks ${className}`.trim()}>
      {isDisplayed ? (
        <i
          aria-label="Featured"
          className="fa fa-arrow-up thumbnail-displayed"
          role="img"
        />
      ) : null}
      {item.permanent ? (
        <i
          aria-label="Permanent collection"
          className="fa fa-heart"
          role="img"
        />
      ) : null}
      {researchTarget ? (
        <i
          aria-label={researchTarget === "submitted" ? "Submitted quest target" : "Quest target"}
          className={`fa fa-search thumbnail-quest-target${researchTarget === "submitted" ? " thumbnail-quest-target-submitted" : ""}`}
          role="img"
        />
      ) : null}
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
      {isArchivable ? (
        <i
          aria-label="Can be archived"
          className="fa fa-archive thumbnail-archivable"
          role="img"
        />
      ) : null}
    </span>
  );
}
