import assert from "node:assert/strict";
import test from "node:test";

import { getHallwayRevealProgress } from "./offer-reveal-scene.ts";

test("hallway lights turn on in order before the final artwork light", () => {
  const initial = getHallwayRevealProgress(0);
  assert.equal(initial.camera, 0);
  assert.equal(initial.artwork, 0);
  assert.ok(initial.lights.every((light) => light === 0));
  const travelling = getHallwayRevealProgress(3000);
  assert.ok(travelling.camera > 0 && travelling.camera < 1);
  assert.equal(travelling.artwork, 0);
  assert.ok(travelling.lights.some((light) => light === 1));
  assert.ok(travelling.lights.some((light) => light === 0));
  assert.ok(travelling.lights.every((light, index) => !index || light <= travelling.lights[index - 1]));
  const revealing = getHallwayRevealProgress(10000);
  assert.ok(revealing.camera < 1);
  assert.ok(revealing.artwork > 0 && revealing.artwork < 1);
  assert.equal(revealing.complete, false);
  assert.equal(getHallwayRevealProgress(16000).complete, true);
});

test("skip and reduced motion go directly to the artwork but still wait for its image", () => {
  assert.equal(getHallwayRevealProgress(0, 0, true).complete, true);
  assert.ok(getHallwayRevealProgress(0, Infinity, true).lights.every((light) => light === 1));
  assert.equal(getHallwayRevealProgress(16000, Infinity, true).complete, false);
  const waiting = getHallwayRevealProgress(16000, Infinity);
  assert.equal(waiting.camera, 1);
  assert.equal(waiting.artwork, 0);
  assert.ok(waiting.lights.every((light) => light === 1));
  assert.equal(getHallwayRevealProgress(17000, 16000).complete, false);
  assert.equal(getHallwayRevealProgress(19000, 16000).complete, true);
});

test("hallway lighting leads the eased camera without starting the final reveal early", () => {
  const early = getHallwayRevealProgress(1000);
  assert.equal(early.lights[1], 1);
  const halfway = getHallwayRevealProgress(3000);
  assert.ok(halfway.lights[4] > 0);
  assert.equal(halfway.lights[5], 0);
  for (const elapsed of [1000, 3000, 8999, 9000]) {
    assert.equal(getHallwayRevealProgress(elapsed).artwork, 0);
  }
  const waiting = getHallwayRevealProgress(9000, 10000);
  assert.ok(waiting.lights.every((light) => light === 1));
  assert.equal(waiting.artwork, 0);
});

test("rarity backlighting starts halfway down the hall, before the artwork reveal", () => {
  assert.equal(getHallwayRevealProgress(2500).backlight, 0);
  const halfway = getHallwayRevealProgress(3000);
  assert.ok(halfway.backlight > 0 && halfway.backlight < 1);
  assert.equal(halfway.artwork, 0);
  assert.equal(getHallwayRevealProgress(6000).backlight, 1);
  assert.equal(getHallwayRevealProgress(6000, Infinity).artwork, 0);
});

test("artwork is fully revealed during the slow final approach, which still reaches its endpoint", () => {
  const settling = getHallwayRevealProgress(12000);
  assert.equal(settling.artwork, 1);
  assert.ok(settling.camera < 1);
  assert.equal(settling.complete, false);
  const finalMovement = settling.camera - getHallwayRevealProgress(11000).camera;
  assert.ok(finalMovement > 0 && finalMovement < 0.01);
  assert.equal(getHallwayRevealProgress(14000).complete, true);
  assert.equal(getHallwayRevealProgress(0, Infinity, true).backlight, 1);
});
