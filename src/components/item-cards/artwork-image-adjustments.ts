import type {
  Artwork,
  ArtworkArtStyleAdjustment,
  ArtworkDetailImageAdjustment,
  ArtworkDetailImageAdjustments,
} from "@/server/gameplay";

export const ARTWORK_IMAGE_TRANSLATION_MIN = -100;
export const ARTWORK_IMAGE_TRANSLATION_MAX = 100;
export const ARTWORK_IMAGE_SCALE_MIN = 1;
export const ARTWORK_IMAGE_SCALE_MAX = 3;
export const ARTWORK_IMAGE_SCALE_STEP = 0.1;
export const ARTWORK_DETAIL_IMAGE_COUNT = 4;

export type ArtworkDetailImageSlot = {
  adjustment: ArtworkArtStyleAdjustment;
  enabled: boolean;
};

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

export function getArtworkDetailImageAdjustments(
  artwork: Pick<Artwork, "detail_image_adjustments">,
): ArtworkDetailImageAdjustments {
  const usedSlots = new Set<number>();
  return (artwork.detail_image_adjustments ?? [])
    .flatMap((adjustment, index) => {
      const slot =
        Number.isInteger(adjustment.slot) &&
        adjustment.slot >= 0 &&
        adjustment.slot < ARTWORK_DETAIL_IMAGE_COUNT
          ? adjustment.slot
          : index;
      if (
        slot < 0 ||
        slot >= ARTWORK_DETAIL_IMAGE_COUNT ||
        usedSlots.has(slot)
      ) {
        return [];
      }
      usedSlots.add(slot);
      return [
        {
          slot,
          ...normalizeArtworkImageAdjustment(adjustment),
        },
      ];
    })
    .sort((left, right) => left.slot - right.slot);
}

export function getArtworkDetailImageSlots(
  adjustments: ArtworkDetailImageAdjustments,
): ArtworkDetailImageSlot[] {
  const adjustmentBySlot = new Map(
    adjustments.map((adjustment) => [adjustment.slot, adjustment]),
  );
  return Array.from({ length: ARTWORK_DETAIL_IMAGE_COUNT }, (_, slot) => {
    const adjustment = adjustmentBySlot.get(slot);
    return {
      adjustment: normalizeArtworkImageAdjustment(adjustment),
      enabled: Boolean(adjustment),
    };
  });
}

export function isValidArtworkImageAdjustment(
  adjustment: unknown,
): adjustment is ArtworkArtStyleAdjustment {
  if (!adjustment || typeof adjustment !== "object") return false;
  const value = adjustment as Record<string, unknown>;
  if (
    typeof value.x !== "number" ||
    typeof value.y !== "number" ||
    typeof value.scale !== "number"
  ) {
    return false;
  }
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.scale) &&
    value.x >= ARTWORK_IMAGE_TRANSLATION_MIN &&
    value.x <= ARTWORK_IMAGE_TRANSLATION_MAX &&
    value.y >= ARTWORK_IMAGE_TRANSLATION_MIN &&
    value.y <= ARTWORK_IMAGE_TRANSLATION_MAX &&
    value.scale >= ARTWORK_IMAGE_SCALE_MIN &&
    value.scale <= ARTWORK_IMAGE_SCALE_MAX
  );
}

export function isValidArtworkDetailImageAdjustment(
  adjustment: unknown,
): adjustment is ArtworkDetailImageAdjustment {
  if (!isValidArtworkImageAdjustment(adjustment)) return false;
  const slot = (adjustment as Record<string, unknown>).slot;
  return (
    typeof slot === "number" &&
    Number.isInteger(slot) &&
    slot >= 0 &&
    slot < ARTWORK_DETAIL_IMAGE_COUNT
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

export function roundArtworkDetailImageAdjustments(
  adjustments: ArtworkDetailImageAdjustments,
): ArtworkDetailImageAdjustments {
  return adjustments.map((adjustment) => ({
    slot: adjustment.slot,
    ...roundArtworkImageAdjustment(adjustment),
  }));
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
