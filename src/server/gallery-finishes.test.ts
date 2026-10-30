import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_GALLERY_FINISHES,
  GALLERY_FINISH_WIDTH_LIMITS,
  GALLERY_FINISH_WIDTH_SLOTS,
  galleryColorToHex,
  getGalleryFinishes,
  hexToGalleryColor,
  parseGalleryFinishUpdate,
} from "./gallery-finishes.ts";

test("hex colors round-trip as normalized sRGB vectors", () => {
  assert.deepEqual(hexToGalleryColor("#1A8CD4"), [26 / 255, 140 / 255, 212 / 255]);
  assert.deepEqual(hexToGalleryColor(" #abc "), [170 / 255, 187 / 255, 204 / 255]);
  assert.deepEqual(hexToGalleryColor("000000"), [0, 0, 0]);
  assert.equal(galleryColorToHex([1, 0.5, 0]), "#ff8000");
  assert.equal(galleryColorToHex(hexToGalleryColor("#626859")!), "#626859");
  for (const invalid of ["", "#12", "#12345g", "#12345678", "red"]) {
    assert.equal(hexToGalleryColor(invalid), null);
  }
});

test("legacy and partial finishes retain defaults without sharing mutable colors", () => {
  const finishes = getGalleryFinishes({
    wall: [0.2, 0.4, 0.6],
    matte: [1, -1, 0],
    floor: "#123456",
  });
  assert.deepEqual(finishes.wall, [0.2, 0.4, 0.6]);
  assert.deepEqual(finishes.matte, DEFAULT_GALLERY_FINISHES.matte);
  assert.deepEqual(finishes.floor, DEFAULT_GALLERY_FINISHES.floor);
  assert.deepEqual(getGalleryFinishes(null), DEFAULT_GALLERY_FINISHES);
  finishes.floor[0] = 0;
  assert.notDeepEqual(finishes.floor, DEFAULT_GALLERY_FINISHES.floor);
});

test("finish updates require all colors, widths, brightness, and a safe gallery ID", () => {
  const finishes = getGalleryFinishes(undefined);
  const update = { galleryId: "legacy-gallery_1", finishes };
  assert.deepEqual(parseGalleryFinishUpdate(update), update);
  for (const color of [
    [0, 1], [0, 1, 0, 1], [0, "1", 0], [0, null, 0],
    [0, -0.01, 0], [0, 1.01, 0], [0, NaN, 0], [0, Infinity, 0],
    "#ffffff",
  ]) {
    assert.equal(parseGalleryFinishUpdate({
      ...update, finishes: { ...finishes, wall: color },
    }), null);
  }
  const incomplete = Object.fromEntries(
    Object.entries(finishes).filter(([slot]) => slot !== "matte"),
  );
  for (const value of [
    null, [], {}, { ...update, ownerId: "someone-else" },
    { ...update, finishes: incomplete },
    { ...update, finishes: { ...finishes, fixture: [1, 1, 1] } },
    { ...update, finishes: [] },
    ...["", "a.b", "$owner", "__proto__", "constructor", "prototype", "a".repeat(129)]
      .map((galleryId) => ({ ...update, galleryId })),
  ]) {
    assert.equal(parseGalleryFinishUpdate(value), null);
  }
});

test("width updates accept inclusive bounds and reject forged out-of-range or nonnumeric values", () => {
  for (const slot of GALLERY_FINISH_WIDTH_SLOTS) {
    const { min, max } = GALLERY_FINISH_WIDTH_LIMITS[slot];
    for (const width of [min, max, (min + max) / 2]) {
      const update = {
        galleryId: "gallery",
        finishes: { ...getGalleryFinishes(null), [slot]: width },
      };
      assert.deepEqual(parseGalleryFinishUpdate(update), update);
      assert.equal(getGalleryFinishes(update.finishes)[slot], width);
    }
    for (const width of [
      min - 0.000001, max + 0.000001, -1, NaN, Infinity, -Infinity,
      `${min}`, null, undefined, [], {}, true,
    ]) {
      const finishes = { ...getGalleryFinishes(null), [slot]: width };
      assert.equal(parseGalleryFinishUpdate({ galleryId: "gallery", finishes }), null);
      assert.equal(getGalleryFinishes(finishes)[slot], DEFAULT_GALLERY_FINISHES[slot]);
    }
    const missing = Object.fromEntries(
      Object.entries(getGalleryFinishes(null)).filter(([key]) => key !== slot),
    );
    assert.equal(parseGalleryFinishUpdate({ galleryId: "gallery", finishes: missing }), null);
  }
});

test("color-only legacy galleries receive default widths without losing their saved colors", () => {
  const finishes = getGalleryFinishes({ wall: [0.2, 0.4, 0.6] });
  assert.deepEqual(finishes.wall, [0.2, 0.4, 0.6]);
  assert.equal(finishes.frame_width, 0.045);
  assert.equal(finishes.matte_width, 0.06);
});

test("brightness accepts the full 0-1 range and rejects invalid or missing API values", () => {
  for (const brightness of [0, 0.25, 0.5, 1]) {
    const finishes = { ...getGalleryFinishes(null), brightness };
    const update = { galleryId: "gallery", finishes };
    assert.deepEqual(parseGalleryFinishUpdate(update), update);
    assert.equal(getGalleryFinishes(finishes).brightness, brightness);
  }
  for (const brightness of [
    -0.000001, 1.000001, NaN, Infinity, -Infinity,
    "0.5", null, undefined, [], {}, true,
  ]) {
    const finishes = { ...getGalleryFinishes(null), brightness };
    assert.equal(parseGalleryFinishUpdate({ galleryId: "gallery", finishes }), null);
    assert.equal(getGalleryFinishes(finishes).brightness, DEFAULT_GALLERY_FINISHES.brightness);
  }
  const legacy = Object.fromEntries(
    Object.entries(DEFAULT_GALLERY_FINISHES).filter(([key]) => key !== "brightness"),
  );
  assert.deepEqual(getGalleryFinishes(legacy), DEFAULT_GALLERY_FINISHES);
  assert.equal(parseGalleryFinishUpdate({ galleryId: "gallery", finishes: legacy }), null);
});
