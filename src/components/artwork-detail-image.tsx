import type { CSSProperties } from "react";

import {
  getArtworkImageBackgroundPosition,
  getArtworkImageZoomTranslation,
} from "@/components/item-cards/artwork-image-adjustments";
import type { ArtworkArtStyleAdjustment } from "@/server/gameplay";

export default function ArtworkDetailImage({
  adjustment,
  alt,
  artworkId,
  className = "",
}: {
  adjustment: ArtworkArtStyleAdjustment;
  alt: string;
  artworkId: string;
  className?: string;
}) {
  const backgroundPosition = getArtworkImageBackgroundPosition(adjustment);
  const zoomTranslation = getArtworkImageZoomTranslation(adjustment);

  return (
    <span
      aria-label={alt}
      className={`artwork-detail-image ${className}`.trim()}
      role="img"
      style={
        {
          "--artwork-detail-position-x": backgroundPosition.x,
          "--artwork-detail-position-y": backgroundPosition.y,
          "--artwork-detail-scale": adjustment.scale,
          "--artwork-detail-translate-x": zoomTranslation.x,
          "--artwork-detail-translate-y": zoomTranslation.y,
        } as CSSProperties
      }
    >
      <span
        aria-hidden="true"
        className="artwork-detail-image-source"
        style={{
          backgroundImage: `url("/api/artwork/${artworkId}/image?variant=full")`,
        }}
      />
    </span>
  );
}
