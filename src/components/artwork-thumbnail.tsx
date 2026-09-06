import Image from "next/image";
import type { ReactNode } from "react";

export default function ArtworkThumbnail({
  artworkId,
  alt,
  className = "",
  children,
  size = 72,
  variant,
}: {
  artworkId: string;
  alt: string;
  className?: string;
  children?: ReactNode;
  size?: number;
  variant?: "full" | "card" | "thumb";
}) {
  const imageVariant = variant ?? (size > 240 ? "card" : "thumb");

  return (
    <span
      className={`artwork-thumbnail ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      <Image
        alt={alt}
        fill
        sizes={`${size}px`}
        src={`/api/artwork/${artworkId}/image?variant=${imageVariant}`}
        unoptimized
      />
      {children}
    </span>
  );
}
