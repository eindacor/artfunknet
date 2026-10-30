export const GALLERY_FRAME_WIDTH = 0.045;
export const GALLERY_FRAME_DEPTH = .2;
export const GALLERY_FRAME_FRONT_Z = 0.07;
export const GALLERY_MAT_WIDTH = 0.06;
export const GALLERY_FIELD_OF_VIEW = 48;

export type GalleryArtworkDimensions = {
  id: string;
  artworkId: string;
  width: number;
  height: number;
  title?: string;
  artist?: string;
  date?: string;
};

export type GalleryPaintingLayout = GalleryArtworkDimensions & {
  x: number;
  y: number;
};

export type GalleryLayout = {
  paintings: GalleryPaintingLayout[];
  width: number;
  height: number;
  centerY: number;
};

function meters(centimeters: number): number {
  return Number.isFinite(centimeters) && centimeters > 0
    ? centimeters / 100
    : 0.8;
}

export function createGalleryLayout(
  artworks: GalleryArtworkDimensions[],
): GalleryLayout {
  const dimensions = artworks.map((artwork) => ({
    ...artwork,
    width: meters(artwork.width),
    height: meters(artwork.height),
  }));
  const tallest = Math.max(0, ...dimensions.map(({ height }) => height));
  const centerY = Math.max(1.55, tallest / 2 + 0.55);
  const gap = 2;
  const surround = GALLERY_FRAME_WIDTH + GALLERY_MAT_WIDTH;
  const width = dimensions.reduce(
    (total, painting) => total + painting.width + surround * 2,
    Math.max(0, dimensions.length - 1) * gap,
  );
  let left = -width / 2;

  return {
    centerY,
    width,
    height: Math.max(3.4, centerY + tallest / 2 + 0.9),
    paintings: dimensions.map((painting) => {
      const framedWidth = painting.width + surround * 2;
      const x = left + framedWidth / 2;
      left += framedWidth + gap;
      return { ...painting, x, y: centerY };
    }),
  };
}

export function getGalleryCameraFraming(
  painting: GalleryPaintingLayout | undefined,
  aspect: number,
  viewportWidth = 1100,
): { y: number; z: number } {
  if (!painting) return { y: 1.4, z: 3.8 };

  const halfFieldOfView = (GALLERY_FIELD_OF_VIEW * Math.PI) / 360;
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const safeWidth = Number.isFinite(viewportWidth) && viewportWidth > 0
    ? viewportWidth
    : 1100;
  const surround = GALLERY_FRAME_WIDTH + GALLERY_MAT_WIDTH;
  const framedWidth = painting.width + surround * 2;
  const framedHeight = painting.height + surround * 2;
  const horizontalFill = Math.max(0.1, Math.min(0.84, 1 - 128 / safeWidth));

  return {
    y: painting.y,
    // Fit the frame's front face, leaving room for the painting arrows.
    z: GALLERY_FRAME_FRONT_Z + Math.max(
      0.3,
      framedWidth / (2 * Math.tan(halfFieldOfView) * safeAspect * horizontalFill),
      framedHeight / (2 * Math.tan(halfFieldOfView) * 0.84),
    ),
  };
}

export function getGalleryWideCameraFraming(
  layout: GalleryLayout,
  aspect: number,
  viewportWidth = 1100,
): { y: number; z: number } {
  return {
    y: layout.centerY - 0.15,
    z: Math.max(
      3.8,
      ...layout.paintings.map((painting) =>
        getGalleryCameraFraming(painting, aspect, viewportWidth).z * 1.35,
      ),
    ),
  };
}
