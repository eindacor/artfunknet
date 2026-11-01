import Image from "next/image";
import type { ReactNode } from "react";
import type { ArtworkArtStyleAdjustment } from "@/server/gameplay";
import {
  getArtworkImageBackgroundPosition,
  getArtworkImageZoomTranslation,
} from "./item-cards/artwork-image-adjustments";

export default function ArtworkThumbnail({
  artworkId,
  alt,
  className = "",
  children,
  size = 72,
  variant,
  adjustment,
  sourceUrl,
}: {
  artworkId: string;
  alt: string;
  className?: string;
  children?: ReactNode;
  size?: number;
  variant?: "full" | "card" | "thumb";
  adjustment?: ArtworkArtStyleAdjustment;
  sourceUrl?: string;
}) {
  const imageVariant = variant ?? (size > 240 ? "card" : "thumb");
  const position = adjustment && getArtworkImageBackgroundPosition(adjustment);
  const translation = adjustment && getArtworkImageZoomTranslation(adjustment);

  return (
    <span
      className={`artwork-thumbnail ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      <Image
        alt={alt}
        draggable={false}
        fill
        sizes={`${size}px`}
        src={sourceUrl ?? `/api/artwork/${artworkId}/image?variant=${imageVariant}`}
        style={adjustment && position && translation ? {
          objectPosition: `${position.x} ${position.y}`,
          transform: `translate(${translation.x}, ${translation.y}) scale(${adjustment.scale})`,
        } : undefined}
        unoptimized
      />
      {children}
    </span>
  );
}
