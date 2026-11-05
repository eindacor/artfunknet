"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import type { ArtworkArtStyleAdjustment } from "@/server/gameplay";
import { getArtworkImageUrl, type ArtworkImageMetadata } from "@/server/artwork-image-url";
import { useArtworkImageScope } from "./artwork-image-scope";
import {
  getArtworkImageBackgroundPosition,
  getArtworkImageZoomTranslation,
  getArtworkFeatureCardImageStyle,
  DEFAULT_ARTWORK_IMAGE_ADJUSTMENT,
} from "./item-cards/artwork-image-adjustments";

export default function ArtworkThumbnail({
  artworkId,
  image,
  alt,
  className = "",
  children,
  size = 72,
  variant,
  adjustment,
  fixedFocalPoint = false,
  sourceUrl,
}: {
  artworkId: string;
  image?: ArtworkImageMetadata;
  alt: string;
  className?: string;
  children?: ReactNode;
  size?: number;
  variant?: "full" | "card" | "thumb";
  adjustment?: ArtworkArtStyleAdjustment;
  fixedFocalPoint?: boolean;
  sourceUrl?: string;
}) {
  const scope = useArtworkImageScope();
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);
  const imageVariant = variant ?? (size > 240 ? "card" : "thumb");
  const position = adjustment && getArtworkImageBackgroundPosition(adjustment);
  const translation = adjustment && getArtworkImageZoomTranslation(adjustment);

  return (
    <span
      className={`artwork-thumbnail ${className}`.trim()}
      style={{ width: size, height: size, containerType: fixedFocalPoint ? "size" : undefined }}
    >
      <Image
        alt={alt}
        draggable={false}
        fill={!fixedFocalPoint || !imageAspectRatio}
        width={fixedFocalPoint && imageAspectRatio ? size : undefined}
        height={fixedFocalPoint && imageAspectRatio ? Math.max(1, Math.round(size / imageAspectRatio)) : undefined}
        sizes={`${size}px`}
        src={sourceUrl ?? getArtworkImageUrl(artworkId, imageVariant, image, false, scope)}
        onLoad={fixedFocalPoint ? event => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          if (naturalWidth && naturalHeight) setImageAspectRatio(naturalWidth / naturalHeight);
        } : undefined}
        style={fixedFocalPoint && imageAspectRatio
          ? getArtworkFeatureCardImageStyle(adjustment ?? DEFAULT_ARTWORK_IMAGE_ADJUSTMENT, imageAspectRatio)
          : adjustment && position && translation ? {
          objectPosition: `${position.x} ${position.y}`,
          transform: `translate(${translation.x}, ${translation.y}) scale(${adjustment.scale})`,
        } : undefined}
        unoptimized
      />
      {children}
    </span>
  );
}
