import type { ArtworkImageMetadata } from "../server/artwork-image-url.ts";
import {
  DEFAULT_GALLERY_FINISHES,
  normalizeGallerySpacing,
  type GalleryFinishes,
} from "../server/gallery-finishes.ts";

export const GALLERY_CAMERA_HEIGHT_CM = { default: 158, min: 10, max: 1000 } as const;
export const GALLERY_ARTWORK_CENTER_HEIGHT_CM = { default: 140, min: 10, max: 1000 } as const;
export const GALLERY_OVERVIEW_DISTANCE_CM = { default: 600, min: 50, max: 10_000 } as const;
export const GALLERY_VISITOR_SCALE = { default: 0.8, min: 0.1, max: 3 } as const;
// One scene unit is one meter, matching camera height and configured distances.
export const GALLERY_SCENE_SCALE = 1;
export const GALLERY_CAMERA_HEIGHT = centimetersToGalleryUnits(GALLERY_CAMERA_HEIGHT_CM.default);
export const GALLERY_MIN_FLOOR_CLEARANCE = centimetersToGalleryUnits(40);
export const GALLERY_FRAME_DEPTH = toGalleryUnits(0.2);
export const GALLERY_FRAME_FRONT_Z = toGalleryUnits(0.07);
export const GALLERY_FIELD_OF_VIEW = 48;

export function toGalleryUnits(meters: number): number {
  return meters * GALLERY_SCENE_SCALE;
}

export function centimetersToGalleryUnits(centimeters: number): number {
  return toGalleryUnits(centimeters / 100);
}

function normalizeDimensionCm(value: unknown, bounds: { default: number; min: number; max: number }): number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= bounds.min && value <= bounds.max ? value : bounds.default;
}

export function normalizeGalleryOverviewDistanceCm(value: unknown): number {
  return normalizeDimensionCm(value, GALLERY_OVERVIEW_DISTANCE_CM);
}

export function normalizeGalleryCameraHeightCm(value: unknown): number {
  return normalizeDimensionCm(value, GALLERY_CAMERA_HEIGHT_CM);
}

export function normalizeGalleryArtworkCenterHeightCm(value: unknown): number {
  return normalizeDimensionCm(value, GALLERY_ARTWORK_CENTER_HEIGHT_CM);
}

export function normalizeGalleryVisitorScale(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    && value >= GALLERY_VISITOR_SCALE.min && value <= GALLERY_VISITOR_SCALE.max
    ? value : GALLERY_VISITOR_SCALE.default;
}

export type GalleryArtworkDimensions = {
  id: string;
  artworkId: string;
  image?: ArtworkImageMetadata;
  width: number;
  height: number;
  title?: string;
  artist?: string;
  date?: string;
};

export type GalleryPaintingLayout = GalleryArtworkDimensions & {
  x: number;
  y: number;
  frameWidth: number;
  matteWidth: number;
};

export type GalleryLayout = {
  paintings: GalleryPaintingLayout[];
  width: number;
  height: number;
  centerY: number;
  cameraHeight: number;
  overviewDistance: number;
  visitorScale: number;
};

export type GallerySceneSettings = {
  overviewDistanceCm?: number;
  visitorScale?: number;
  cameraHeightCm?: number;
  artworkCenterHeightCm?: number;
};

function artworkDimension(centimeters: number): number {
  return centimetersToGalleryUnits(Number.isFinite(centimeters) && centimeters > 0 ? centimeters : 80);
}

export function createGalleryLayout(
  artworks: GalleryArtworkDimensions[],
  finishes: Pick<GalleryFinishes, "frame_width" | "matte_width"> & { spacing?: number } = DEFAULT_GALLERY_FINISHES,
  settings: GallerySceneSettings = {},
): GalleryLayout {
  const cameraHeight = centimetersToGalleryUnits(normalizeGalleryCameraHeightCm(settings.cameraHeightCm));
  const centerY = centimetersToGalleryUnits(normalizeGalleryArtworkCenterHeightCm(settings.artworkCenterHeightCm));
  const dimensions = artworks.map((artwork) => ({
    ...artwork,
    width: artworkDimension(artwork.width),
    height: artworkDimension(artwork.height),
  }));
  const gap = toGalleryUnits(normalizeGallerySpacing(finishes.spacing));
  const frameWidth = toGalleryUnits(finishes.frame_width);
  const matteWidth = toGalleryUnits(finishes.matte_width);
  const surround = frameWidth + matteWidth;
  const width = dimensions.reduce(
    (total, painting) => total + painting.width + surround * 2,
    Math.max(0, dimensions.length - 1) * gap,
  );
  let left = -width / 2;
  const paintings = dimensions.map((painting) => {
    const framedWidth = painting.width + surround * 2;
    const x = left + framedWidth / 2;
    left += framedWidth + gap;
    return {
      ...painting, x,
      y: Math.max(centerY, painting.height / 2 + surround + GALLERY_MIN_FLOOR_CLEARANCE),
      frameWidth,
      matteWidth,
    };
  });

  return {
    centerY,
    cameraHeight,
    overviewDistance: centimetersToGalleryUnits(normalizeGalleryOverviewDistanceCm(settings.overviewDistanceCm)),
    visitorScale: normalizeGalleryVisitorScale(settings.visitorScale),
    width,
    height: Math.max(toGalleryUnits(3.4), cameraHeight + toGalleryUnits(0.9),
      ...paintings.map(painting => painting.y + painting.height / 2 + surround + toGalleryUnits(0.9))),
    paintings,
  };
}

export function getGalleryPlacardLayout(painting: GalleryPaintingLayout) {
  const width = toGalleryUnits(0.24);
  const height = toGalleryUnits(0.12);
  const depth = toGalleryUnits(0.003);
  const surround = painting.frameWidth + painting.matteWidth;
  return {
    width, height, depth,
    x: painting.x + painting.width / 2 + surround + toGalleryUnits(0.1) + width / 2,
    y: painting.y - painting.height / 2 - surround + height / 2,
    z: depth / 2 + toGalleryUnits(0.001),
  };
}

export function getGalleryCameraFraming(
  painting: GalleryPaintingLayout | undefined,
  aspect: number,
  viewportWidth = 1100,
  cameraHeight = painting?.y ?? GALLERY_CAMERA_HEIGHT,
): { y: number; z: number } {
  if (!painting) return { y: cameraHeight, z: toGalleryUnits(3.8) };

  const halfFieldOfView = (GALLERY_FIELD_OF_VIEW * Math.PI) / 360;
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const safeWidth = Number.isFinite(viewportWidth) && viewportWidth > 0
    ? viewportWidth
    : 1100;
  const surround = painting.frameWidth + painting.matteWidth;
  const framedWidth = painting.width + surround * 2;
  const framedHeight = painting.height + surround * 2;
  const horizontalFill = Math.max(0.1, Math.min(0.84, 1 - 128 / safeWidth));

  return {
    y: cameraHeight,
    // Fit the frame's front face, leaving room for the painting arrows.
    z: GALLERY_FRAME_FRONT_Z + Math.max(
      toGalleryUnits(0.3),
      framedWidth / (2 * Math.tan(halfFieldOfView) * safeAspect * horizontalFill),
      (framedHeight / 2 + Math.abs(painting.y - cameraHeight)) / (Math.tan(halfFieldOfView) * 0.84),
    ),
  };
}

export function getGalleryWideCameraFraming(
  layout: GalleryLayout,
): { y: number; z: number } {
  return {
    y: layout.cameraHeight,
    z: layout.overviewDistance,
  };
}
