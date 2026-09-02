const MAX_PAINTING_HEIGHT_PIXELS = 350;
const MAX_PIXELS_PER_CENTIMETER = 1;

export function getGalleryPixelsPerCentimeter(
  paintingHeights: number[],
): number {
  const tallestPainting = paintingHeights.reduce(
    (height, paintingHeight) =>
      Number.isFinite(paintingHeight)
        ? Math.max(height, paintingHeight)
        : height,
    0,
  );
  return tallestPainting > 0
    ? Math.min(
        MAX_PAINTING_HEIGHT_PIXELS / tallestPainting,
        MAX_PIXELS_PER_CENTIMETER,
      )
    : MAX_PIXELS_PER_CENTIMETER;
}

export function getGalleryPaintingDimension(
  centimeters: number,
  pixelsPerCentimeter: number,
): number {
  return Math.max(1, Math.floor(centimeters * pixelsPerCentimeter));
}
