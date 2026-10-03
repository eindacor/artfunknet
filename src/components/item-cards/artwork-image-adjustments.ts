import type {
  Artwork,
  ArtworkArtStyleAdjustment,
} from "@/server/gameplay";

export const ARTWORK_IMAGE_TRANSLATION_MIN = -100;
export const ARTWORK_IMAGE_TRANSLATION_MAX = 100;
export const ARTWORK_IMAGE_SCALE_MIN = 1;
export const ARTWORK_IMAGE_SCALE_MAX = 3;
export const ARTWORK_IMAGE_SCALE_STEP = 0.1;

export const DEFAULT_ARTWORK_IMAGE_ADJUSTMENT: ArtworkArtStyleAdjustment = {
  x: 0,
  y: 0,
  scale: 1,
};

export function getArtworkImageAdjustment(
  artwork: Pick<Artwork, "art_style_adjustments">,
  rendererId: string,
): ArtworkArtStyleAdjustment {
  return normalizeArtworkImageAdjustment(
    artwork.art_style_adjustments?.[rendererId],
  );
}

export function normalizeArtworkImageAdjustment(
  adjustment: Partial<ArtworkArtStyleAdjustment> | null | undefined,
): ArtworkArtStyleAdjustment {
  return {
    x: clampFiniteNumber(
      adjustment?.x,
      DEFAULT_ARTWORK_IMAGE_ADJUSTMENT.x,
      ARTWORK_IMAGE_TRANSLATION_MIN,
      ARTWORK_IMAGE_TRANSLATION_MAX,
    ),
    y: clampFiniteNumber(
      adjustment?.y,
      DEFAULT_ARTWORK_IMAGE_ADJUSTMENT.y,
      ARTWORK_IMAGE_TRANSLATION_MIN,
      ARTWORK_IMAGE_TRANSLATION_MAX,
    ),
    scale: clampFiniteNumber(
      adjustment?.scale,
      DEFAULT_ARTWORK_IMAGE_ADJUSTMENT.scale,
      ARTWORK_IMAGE_SCALE_MIN,
      ARTWORK_IMAGE_SCALE_MAX,
    ),
  };
}

export function roundArtworkImageAdjustment(
  adjustment: ArtworkArtStyleAdjustment,
): ArtworkArtStyleAdjustment {
  return {
    x: round(adjustment.x),
    y: round(adjustment.y),
    scale: round(adjustment.scale),
  };
}

export function getArtworkImageBackgroundPosition(
  adjustment: ArtworkArtStyleAdjustment,
): { x: string; y: string } {
  return {
    x: `${50 - adjustment.x / 2}%`,
    y: `${50 - adjustment.y / 2}%`,
  };
}

export function getArtworkImageZoomTranslation(
  adjustment: ArtworkArtStyleAdjustment,
): { x: string; y: string } {
  const zoomOverflow = (adjustment.scale - 1) / 2;
  return {
    x: `${adjustment.x * zoomOverflow}%`,
    y: `${adjustment.y * zoomOverflow}%`,
  };
}

function clampFiniteNumber(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value as number));
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
