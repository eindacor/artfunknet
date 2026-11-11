import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  await readFile(new URL("./vaporwave-atmosphere.tsx", import.meta.url), "utf8"),
  {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

function setup(webglAvailable = true) {
  const frames = new Map<number, (time: number) => void>();
  const documentEvents = new Map<string, () => void>();
  const surfaceEvents = new Map<string, () => void>();
  let motionChanged = () => {};
  let intersect: (entries: { target: unknown; isIntersecting: boolean }[]) => void = () => {};
  let nextFrame = 0;
  let surfaces = 0;
  let releases = 0;
  let disconnected = false;
  const noop = () => {};
  const gl = {
    ...Object.fromEntries([
      "shaderSource", "compileShader", "attachShader", "linkProgram", "useProgram",
      "bindBuffer", "bufferData", "enableVertexAttribArray", "vertexAttribPointer",
      "uniform1f", "drawArrays", "deleteShader", "deleteBuffer", "deleteProgram",
    ].map((method) => [method, noop])),
    createShader: () => ({}),
    createProgram: () => ({}),
    createBuffer: () => ({}),
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getAttribLocation: () => 0,
    getUniformLocation: () => ({}),
    getExtension: () => ({ loseContext: () => { releases++; } }),
  };
  const motion = {
    matches: false,
    addEventListener: (_name: string, callback: () => void) => { motionChanged = callback; },
    removeEventListener: noop,
  };
  const document = {
    hidden: false,
    createElement: () => {
      surfaces++;
      return {
        getContext: () => webglAvailable ? gl : null,
        addEventListener: (name: string, callback: () => void) => surfaceEvents.set(name, callback),
        removeEventListener: (name: string) => surfaceEvents.delete(name),
      };
    },
    addEventListener: (name: string, callback: () => void) => documentEvents.set(name, callback),
    removeEventListener: (name: string) => documentEvents.delete(name),
  };
  const makeTarget = () => ({
    dataset: {} as Record<string, string>,
    getContext: () => ({ drawImage: noop }),
  });
  let target = makeTarget();
  let cleanup: (() => void) | undefined;
  const Component = runInNewContext(`${compiled}\nexports.default`, {
    exports: {},
    require: (id: string) => id === "react"
      ? {
          useRef: () => ({ current: target }),
          useEffect: (effect: () => (() => void) | undefined) => { cleanup = effect(); },
        }
      : require(id),
    document,
    window: { matchMedia: () => motion },
    performance: { now: () => 100 },
    requestAnimationFrame: (callback: (time: number) => void) => {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    IntersectionObserver: class {
      constructor(callback: typeof intersect) { intersect = callback; }
      observe() {}
      unobserve() {}
      disconnect() { disconnected = true; }
    },
  }) as () => unknown;
  return {
    frames, document, motion, documentEvents, surfaceEvents,
    get surfaces() { return surfaces; },
    get releases() { return releases; },
    get disconnected() { return disconnected; },
    mount() {
      target = makeTarget();
      Component();
      const current = target;
      return {
        target: current,
        cleanup,
        visibility: (isIntersecting: boolean) => intersect([{ target: current, isIntersecting }]),
      };
    },
    changeMotion(matches: boolean) {
      motion.matches = matches;
      motionChanged();
    },
    advanceFrame() {
      const [id, callback] = frames.entries().next().value!;
      frames.delete(id);
      callback(200);
    },
  };
}

test("vaporwave previews share a shader and release resources after the last unmount", () => {
  const env = setup();
  const first = env.mount();
  const second = env.mount();
  first.visibility(true);
  second.visibility(true);
  assert.equal(env.surfaces, 1);
  assert.equal(first.target.dataset.ready, "true");
  assert.equal(second.target.dataset.ready, "true");
  assert.equal(env.frames.size, 1);
  first.cleanup?.();
  assert.equal(env.releases, 0);
  assert.equal(env.frames.size, 1);
  second.cleanup?.();
  assert.equal(env.releases, 1);
  assert.equal(env.frames.size, 0);
  assert.equal(env.documentEvents.size, 0);
  assert.equal(env.disconnected, true);
  env.mount().cleanup?.();
  assert.equal(env.surfaces, 2);
  assert.equal(env.releases, 2);
});

test("shader animation stops for reduced motion, hidden tabs, and offscreen previews", () => {
  const env = setup();
  const preview = env.mount();
  preview.visibility(true);
  env.motion.matches = true;
  env.advanceFrame();
  assert.equal(env.frames.size, 0, "a queued frame must stop even before a media-query event");
  env.changeMotion(false);
  assert.equal(env.frames.size, 1);
  env.changeMotion(true);
  assert.equal(env.frames.size, 0);
  assert.equal(preview.target.dataset.ready, "true", "reduced motion retains the static shader image");
  env.changeMotion(false);
  env.document.hidden = true;
  env.documentEvents.get("visibilitychange")?.();
  assert.equal(env.frames.size, 0);
  env.document.hidden = false;
  env.documentEvents.get("visibilitychange")?.();
  assert.equal(env.frames.size, 1);
  preview.visibility(false);
  assert.equal(env.frames.size, 0);
  preview.visibility(true);
  assert.equal(env.frames.size, 1);
  env.surfaceEvents.get("webglcontextlost")?.();
  assert.equal(env.frames.size, 0);
  assert.equal(preview.target.dataset.ready, undefined, "context loss reveals the CSS fallback");
  preview.cleanup?.();
});

test("unavailable WebGL leaves the static treatment without scheduling animation", () => {
  const env = setup(false);
  const preview = env.mount();
  env.mount();
  assert.equal(env.surfaces, 1, "failed contexts are not retried for every inventory card");
  assert.equal(preview.target.dataset.ready, undefined);
  assert.equal(env.frames.size, 0);
  assert.equal(env.documentEvents.size, 0);
});
