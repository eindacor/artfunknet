import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ARTWORK_IMAGE_ADJUSTMENT,
  getArtworkImageAdjustment,
  normalizeArtworkImageAdjustment,
  roundArtworkImageAdjustment,
} from "./artwork-image-adjustments.ts";

test("artwork image adjustments default by renderer", () => {
  assert.deepEqual(
    getArtworkImageAdjustment({ art_style_adjustments: {} }, "prismatic"),
    DEFAULT_ARTWORK_IMAGE_ADJUSTMENT,
  );
});

test("artwork image adjustments use the selected renderer values", () => {
  assert.deepEqual(
    getArtworkImageAdjustment(
      {
        art_style_adjustments: {
          museum: { x: 4, y: -8, scale: 1.2 },
          prismatic: { x: -12, y: 16, scale: 1.5 },
        },
      },
      "prismatic",
    ),
    { x: -12, y: 16, scale: 1.5 },
  );
});

test("artwork image adjustments normalize invalid and out-of-range values", () => {
  assert.deepEqual(
    normalizeArtworkImageAdjustment({
      x: -200,
      y: Number.NaN,
      scale: 8,
    }),
    { x: -100, y: 0, scale: 3 },
  );
});

test("artwork image adjustments round persisted values", () => {
  assert.deepEqual(
    roundArtworkImageAdjustment({
      x: 1.23456,
      y: -7.89123,
      scale: 1.45678,
    }),
    { x: 1.235, y: -7.891, scale: 1.457 },
  );
});
