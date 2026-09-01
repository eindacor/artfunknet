import Image from "next/image";

export default function ArtworkThumbnail({
  artworkId,
  alt,
  className = "",
  size = 72,
}: {
  artworkId: string;
  alt: string;
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={`artwork-thumbnail ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      <Image
        alt={alt}
        fill
        sizes={`${size}px`}
        src={`/api/artwork/${artworkId}/image`}
        unoptimized
      />
    </span>
  );
}
