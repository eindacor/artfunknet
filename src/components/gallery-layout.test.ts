import assert from "node:assert/strict";
import test from "node:test";

import {
  getGalleryPaintingDimension,
  getGalleryPixelsPerCentimeter,
} from "./gallery-layout.ts";

test("gallery paintings preserve physical proportions at the legacy scale", () => {
  const pixelsPerCentimeter = getGalleryPixelsPerCentimeter([200, 500]);

  assert.equal(pixelsPerCentimeter, 0.7);
  assert.equal(getGalleryPaintingDimension(500, pixelsPerCentimeter), 350);
  assert.equal(getGalleryPaintingDimension(300, pixelsPerCentimeter), 210);
});

test("gallery scale remains capped at one pixel per centimeter", () => {
  assert.equal(getGalleryPixelsPerCentimeter([120, 300]), 1);
  assert.equal(getGalleryPixelsPerCentimeter([]), 1);
});
