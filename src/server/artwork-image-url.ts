export type ArtworkImageVariant = "full" | "card" | "thumb";
export type ArtworkImageScope = "public" | "admin";

export type ArtworkImageMetadata = {
  variants?: Partial<Record<ArtworkImageVariant, { checksum?: string }>>;
  storage?: { key: string };
};

export const ARTWORK_IMAGE_VARIANT_FALLBACKS: Record<ArtworkImageVariant, readonly ArtworkImageVariant[]> = {
  full: ["full", "card", "thumb"],
  card: ["card", "full", "thumb"],
  thumb: ["thumb", "card", "full"],
};

export function getArtworkImageVersion(
  image: ArtworkImageMetadata | undefined,
  variant: ArtworkImageVariant,
): string | undefined {
  for (const candidate of ARTWORK_IMAGE_VARIANT_FALLBACKS[variant]) {
    const resolved = image?.variants?.[candidate];
    if (!resolved) continue;
    return typeof resolved.checksum === "string" && /^[a-f\d]{64}$/i.test(resolved.checksum)
      ? resolved.checksum.toLowerCase()
      : undefined;
  }
}

export function getArtworkImageUrl(
  artworkId: string,
  variant: ArtworkImageVariant = "card",
  image?: ArtworkImageMetadata,
  texture = false,
  scope: ArtworkImageScope = "public",
): string {
  const query = new URLSearchParams({ variant });
  const version = getArtworkImageVersion(image, variant);
  if (version) query.set("v", version);
  if (texture) query.set("texture", "1");
  if (scope === "admin") query.set("admin", "1");
  return `/api/artwork/${encodeURIComponent(artworkId)}/image?${query}`;
}
