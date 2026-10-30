import assert from "node:assert/strict";
import test from "node:test";

import {
  createGalleryLayout,
  GALLERY_FIELD_OF_VIEW,
  GALLERY_FRAME_FRONT_Z,
  getGalleryCameraFraming,
  getGalleryWideCameraFraming,
} from "./gallery-layout.ts";
import { DEFAULT_GALLERY_FINISHES } from "../server/gallery-finishes.ts";

const {
  frame_width: GALLERY_FRAME_WIDTH,
  matte_width: GALLERY_MAT_WIDTH,
} = DEFAULT_GALLERY_FINISHES;

test("gallery works retain their centimeter dimensions at one meter per world unit", () => {
  const layout = createGalleryLayout([
    { id: "small", artworkId: "a", width: 50, height: 80 },
    { id: "large", artworkId: "b", width: 250, height: 400 },
  ]);
  const [small, large] = layout.paintings;
  assert.equal(small.width, 0.5);
  assert.equal(small.height, 0.8);
  assert.equal(large.width, 2.5);
  assert.equal(large.height, 4);
  assert.equal(small.y, large.y);
  const surround = GALLERY_FRAME_WIDTH + GALLERY_MAT_WIDTH;
  assert.ok(large.y - large.height / 2 - surround > 0);
  assert.ok(large.y + large.height / 2 + surround < layout.height);
});

test("gallery spacing accounts for mats and frames without shrinking the artwork", () => {
  const layout = createGalleryLayout([
    { id: "wide", artworkId: "a", width: 500, height: 60 },
    { id: "small", artworkId: "b", width: 20, height: 30 },
    { id: "portrait", artworkId: "c", width: 80, height: 180 },
  ]);
  assert.deepEqual(layout.paintings.map(({ id }) => id), ["wide", "small", "portrait"]);
  const surround = GALLERY_FRAME_WIDTH + GALLERY_MAT_WIDTH;
  for (let index = 1; index < layout.paintings.length; index++) {
    const previous = layout.paintings[index - 1];
    const current = layout.paintings[index];
    const previousRight = previous.x + previous.width / 2 + surround;
    const currentLeft = current.x - current.width / 2 - surround;
    assert.ok(Math.abs(currentLeft - previousRight - 2) < 1e-10);
  }
});

test("camera fills the available viewport with each frame without clipping it or the arrows", () => {
  const layout = createGalleryLayout([
    { id: "wide", artworkId: "a", width: 600, height: 80 },
    { id: "tall", artworkId: "b", width: 50, height: 450 },
  ]);
  const tangent = Math.tan(GALLERY_FIELD_OF_VIEW * Math.PI / 360);
  const surround = GALLERY_FRAME_WIDTH + GALLERY_MAT_WIDTH;
  for (const [width, height] of [[320, 640], [600, 600], [1200, 480]]) {
    const aspect = width / height;
    for (const painting of layout.paintings) {
      const camera = getGalleryCameraFraming(painting, aspect, width);
      const verticalHalfView = (camera.z - GALLERY_FRAME_FRONT_Z) * tangent;
      assert.ok(verticalHalfView * aspect > painting.width / 2 + surround);
      assert.ok(verticalHalfView > painting.height / 2 + surround + Math.abs(painting.y - camera.y));
      const renderedWidth = (painting.width + surround * 2) / (verticalHalfView * 2 * aspect) * width;
      const renderedHeight = (painting.height + surround * 2) / (verticalHalfView * 2) * height;
      assert.ok((width - renderedWidth) / 2 >= 64 - 1e-8);
      assert.ok(Math.max(renderedWidth / (width - 128), renderedHeight / height) > 0.8);
    }
  }
});

test("camera moves closer to small paintings regardless of their larger neighbors", () => {
  const smallArtwork = { id: "small", artworkId: "a", width: 50, height: 80 };
  const layout = createGalleryLayout([
    smallArtwork,
    { id: "large", artworkId: "b", width: 250, height: 400 },
  ]);
  const [small, large] = layout.paintings;
  const smallCamera = getGalleryCameraFraming(small, 2, 1000);
  const largeCamera = getGalleryCameraFraming(large, 2, 1000);
  const smallAlone = createGalleryLayout([smallArtwork]).paintings[0];
  assert.ok(smallCamera.z < largeCamera.z);
  assert.equal(smallCamera.z, getGalleryCameraFraming(smallAlone, 2, 1000).z);
  assert.equal(smallCamera.y, small.y);
  assert.equal(largeCamera.y, large.y);
});

test("the shared wide view stays farther back than every close-up and keeps frames visible", () => {
  const layout = createGalleryLayout([
    { id: "small", artworkId: "a", width: 50, height: 80 },
    { id: "wide", artworkId: "b", width: 600, height: 80 },
    { id: "tall", artworkId: "c", width: 50, height: 450 },
  ]);
  const tangent = Math.tan(GALLERY_FIELD_OF_VIEW * Math.PI / 360);
  const surround = GALLERY_FRAME_WIDTH + GALLERY_MAT_WIDTH;
  for (const [width, height] of [[320, 640], [600, 600], [1200, 480]]) {
    const aspect = width / height;
    const wide = getGalleryWideCameraFraming(layout, aspect, width);
    const verticalHalfView = (wide.z - GALLERY_FRAME_FRONT_Z) * tangent;
    for (const painting of layout.paintings) {
      assert.ok(wide.z > getGalleryCameraFraming(painting, aspect, width).z);
      assert.ok(verticalHalfView * aspect > painting.width / 2 + surround);
      assert.ok(verticalHalfView > painting.height / 2 + surround + Math.abs(painting.y - wide.y));
    }
  }
});

test("empty galleries and missing legacy dimensions produce finite room and camera geometry", () => {
  const empty = createGalleryLayout([]);
  assert.deepEqual(empty.paintings, []);
  assert.ok(Number.isFinite(getGalleryCameraFraming(empty.paintings[0], 0, 0).z));
  assert.ok(Number.isFinite(getGalleryWideCameraFraming(empty, 0, 0).z));
  const layout = createGalleryLayout([
    { id: "missing", artworkId: "a", width: NaN, height: 0 },
    { id: "invalid", artworkId: "b", width: -2, height: Infinity },
  ]);
  for (const painting of layout.paintings) {
    assert.equal(painting.width, 0.8);
    assert.equal(painting.height, 0.8);
    assert.ok(Number.isFinite(painting.x));
    assert.ok(Number.isFinite(getGalleryCameraFraming(painting, NaN, -1).z));
  }
});

test("custom borders preserve physical art sizes, clear spacing, and fitted camera views", () => {
  const artworks = [
    { id: "small", artworkId: "a", width: 20, height: 30 },
    { id: "tall", artworkId: "b", width: 50, height: 450 },
  ];
  for (const widths of [
    { frame_width: 0.01, matte_width: 0 },
    { frame_width: 0.15, matte_width: 0.2 },
  ]) {
    const layout = createGalleryLayout(artworks, widths);
    const surround = widths.frame_width + widths.matte_width;
    const [first, second] = layout.paintings;
    assert.equal(first.width, 0.2);
    assert.equal(first.height, 0.3);
    assert.equal(first.frameWidth, widths.frame_width);
    assert.equal(first.matteWidth, widths.matte_width);
    assert.ok(Math.abs(
      second.x - second.width / 2 - surround -
      (first.x + first.width / 2 + surround) - 2,
    ) < 1e-10);
    for (const aspect of [0.6, 2.5]) {
      const wide = getGalleryWideCameraFraming(layout, aspect, 360);
      for (const painting of layout.paintings) {
        const close = getGalleryCameraFraming(painting, aspect, 360);
        const halfView = (close.z - GALLERY_FRAME_FRONT_Z) *
          Math.tan(GALLERY_FIELD_OF_VIEW * Math.PI / 360);
        assert.ok(halfView * aspect > painting.width / 2 + surround);
        assert.ok(halfView > painting.height / 2 + surround);
        assert.ok(wide.z > close.z);
      }
    }
  }
  const smallBorders = createGalleryLayout(artworks, { frame_width: 0.01, matte_width: 0 });
  const largeBorders = createGalleryLayout(artworks, { frame_width: 0.15, matte_width: 0.2 });
  assert.ok(largeBorders.width > smallBorders.width);
  assert.ok(getGalleryCameraFraming(largeBorders.paintings[0], 2).z >
    getGalleryCameraFraming(smallBorders.paintings[0], 2).z);
});
