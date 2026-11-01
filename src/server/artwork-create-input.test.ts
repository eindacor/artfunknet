import assert from "node:assert/strict";
import test from "node:test";
import { validateArtworkInput, validateArtworkImageAdjustments } from "./artwork-create-input.ts";

const metadata = {
  artist_id: "artist", title: "Artwork", date: 1900,
  genre: "Painting", medium: "Oil", rarity: "common", height: 100,
};

test("artwork creation preserves independent rounded style, detail and thumbnail drafts", () => {
  const result = validateArtworkInput({
    ...metadata, active: false, nsfw: true,
    art_style_adjustments: { museum: { x: 1.23456, y: -20, scale: 1.5 }, arcade: { x: -30, y: 5, scale: 2 } },
    detail_image_adjustments: [{ slot: 2, x: 15, y: -7, scale: 2.45678 }],
    thumbnail_adjustment: { x: 40, y: -10, scale: 1.67891 },
    previewUrl: "must-not-be-stored",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.art_style_adjustments, {
    museum: { x: 1.235, y: -20, scale: 1.5 }, arcade: { x: -30, y: 5, scale: 2 },
  });
  assert.deepEqual(result.value.detail_image_adjustments, [{ slot: 2, x: 15, y: -7, scale: 2.457 }]);
  assert.deepEqual(result.value.thumbnail_adjustment, { x: 40, y: -10, scale: 1.679 });
  assert.equal(result.value.active, false);
  assert.equal(result.value.nsfw, true);
  assert.equal("previewUrl" in result.value, false);
});

test("existing artwork creation requests receive neutral optional crops", () => {
  const result = validateArtworkInput(metadata);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.art_style_adjustments, {});
  assert.deepEqual(result.value.detail_image_adjustments, []);
  assert.deepEqual(result.value.thumbnail_adjustment, { x: 0, y: 0, scale: 1 });
});

test("catalog crop validation does not require creation fields or persist unrelated metadata", () => {
  const result = validateArtworkImageAdjustments({
    title: "Not crop metadata", value_scale: 0.9,
    art_style_adjustments: { museum: { x: 12.34567, y: -8, scale: 1.5 } },
    detail_image_adjustments: [{ slot: 3, x: -7, y: 22, scale: 2 }],
    thumbnail_adjustment: { x: 18, y: 9, scale: 1.75 },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, {
    art_style_adjustments: { museum: { x: 12.346, y: -8, scale: 1.5 } },
    detail_image_adjustments: [{ slot: 3, x: -7, y: 22, scale: 2 }],
    thumbnail_adjustment: { x: 18, y: 9, scale: 1.75 },
  });
});

test("creation rejects invalid styles, duplicate detail slots and malformed thumbnail crops", () => {
  for (const changes of [
    { art_style_adjustments: { unknown: { x: 0, y: 0, scale: 1 } } },
    { art_style_adjustments: [] },
    { art_style_adjustments: { museum: { x: 101, y: 0, scale: 1 } } },
    { detail_image_adjustments: [{ slot: 1, x: 0, y: 0, scale: 1 }, { slot: 1, x: 10, y: 0, scale: 1 }] },
    { detail_image_adjustments: [{ slot: 4, x: 0, y: 0, scale: 1 }] },
    { thumbnail_adjustment: { x: "20", y: 0, scale: 1 } },
    { thumbnail_adjustment: { x: 0, y: 0, scale: 0.5 } },
  ]) assert.equal(validateArtworkInput({ ...metadata, ...changes }).ok, false);
  assert.equal(validateArtworkInput(null).ok, false);
});
