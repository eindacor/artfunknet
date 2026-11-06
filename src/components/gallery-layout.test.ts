import assert from "node:assert/strict";
import test from "node:test";
import { PerspectiveCamera, Vector3 } from "three";

import {
  createGalleryLayout,
  GALLERY_FIELD_OF_VIEW,
  GALLERY_CAMERA_HEIGHT,
  GALLERY_SCENE_SCALE,
  GALLERY_FRAME_FRONT_Z,
  getGalleryCameraFraming,
  getGalleryPlacardLayout,
  getGalleryWideCameraFraming,
  toGalleryUnits,
} from "./gallery-layout.ts";
import { DEFAULT_GALLERY_FINISHES, GALLERY_SPACING_LIMITS } from "../server/gallery-finishes.ts";

const {
  frame_width: GALLERY_FRAME_WIDTH,
  matte_width: GALLERY_MAT_WIDTH,
} = DEFAULT_GALLERY_FINISHES;

test("gallery works and borders use the same scene scale without rewriting catalog dimensions", () => {
  const artworks = [
    { id: "small", artworkId: "a", width: 50, height: 80 },
    { id: "large", artworkId: "b", width: 250, height: 400 },
  ];
  const original = structuredClone(artworks);
  const finishes = structuredClone(DEFAULT_GALLERY_FINISHES);
  const layout = createGalleryLayout(artworks, finishes);
  const [small, large] = layout.paintings;
  assert.equal(small.width, 0.5 * GALLERY_SCENE_SCALE);
  assert.equal(small.height, 0.8 * GALLERY_SCENE_SCALE);
  assert.equal(large.width, 2.5 * GALLERY_SCENE_SCALE);
  assert.equal(large.height, 4 * GALLERY_SCENE_SCALE);
  assert.equal(small.frameWidth, finishes.frame_width * GALLERY_SCENE_SCALE);
  assert.equal(small.matteWidth, finishes.matte_width * GALLERY_SCENE_SCALE);
  assert.deepEqual(artworks, original);
  assert.deepEqual(finishes, DEFAULT_GALLERY_FINISHES);
  assert.ok(small.y < large.y);
  const surround = small.frameWidth + small.matteWidth;
  assert.ok(Math.abs(large.y - large.height / 2 - surround - 0.4) < 1e-10);
  assert.ok(large.y + large.height / 2 + surround < layout.height);
});

test("overview distance uses configured centimeters independently of artwork and border sizes", () => {
  for (const overviewDistanceCm of [600, 1250]) {
    for (const artworks of [
      [],
      [{ id: "tiny", artworkId: "a", width: 1, height: 1 }],
      [{ id: "wide", artworkId: "a", width: 600, height: 100 }, { id: "tall", artworkId: "b", width: 80, height: 1000 }],
    ]) {
      const layout = createGalleryLayout(artworks, { frame_width: 0.15, matte_width: 0.2 }, { overviewDistanceCm });
      assert.equal(getGalleryWideCameraFraming(layout).z, overviewDistanceCm / 100);
    }
  }
  for (const value of [undefined, NaN, Infinity, -1, 0, 49, 10_001, 600.5]) {
    assert.equal(createGalleryLayout([], undefined, { overviewDistanceCm: value }).overviewDistance, 6);
  }
});

test("visitor scale defaults to 80 percent and safely normalizes configured coefficients", () => {
  assert.equal(createGalleryLayout([]).visitorScale, 0.8);
  for (const scale of [0.1, 0.55, 0.8, 1, 1.35, 3]) {
    assert.equal(createGalleryLayout([], undefined, { visitorScale: scale }).visitorScale, scale);
  }
  for (const scale of [undefined, NaN, Infinity, -1, 0, 0.09, 3.01]) {
    assert.equal(createGalleryLayout([], undefined, { visitorScale: scale }).visitorScale, 0.8);
  }
});

test("artwork, borders, spacing and ceiling share the camera's meter units", () => {
  const layout = createGalleryLayout([
    { id: "first", artworkId: "a", width: 50, height: 80 },
    { id: "second", artworkId: "b", width: 50, height: 80 },
  ]);
  const [first, second] = layout.paintings;
  const surround = first.frameWidth + first.matteWidth;
  const gap = second.x - second.width / 2 - surround - (first.x + first.width / 2 + surround);
  for (const [actual, meters] of [
    [first.width, 0.5], [first.height, 0.8], [first.frameWidth, GALLERY_FRAME_WIDTH],
    [first.matteWidth, GALLERY_MAT_WIDTH], [gap, 1], [layout.height, 3.4],
  ]) {
    assert.ok(Math.abs(actual - meters) < 1e-10);
  }
  assert.equal(first.y, 1.4);
  assert.equal(getGalleryWideCameraFraming(layout).y, 1.58);
});

test("saved spacing controls frame-to-frame gaps and room width without resizing artwork or camera framing", () => {
  const artworks = [
    { id: "small", artworkId: "a", width: 20, height: 30 },
    { id: "wide", artworkId: "b", width: 400, height: 150 },
    { id: "tall", artworkId: "c", width: 70, height: 416 },
  ];
  for (const widths of [
    { frame_width: 0.01, matte_width: 0 },
    { frame_width: 0.15, matte_width: 0.2 },
  ]) {
    for (const count of [0, 1, 3]) {
      const works = artworks.slice(0, count);
      const baseline = createGalleryLayout(works, widths);
      for (const spacing of [GALLERY_SPACING_LIMITS.min, 2.38, GALLERY_SPACING_LIMITS.max]) {
        const layout = createGalleryLayout(works, { ...widths, spacing });
        const gap = toGalleryUnits(spacing);
        const surround = toGalleryUnits(widths.frame_width + widths.matte_width);
        assert.ok(Math.abs(layout.width - baseline.width - Math.max(0, count - 1) * toGalleryUnits(spacing - 1)) < 1e-10);
        assert.equal(layout.height, baseline.height);
        assert.deepEqual(getGalleryWideCameraFraming(layout), getGalleryWideCameraFraming(baseline));
        layout.paintings.forEach((painting, index) => {
          assert.deepEqual({ ...painting, x: 0 }, { ...baseline.paintings[index], x: 0 });
          assert.deepEqual(getGalleryCameraFraming(painting, 1.5), getGalleryCameraFraming(baseline.paintings[index], 1.5));
          const next = layout.paintings[index + 1];
          if (!next) return;
          const nextLeft = next.x - next.width / 2 - surround;
          assert.ok(Math.abs(nextLeft - (painting.x + painting.width / 2 + surround) - gap) < 1e-10);
          const placard = getGalleryPlacardLayout(painting);
          assert.ok(placard.x + placard.width / 2 < nextLeft, "Even minimum spacing leaves room for each artwork label");
        });
      }
      for (const spacing of [undefined, 0.49, 4.01, NaN, Infinity]) {
        assert.deepEqual(createGalleryLayout(works, { ...widths, spacing }), baseline);
      }
    }
  }
});

test("a 416 cm artwork keeps its size with the 158 cm camera and floor clearance", () => {
  const layout = createGalleryLayout([
    { id: "reference", artworkId: "reference", width: 533.19, height: 416 },
  ]);
  const painting = layout.paintings[0];
  const camera = getGalleryWideCameraFraming(layout);
  assert.equal(painting.height, 4.16);
  assert.ok(Math.abs(painting.width - 5.3319) < 1e-10);
  assert.equal(camera.y, 1.58);
  assert.equal(camera.z, 6);
  assert.ok(Math.abs(painting.height / camera.y - 416 / 158) < 1e-10);
  const surround = painting.frameWidth + painting.matteWidth;
  assert.ok(Math.abs(painting.y - painting.height / 2 - surround - 0.4) < 1e-10);
  assert.ok(layout.height > painting.y + painting.height / 2 + surround);
});

test("artwork uses a 140 cm centerline unless frame clearance requires raising it", () => {
  for (const finishes of [
    DEFAULT_GALLERY_FINISHES,
    { frame_width: 0.15, matte_width: 0.2 },
  ] as const) {
    const layout = createGalleryLayout([
      { id: "small", artworkId: "a", width: 10, height: 10 },
      { id: "tall", artworkId: "b", width: 250, height: 600 },
    ], finishes);
    const surround = toGalleryUnits(finishes.frame_width + finishes.matte_width);
    assert.equal(layout.centerY, 1.4);
    assert.equal(layout.paintings[0].y, 1.4);
    assert.equal(layout.paintings[0].y, createGalleryLayout([
      { id: "small", artworkId: "a", width: 10, height: 10 },
    ], finishes).paintings[0].y);
    for (const painting of layout.paintings) {
      const bottom = painting.y - painting.height / 2 - surround;
      assert.ok(bottom >= 0.4 - 1e-10);
      assert.ok(painting.y + painting.height / 2 + surround < layout.height);
    }
    const tall = layout.paintings[1];
    assert.ok(Math.abs(tall.y - tall.height / 2 - surround - 0.4) < 1e-10);
  }
});

test("configured heights share artwork units without changing artwork, finish widths, spacing or overview distance", () => {
  const artworks = [
    { id: "small", artworkId: "a", width: 50, height: 80 },
    { id: "large", artworkId: "b", width: 533.19, height: 416 },
  ];
  const finishes = { ...DEFAULT_GALLERY_FINISHES, frame_width: 0.15, matte_width: 0.2 };
  const baseline = createGalleryLayout(artworks, finishes, { overviewDistanceCm: 750 });
  for (const [cameraHeightCm, artworkCenterHeightCm] of [[175, 160], [10, 10], [1000, 140], [158, 1000]]) {
    const layout = createGalleryLayout(artworks, finishes, { overviewDistanceCm: 750, cameraHeightCm, artworkCenterHeightCm });
    assert.deepEqual(getGalleryWideCameraFraming(layout), { y: cameraHeightCm / 100, z: 7.5 });
    assert.equal(layout.centerY, artworkCenterHeightCm / 100);
    assert.equal(layout.width, baseline.width);
    assert.ok(layout.height >= layout.cameraHeight + 0.9, "Ceiling stays above even a high camera in a low exhibition");
    for (const [index, painting] of layout.paintings.entries()) {
      const { y: baselineY, ...baselineGeometry } = baseline.paintings[index];
      const { y, ...geometry } = painting;
      assert.deepEqual(geometry, baselineGeometry);
      assert.equal(y, Math.max(artworkCenterHeightCm / 100, painting.height / 2 + 0.15 + 0.2 + 0.4));
      assert.ok(y - painting.height / 2 - painting.frameWidth - painting.matteWidth >= 0.4 - 1e-10);
      const fitted = getGalleryCameraFraming(painting, 2);
      const previous = getGalleryCameraFraming({ ...painting, y: baselineY }, 2);
      assert.equal(fitted.y, y);
      assert.equal(fitted.z, previous.z, "Height changes do not alter centered zoom magnification");
    }
  }
  const empty = createGalleryLayout([], undefined, { cameraHeightCm: 1000 });
  assert.ok(empty.height > empty.cameraHeight);
  for (const value of [undefined, NaN, Infinity, -1, 0, 9, 1001, 158.5]) {
    const layout = createGalleryLayout(artworks, undefined, { cameraHeightCm: value, artworkCenterHeightCm: value });
    assert.equal(layout.cameraHeight, 1.58);
    assert.equal(layout.centerY, 1.4);
  }
});

test("gallery spacing accounts for scaled mats and frames without altering artwork proportions", () => {
  const layout = createGalleryLayout([
    { id: "wide", artworkId: "a", width: 500, height: 60 },
    { id: "small", artworkId: "b", width: 20, height: 30 },
    { id: "portrait", artworkId: "c", width: 80, height: 180 },
  ]);
  assert.deepEqual(layout.paintings.map(({ id }) => id), ["wide", "small", "portrait"]);
  const surround = toGalleryUnits(GALLERY_FRAME_WIDTH + GALLERY_MAT_WIDTH);
  for (let index = 1; index < layout.paintings.length; index++) {
    const previous = layout.paintings[index - 1];
    const current = layout.paintings[index];
    const previousRight = previous.x + previous.width / 2 + surround;
    const currentLeft = current.x - current.width / 2 - surround;
    assert.ok(Math.abs(currentLeft - previousRight - toGalleryUnits(1)) < 1e-10);
  }
});

test("camera fills the available viewport with each frame without clipping it or the arrows", () => {
  const layout = createGalleryLayout([
    { id: "wide", artworkId: "a", width: 600, height: 80 },
    { id: "tall", artworkId: "b", width: 50, height: 450 },
  ]);
  const tangent = Math.tan(GALLERY_FIELD_OF_VIEW * Math.PI / 360);
  const surround = toGalleryUnits(GALLERY_FRAME_WIDTH + GALLERY_MAT_WIDTH);
  for (const [width, height] of [[320, 640], [600, 600], [1200, 480]]) {
    const aspect = width / height;
    for (const painting of layout.paintings) {
      const camera = getGalleryCameraFraming(painting, aspect, width);
      assert.equal(camera.y, painting.y);
      const verticalHalfView = (camera.z - GALLERY_FRAME_FRONT_Z) * tangent;
      assert.ok(verticalHalfView * aspect > painting.width / 2 + surround);
      assert.ok(verticalHalfView > painting.height / 2 + surround + Math.abs(painting.y - camera.y));
      const renderedWidth = (painting.width + surround * 2) / (verticalHalfView * 2 * aspect) * width;
      const renderedHeight = (painting.height + surround * 2) / (verticalHalfView * 2) * height;
      assert.ok((width - renderedWidth) / 2 >= 64 - 1e-8);
      const verticalReach = (painting.height / 2 + surround + Math.abs(painting.y - camera.y)) / verticalHalfView;
      assert.ok(Math.max(renderedWidth / (width - 128), verticalReach) > 0.8);
      assert.ok(renderedHeight < height);
      const projection = new PerspectiveCamera(GALLERY_FIELD_OF_VIEW, aspect, toGalleryUnits(0.05), 100);
      projection.position.set(painting.x, camera.y, camera.z);
      projection.lookAt(painting.x, camera.y, 0);
      projection.updateMatrixWorld(true);
      for (const horizontal of [-1, 1]) for (const vertical of [-1, 1]) {
        const corner = new Vector3(
          painting.x + horizontal * (painting.width / 2 + surround),
          painting.y + vertical * (painting.height / 2 + surround),
          GALLERY_FRAME_FRONT_Z,
        ).project(projection);
        assert.ok(Math.abs(corner.x) < 1 && Math.abs(corner.y) < 1, "Scaled frame corners stay inside the actual camera frustum");
      }
      const center = new Vector3(painting.x, painting.y, GALLERY_FRAME_FRONT_Z).project(projection);
      assert.ok(Math.abs(center.x) < 1e-10 && Math.abs(center.y) < 1e-10, "Zoom centers the artwork in the viewport");
    }
  }
});

test("zoom centers each artwork at its actual height and fits its size independently of its neighbors", () => {
  const smallArtwork = { id: "small", artworkId: "a", width: 50, height: 40 };
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
  assert.ok(smallCamera.y < GALLERY_CAMERA_HEIGHT);
  assert.ok(largeCamera.y > GALLERY_CAMERA_HEIGHT);
  for (const painting of [small, large]) {
    const framing = getGalleryCameraFraming(painting, 2, 1000);
    const raised = getGalleryCameraFraming({ ...painting, y: painting.y + 1 }, 2, 1000);
    assert.equal(raised.y, painting.y + 1);
    assert.equal(raised.z, framing.z, "Centered zoom distance depends on artwork size, not hanging height");
  }
});

test("changing overview distance leaves selected-artwork zoom fitting unchanged", () => {
  const artworks = [
    { id: "small", artworkId: "a", width: 50, height: 80 },
    { id: "wide", artworkId: "b", width: 600, height: 80 },
    { id: "tall", artworkId: "c", width: 50, height: 450 },
  ];
  const near = createGalleryLayout(artworks, undefined, { overviewDistanceCm: 600 });
  const far = createGalleryLayout(artworks, undefined, { overviewDistanceCm: 1250 });
  assert.ok(getGalleryWideCameraFraming(near).z < getGalleryWideCameraFraming(far).z);
  for (const [width, height] of [[320, 640], [600, 600], [1200, 480]]) {
    const aspect = width / height;
    for (const [index, painting] of near.paintings.entries()) {
      assert.deepEqual(getGalleryCameraFraming(painting, aspect, width),
        getGalleryCameraFraming(far.paintings[index], aspect, width));
    }
  }
});

test("empty galleries and missing legacy dimensions produce finite room and camera geometry", () => {
  const empty = createGalleryLayout([]);
  assert.deepEqual(empty.paintings, []);
  assert.equal(getGalleryCameraFraming(undefined, 0, 0).y, 1.58);
  assert.equal(getGalleryWideCameraFraming(empty).y, 1.58);
  assert.ok(Number.isFinite(getGalleryCameraFraming(empty.paintings[0], 0, 0).z));
  assert.ok(Number.isFinite(getGalleryWideCameraFraming(empty).z));
  const layout = createGalleryLayout([
    { id: "missing", artworkId: "a", width: NaN, height: 0 },
    { id: "invalid", artworkId: "b", width: -2, height: Infinity },
  ]);
  for (const painting of layout.paintings) {
    assert.equal(painting.width, toGalleryUnits(0.8));
    assert.equal(painting.height, toGalleryUnits(0.8));
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
    const surround = toGalleryUnits(widths.frame_width + widths.matte_width);
    const [first, second] = layout.paintings;
    assert.equal(first.width, toGalleryUnits(0.2));
    assert.equal(first.height, toGalleryUnits(0.3));
    assert.equal(first.frameWidth, toGalleryUnits(widths.frame_width));
    assert.equal(first.matteWidth, toGalleryUnits(widths.matte_width));
    assert.ok(Math.abs(
      second.x - second.width / 2 - surround -
      (first.x + first.width / 2 + surround) - toGalleryUnits(1),
    ) < 1e-10);
    for (const aspect of [0.6, 2.5]) {
      for (const painting of layout.paintings) {
        const close = getGalleryCameraFraming(painting, aspect, 360);
        const halfView = (close.z - GALLERY_FRAME_FRONT_Z) *
          Math.tan(GALLERY_FIELD_OF_VIEW * Math.PI / 360);
        assert.ok(halfView * aspect > painting.width / 2 + surround);
        assert.ok(halfView > painting.height / 2 + surround + Math.abs(painting.y - close.y));
        assert.ok(painting.y - painting.height / 2 - surround >= 0.4 - 1e-10);
      }
    }
  }
  const smallBorders = createGalleryLayout(artworks, { frame_width: 0.01, matte_width: 0 });
  const largeBorders = createGalleryLayout(artworks, { frame_width: 0.15, matte_width: 0.2 });
  assert.ok(largeBorders.width > smallBorders.width);
  assert.ok(getGalleryCameraFraming(largeBorders.paintings[0], 2).z >
    getGalleryCameraFraming(smallBorders.paintings[0], 2).z);
});

test("small, shallow placards stay beside the frame, above the floor, and close to the wall", () => {
  const layout = createGalleryLayout([
    { id: "tiny", artworkId: "a", width: 1, height: 1 },
    { id: "tall", artworkId: "b", width: 50, height: 450 },
  ], { frame_width: 0.15, matte_width: 0.2 });
  for (const painting of layout.paintings) {
    const placard = getGalleryPlacardLayout(painting);
    const surround = painting.frameWidth + painting.matteWidth;
    const frameRight = painting.x + painting.width / 2 + surround;
    const frameBottom = painting.y - painting.height / 2 - surround;
    assert.ok(placard.width < 0.36 && placard.height < 0.18);
    assert.ok(placard.depth < 0.012);
    assert.equal(placard.width, toGalleryUnits(0.24));
    assert.equal(placard.depth, toGalleryUnits(0.003));
    assert.equal(placard.width / placard.height, 2);
    assert.ok(Math.abs(placard.x - placard.width / 2 - frameRight - toGalleryUnits(0.1)) < 1e-10);
    assert.ok(Math.abs(placard.y - placard.height / 2 - frameBottom) < 1e-10);
    assert.ok(placard.y - placard.height / 2 >= 0.4 - 1e-10);
    assert.ok(placard.z - placard.depth / 2 > 0);
    assert.ok(placard.z + placard.depth / 2 < 0.005);
  }
});
