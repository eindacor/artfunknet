import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { getArcadePixelSource } from "./arcade-pixel-art.ts";

const compiled = ts.transpileModule(
  await readFile(new URL("./pop-art-halftone.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

function setup(webglAvailable = true) {
  const images: MockImage[] = [];
  class MockImage {
    src = "";
    crossOrigin = "";
    naturalWidth = 1200;
    naturalHeight = 800;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() { images.push(this); }
  }
  const timers = new Map<number, () => void>();
  const sizes: string[] = [];
  let nextTimer = 0;
  let contexts = 0;
  let releases = 0;
  let textureDeletes = 0;
  let lost = false;
  const noop = () => {};
  const gl = {
    ...Object.fromEntries([
      "shaderSource", "compileShader", "attachShader", "linkProgram", "useProgram",
      "bindBuffer", "bufferData", "enableVertexAttribArray", "vertexAttribPointer",
      "uniform1i", "uniform1f", "uniform2f", "viewport", "bindTexture", "texParameteri",
      "pixelStorei", "texImage2D", "drawArrays", "deleteShader", "deleteBuffer", "deleteProgram",
    ].map((method) => [method, noop])),
    createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}),
    createTexture: () => ({}),
    getShaderParameter: () => true, getProgramParameter: () => true,
    getAttribLocation: () => 0, getUniformLocation: () => ({}),
    NO_ERROR: 0, getError: () => 0,
    isContextLost: () => lost,
    deleteTexture: () => { textureDeletes++; },
    getExtension: () => ({ loseContext: () => { releases++; lost = false; } }),
  };
  const load = runInNewContext(`${compiled}\nexports.loadPopArtHalftone`, {
    exports: {},
    require: () => ({ getArcadePixelSource }),
    Image: MockImage, URL,
    document: {
      createElement: () => {
        const canvas = {
          width: 0, height: 0,
          getContext: (type: string) => {
            if (type !== "webgl") return { drawImage: noop };
            contexts++;
            return webglAvailable ? gl : null;
          },
          toDataURL: () => {
            const size = `${canvas.width}x${canvas.height}`;
            sizes.push(size);
            return `data:image/png;base64,${size}`;
          },
        };
        return canvas;
      },
    },
    setTimeout: (callback: () => void) => {
      const id = ++nextTimer;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
  }) as (source: string, misregistered?: boolean) => Promise<string>;
  return {
    load, images, sizes,
    get contexts() { return contexts; },
    get releases() { return releases; },
    get textureDeletes() { return textureDeletes; },
    loseContext: () => { lost = true; },
    idle() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

test("halftones share versioned public conversions, preserve aspect ratio and clean up textures and idle contexts", async () => {
  const env = setup();
  const source = "/api/artwork/test/image?variant=card&v=first";
  const first = env.load(source);
  assert.equal(env.load(source), first);
  assert.equal(env.images[0].src, `${source}&texture=1`);
  assert.equal(env.images[0].crossOrigin, "");
  env.images[0].onload!();
  assert.equal(await first, "data:image/png;base64,768x512");
  assert.equal(await env.load(source), await first);

  const offset = env.load(source, true);
  assert.notEqual(offset, first, "different plate alignment needs its own print");
  env.images.at(-1)!.onload!();
  await offset;
  const version = env.load(source.replace("first", "second"));
  env.images.at(-1)!.naturalWidth = 16;
  env.images.at(-1)!.naturalHeight = 24;
  env.images.at(-1)!.onload!();
  assert.equal(await version, "data:image/png;base64,16x24", "small uploads are not enlarged");
  assert.equal(env.contexts, 1);
  assert.equal(env.textureDeletes, 3);
  env.idle();
  assert.equal(env.releases, 1);
  const next = env.load(source + "-new");
  env.images.at(-1)!.onload!();
  await next;
  assert.equal(env.contexts, 2, "an idle renderer is recreated only when needed");
  env.loseContext();
  const restored = env.load(source + "-restored");
  env.images.at(-1)!.onload!();
  await restored;
  assert.equal(env.contexts, 3, "a lost renderer can be replaced without affecting existing print images");
  env.idle();
});

test("private images are not retained, failures can retry, and the public print cache stays bounded", async () => {
  const env = setup();
  for (const source of [
    "/api/artwork/private/image?variant=card&admin=1",
    "blob:http://localhost/preview",
    "data:image/png;base64,test",
  ]) {
    const first = env.load(source), second = env.load(source);
    assert.notEqual(first, second, "private previews must not enter the shared public cache");
    const pair = env.images.slice(-2);
    if (source.startsWith("/api/artwork/")) assert.ok(pair[0].src.includes("admin=1&texture=1"));
    else {
      assert.equal(pair[0].src, source);
      assert.equal(pair[0].crossOrigin, "anonymous");
    }
    pair.forEach((image) => image.onload!());
    await Promise.all([first, second]);
  }
  const failedSource = "/api/artwork/retry/image?variant=card";
  const failed = env.load(failedSource);
  env.images.at(-1)!.onerror!();
  await assert.rejects(failed, /could not be loaded/);
  const retry = env.load(failedSource);
  env.images.at(-1)!.onload!();
  await retry;
  const empty = env.load("/api/artwork/empty/image");
  env.images.at(-1)!.naturalWidth = 0;
  env.images.at(-1)!.onload!();
  await assert.rejects(empty, /no dimensions/);
  for (let index = 0; index < 33; index++) {
    const pending = env.load(`/api/artwork/cache-${index}/image`);
    env.images.at(-1)!.onload!();
    await pending;
  }
  const before = env.images.length;
  const evicted = env.load(failedSource);
  assert.equal(env.images.length, before + 1);
  env.images.at(-1)!.onload!();
  await evicted;
  env.idle();
});

test("missing WebGL fails safely without allocating a new context for every visible card", async () => {
  const env = setup(false);
  for (const source of ["/api/artwork/one/image", "/api/artwork/two/image"]) {
    const pending = env.load(source);
    env.images.at(-1)!.onload!();
    await assert.rejects(pending, /WebGL is unavailable/);
  }
  assert.equal(env.contexts, 1);
});
