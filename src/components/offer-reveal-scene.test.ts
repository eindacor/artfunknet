import assert from "node:assert/strict";
import test from "node:test";
import { SpotLight } from "three";

import { DEFAULT_GALLERY_FINISHES } from "../server/gallery-finishes.ts";
import { configureGalleryShadows } from "./gallery-lighting.ts";
import { toGalleryUnits } from "./gallery-layout.ts";
import { createOfferRevealLayout, getRoomRevealProgress } from "./offer-reveal-scene.ts";

const reveal = { id: "reveal", artworkId: "main", width: 80, height: 120 };
const companions = [
  { id: "left-inner", artworkId: "a", width: 50, height: 80 },
  { id: "right-inner", artworkId: "b", width: 300, height: 100 },
  { id: "left-middle", artworkId: "c", width: 100, height: 200 },
  { id: "right-outer", artworkId: "d", width: 40, height: 400 },
  { id: "left-outer", artworkId: "e", width: 500, height: 90 },
];

test("large rooms reserve material samplers while prioritizing rarity and reveal shadows", () => {
  const uplights = [new SpotLight(), new SpotLight()];
  const artworks = Array.from({ length: 23 }, () => new SpotLight());
  const lights = [...uplights, ...artworks];
  for (const maxTextures of [8, 16, 32]) {
    lights.forEach((light) => { light.castShadow = true; });
    configureGalleryShadows(lights, maxTextures);
    const shadowed = lights.filter((light) => light.castShadow);
    assert.ok(shadowed.length + 2 <= maxTextures);
    assert.deepEqual(shadowed, lights.slice(0, maxTextures - 2));
    assert.ok(uplights.every((light) => light.castShadow));
    assert.equal(artworks[0].castShadow, true);
    assert.ok(lights.every((light) => light.intensity === 1));
  }
});

test("small rooms keep every shadow, and exhausted budgets disable existing shadow maps", () => {
  const lights = Array.from({ length: 4 }, () => new SpotLight());
  configureGalleryShadows(lights, 16);
  assert.ok(lights.every((light) => light.castShadow));
  configureGalleryShadows(lights, 2);
  assert.ok(lights.every((light) => !light.castShadow));
  assert.ok(lights.every((light) => light.intensity === 1));
});

test("room keeps the revealed artwork centered with consistently scaled companions on both sides", () => {
  const finishes = { ...DEFAULT_GALLERY_FINISHES, frame_width: 0.15, matte_width: 0.2 };
  const layout = createOfferRevealLayout(reveal, companions, finishes);
  assert.equal(layout.paintings[0].x, 0);
  assert.deepEqual(layout.paintings.map(({ width }) => width), [0.8, 0.5, 3, 1, 0.4, 5].map(toGalleryUnits));
  assert.deepEqual(layout.lightStages, [3, 2, 2, 1, 1, 0]);
  assert.ok(layout.height >= toGalleryUnits(5.5));
  assert.equal(layout.centerY, 1.4);
  const surround = toGalleryUnits(finishes.frame_width + finishes.matte_width);
  for (const direction of [-1, 1]) {
    const side = layout.paintings.filter(({ x }) => x * direction >= 0)
      .sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
    for (let index = 1; index < side.length; index++) {
      const previous = side[index - 1];
      const current = side[index];
      const gap = Math.abs(current.x) - current.width / 2 - surround
        - (Math.abs(previous.x) + previous.width / 2 + surround);
      assert.ok(Math.abs(gap - toGalleryUnits(2)) < 1e-10);
    }
  }
  for (const painting of layout.paintings) {
    assert.ok(Math.abs(painting.x) + painting.width / 2 + surround <= layout.width / 2 + 1e-10);
    assert.ok(painting.y - painting.height / 2 - surround >= 0.4 - 1e-10);
    assert.ok(painting.y + painting.height / 2 + surround < layout.height);
  }
});

test("reveal galleries use configured heights without changing artwork geometry", () => {
  const layout = createOfferRevealLayout(reveal, companions, DEFAULT_GALLERY_FINISHES,
    { cameraHeightCm: 175, artworkCenterHeightCm: 165 });
  assert.equal(layout.cameraHeight, 1.75);
  assert.equal(layout.paintings[0].y, 1.65);
  assert.equal(layout.paintings[0].height, 1.2);
  assert.ok(layout.height > layout.cameraHeight);
});

test("empty, single and even companion groups remain centered and exclude duplicate item IDs", () => {
  for (const count of [0, 1, 2, 4]) {
    const works = companions.slice(0, count);
    const layout = createOfferRevealLayout(reveal, [reveal, ...works, ...works], DEFAULT_GALLERY_FINISHES);
    assert.equal(layout.paintings.length, count + 1);
    assert.equal(layout.paintings[0].x, 0);
    assert.equal(layout.lightStages[0], Math.ceil(count / 2));
    const left = layout.paintings.filter(({ x }) => x < 0).length;
    const right = layout.paintings.filter(({ x }) => x > 0).length;
    assert.equal(left, Math.ceil(count / 2));
    assert.equal(right, Math.floor(count / 2));
  }
  const sameArtwork = createOfferRevealLayout(reveal, [{ ...reveal, id: "another-item" }], DEFAULT_GALLERY_FINISHES);
  assert.equal(sameArtwork.paintings.length, 2);
});

test("outer light layers turn on before inner layers and the central artwork is illuminated last", () => {
  const initial = getRoomRevealProgress(0, 0, 3);
  assert.equal(initial.camera, 0);
  assert.equal(initial.artwork, 0);
  assert.ok(initial.lights.every((light) => light === 0));
  assert.equal(getRoomRevealProgress(1500, 0, 3).camera, 0);
  const travelling = getRoomRevealProgress(3000, 0, 3);
  assert.ok(travelling.camera > 0 && travelling.camera < 1);
  assert.equal(travelling.artwork, 0);
  assert.deepEqual(travelling.lights, [1, 0, 0]);
  assert.ok(travelling.lights.every((light, index) => !index || light <= travelling.lights[index - 1]));
  const middle = getRoomRevealProgress(5500, 0, 3);
  assert.equal(middle.lights[0], 1);
  assert.ok(middle.lights[1] > 0);
  assert.equal(middle.lights[2], 0);
  const revealing = getRoomRevealProgress(10000, 0, 3);
  assert.ok(revealing.camera < 1);
  assert.ok(revealing.artwork > 0 && revealing.artwork < 1);
  assert.ok(revealing.lights.every((light) => light === 1));
  assert.equal(revealing.complete, false);
  for (const count of [0, 1, 2, 10, 30]) {
    for (const elapsed of [0, 900, 3000, 8999, 9000]) {
      assert.equal(getRoomRevealProgress(elapsed, 0, count).artwork, 0);
    }
    assert.ok(getRoomRevealProgress(9000, Infinity, count).lights.every((light) => light === 1));
  }
});

test("skip and reduced motion go directly to the artwork but still wait for its image", () => {
  const skipped = getRoomRevealProgress(3000, 0, 3, 3000);
  assert.equal(skipped.camera, 1);
  assert.equal(skipped.ready, true);
  assert.equal(skipped.pullback, 0);
  assert.equal(skipped.complete, false);
  assert.ok(skipped.lights.every((light) => light === 1));
  assert.equal(getRoomRevealProgress(0, 0, 3, 0, true).complete, true);
  assert.equal(getRoomRevealProgress(16000, Infinity, 3, 0, true).ready, false);
  const waiting = getRoomRevealProgress(16000, Infinity, 3);
  assert.equal(waiting.camera, 1);
  assert.equal(waiting.artwork, 0);
  assert.ok(waiting.lights.every((light) => light === 1));
  assert.equal(getRoomRevealProgress(17000, 16000).ready, false);
  assert.equal(getRoomRevealProgress(18800, 16000).ready, true);
  assert.equal(getRoomRevealProgress(18800, 16000).pullback, 0);
  assert.equal(getRoomRevealProgress(25300, 16000).complete, true);
  assert.equal(getRoomRevealProgress(16000, 16000, 3, 3000).ready, true);
  assert.equal(getRoomRevealProgress(16000, 16000, 3, 3000).pullback, 0);
});

test("rarity uplights brighten from scene opening, well before the main reveal light", () => {
  assert.equal(getRoomRevealProgress(0).raritySpotlight, 0);
  const early = getRoomRevealProgress(1000);
  assert.ok(early.raritySpotlight > 0 && early.raritySpotlight < 1);
  assert.equal(early.artwork, 0);
  const halfway = getRoomRevealProgress(3250);
  assert.equal(halfway.raritySpotlight, 0.5);
  assert.equal(halfway.artwork, 0);
  for (let elapsed = 0; elapsed <= 6500; elapsed += 250) {
    const progress = getRoomRevealProgress(elapsed);
    assert.ok(progress.raritySpotlight >= getRoomRevealProgress(elapsed - 250).raritySpotlight);
  }
  assert.equal(getRoomRevealProgress(6500).raritySpotlight, 1);
  assert.equal(getRoomRevealProgress(6500).artwork, 0);
  assert.equal(getRoomRevealProgress(3250, Infinity).raritySpotlight, 0.5);
  assert.equal(getRoomRevealProgress(20000, Infinity).raritySpotlight, 1);
});

test("skip does not restart the early uplight fade or delay OK; reduced motion finishes it immediately", () => {
  const skipped = getRoomRevealProgress(3000, 0, 3, 3000);
  assert.equal(skipped.ready, true);
  assert.equal(skipped.raritySpotlight, getRoomRevealProgress(3000).raritySpotlight);
  assert.equal(getRoomRevealProgress(3250, 0, 3, 3000).raritySpotlight, 0.5);
  assert.equal(getRoomRevealProgress(6500, 0, 3, 3000).raritySpotlight, 1);
  assert.equal(getRoomRevealProgress(3000, 0, 3, 3000, true).raritySpotlight, 1);
  assert.equal(getRoomRevealProgress(3000, Infinity, 3, 3000, true).raritySpotlight, 1);
  assert.equal(getRoomRevealProgress(3000, Infinity, 3, 3000, true).ready, false);
  assert.equal(getRoomRevealProgress(16000, 16000, 3, 3000).raritySpotlight, 1);
});

test("the slow approach finishes before the pullback, with OK available throughout the retreat", () => {
  const settling = getRoomRevealProgress(12000);
  assert.equal(settling.artwork, 1);
  assert.ok(settling.camera < 1);
  assert.equal(settling.ready, false);
  assert.equal(settling.pullback, 0);
  assert.equal(settling.complete, false);
  const finalMovement = settling.camera - getRoomRevealProgress(11000).camera;
  assert.ok(finalMovement > 0 && finalMovement < 0.01);
  const start = getRoomRevealProgress(14000);
  assert.equal(start.camera, 1);
  assert.equal(start.ready, true);
  assert.equal(start.pullback, 0);
  const retreating = getRoomRevealProgress(17250);
  assert.equal(retreating.camera, 1);
  assert.equal(retreating.ready, true);
  assert.equal(retreating.pullback, 0.5);
  assert.equal(retreating.complete, false);
  assert.equal(getRoomRevealProgress(20500).complete, true);
});
