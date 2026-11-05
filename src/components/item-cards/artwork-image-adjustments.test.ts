import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ARTWORK_IMAGE_ADJUSTMENT,
  getArtworkDetailImageAdjustments,
  getArtworkDetailImageSlots,
  getArtworkFeatureCardAdjustment,
  getArtworkFeatureCardImageStyle,
  getArtworkImageAdjustment,
  getArtworkThumbnailAdjustment,
  getArtworkImageBackgroundPosition,
  getArtworkImageZoomTranslation,
  isValidArtworkImageAdjustment,
  normalizeArtworkImageAdjustment,
  roundArtworkImageAdjustment,
} from "./artwork-image-adjustments.ts";

test("artwork image adjustments default by renderer", () => {
  assert.deepEqual(
    getArtworkImageAdjustment({ art_style_adjustments: {} }, "prismatic"),
    DEFAULT_ARTWORK_IMAGE_ADJUSTMENT,
  );
});

test("thumbnail crops remain independent from art-style and detail crops", () => {
  assert.deepEqual(getArtworkThumbnailAdjustment({}), DEFAULT_ARTWORK_IMAGE_ADJUSTMENT);
  assert.deepEqual(getArtworkThumbnailAdjustment({
    thumbnail_adjustment: { x: 25, y: -50, scale: 2 },
  }), { x: 25, y: -50, scale: 2 });
  assert.deepEqual(getArtworkThumbnailAdjustment({
    thumbnail_adjustment: { x: 200, y: 0, scale: 8 },
  }), { x: 100, y: 0, scale: 3 });
});

test("feature card crops override thumbnails while preserving legacy framing", () => {
  const thumbnail = { x: 25, y: -50, scale: 2 };
  assert.deepEqual(getArtworkFeatureCardAdjustment({}), DEFAULT_ARTWORK_IMAGE_ADJUSTMENT);
  assert.deepEqual(getArtworkFeatureCardAdjustment({
    thumbnail_adjustment: thumbnail,
  }), thumbnail);
  assert.deepEqual(getArtworkFeatureCardAdjustment({
    thumbnail_adjustment: thumbnail,
    feature_card_adjustment: { x: -40, y: 30, scale: 1.5 },
  }), { x: -40, y: 30, scale: 1.5 });
  assert.deepEqual(getArtworkFeatureCardAdjustment({
    thumbnail_adjustment: thumbnail,
    feature_card_adjustment: { x: 0, y: 0, scale: 1 },
  }), DEFAULT_ARTWORK_IMAGE_ADJUSTMENT);
  assert.deepEqual(getArtworkFeatureCardAdjustment({
    feature_card_adjustment: { x: -200, y: 0, scale: 8 },
  }), { x: -100, y: 0, scale: 3 });
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

test("artwork detail image adjustments return only enabled normalized crops", () => {
  assert.deepEqual(
    getArtworkDetailImageAdjustments({
      detail_image_adjustments: [
        { slot: 0, x: 10, y: 20, scale: 1.5 },
        { slot: 2, x: -30, y: 40, scale: 2 },
      ],
    }),
    [
      { slot: 0, x: 10, y: 20, scale: 1.5 },
      { slot: 2, x: -30, y: 40, scale: 2 },
    ],
  );
  assert.deepEqual(getArtworkDetailImageAdjustments({}), []);
});

test("artwork detail slots expose four independently enabled editors", () => {
  assert.deepEqual(
    getArtworkDetailImageSlots([
      { slot: 1, x: 10, y: -20, scale: 1.5 },
    ]),
    [
      { enabled: false, adjustment: { x: 0, y: 0, scale: 1 } },
      { enabled: true, adjustment: { x: 10, y: -20, scale: 1.5 } },
      { enabled: false, adjustment: { x: 0, y: 0, scale: 1 } },
      { enabled: false, adjustment: { x: 0, y: 0, scale: 1 } },
    ],
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

test("artwork image adjustment validation requires numeric bounded values", () => {
  assert.equal(
    isValidArtworkImageAdjustment({ x: 0, y: 0, scale: 1.25 }),
    true,
  );
  assert.equal(
    isValidArtworkImageAdjustment({ x: "0", y: 0, scale: 1.25 }),
    false,
  );
  assert.equal(
    isValidArtworkImageAdjustment({ x: 0, y: 0, scale: 0.5 }),
    false,
  );
});

test("artwork image positions move the background with the drag direction", () => {
  assert.deepEqual(
    getArtworkImageBackgroundPosition({ x: 40, y: -20, scale: 1 }),
    { x: "30%", y: "60%" },
  );
});

test("artwork image zoom translation exposes overflow on both axes", () => {
  assert.deepEqual(
    getArtworkImageZoomTranslation({ x: 40, y: -20, scale: 1 }),
    { x: "0%", y: "0%" },
  );
  assert.deepEqual(
    getArtworkImageZoomTranslation({ x: 40, y: -20, scale: 2 }),
    { x: "20%", y: "-10%" },
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

test("feature card focal points preserve the editor crop across viewport heights, widths, and image proportions", () => {
  for (const aspect of [0.5, 1, 2, 6]) {
    for (const adjustment of [
      { x: 0, y: 0, scale: 1 },
      { x: 35, y: -60, scale: 1.5 },
      { x: -100, y: 100, scale: 3 },
    ]) {
      const style = getArtworkFeatureCardImageStyle(adjustment, aspect);
      const position = getArtworkImageBackgroundPosition(adjustment);
      const translation = getArtworkImageZoomTranslation(adjustment);
      const referenceImageHeight = Math.max(360 / aspect, 118);
      const referenceImageWidth = referenceImageHeight * aspect;
      const referencePoint = [
        [360, referenceImageWidth, position.x, translation.x],
        [118, referenceImageHeight, position.y, translation.y],
      ] as const;
      const expectedPoint = referencePoint.map(([viewport, image, position, translation]) => {
        const offset = (viewport - image) * Number.parseFloat(position) / 100 * adjustment.scale +
          (1 - adjustment.scale) * viewport / 2 + Number.parseFloat(translation) / 100 * viewport;
        return (viewport / 2 - offset) / (image * adjustment.scale);
      });
      const [widthScale, heightScale] = [...style.width.matchAll(/([\d.]+)cq[wh]/g)].map(match => Number(match[1]) / 100);
      const [x, y] = [...style.transform.matchAll(/(-?[\d.]+)%/g)].map(match => -Number(match[1]) / 100);
      for (const [width, height] of [[360, 118], [360, 210], [240, 118], [240, 320], [120, 500]]) {
        const imageWidth = Math.max(widthScale * width, heightScale * height);
        const imageHeight = imageWidth / aspect;
        const left = width / 2 - x * imageWidth;
        const top = height / 2 - y * imageHeight;
        assert.ok(Math.abs((width / 2 - left) / imageWidth - expectedPoint[0]) < 1e-10);
        assert.ok(Math.abs((height / 2 - top) / imageHeight - expectedPoint[1]) < 1e-10);
        assert.ok(left <= 1e-10 && top <= 1e-10, "Centering must not expose empty borders");
        assert.ok(left + imageWidth >= width - 1e-10 && top + imageHeight >= height - 1e-10);
        if (width === 360 && height === 118) {
          assert.ok(Math.abs(imageWidth - referenceImageWidth * adjustment.scale) < 1e-10,
            "Existing editor crops and zoom levels must remain unchanged");
        }
      }
    }
  }
});
