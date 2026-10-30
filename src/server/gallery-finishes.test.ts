import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_GALLERY_FINISHES,
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

test("finish updates require exactly six finite normalized RGB vectors and a safe gallery ID", () => {
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
