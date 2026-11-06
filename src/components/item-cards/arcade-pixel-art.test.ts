import assert from "node:assert/strict";
import test from "node:test";
import { getArcadePixelSource, loadArcadePixelArt } from "./arcade-pixel-art.ts";

test("pixel sources stay same-origin without losing image versions, admin scope or local previews", () => {
  assert.equal(getArcadePixelSource("/api/artwork/a/image?variant=card&v=abc&admin=1"),
    "/api/artwork/a/image?variant=card&v=abc&admin=1&texture=1");
  assert.equal(getArcadePixelSource("/api/artwork/a/image?texture=1&variant=card"),
    "/api/artwork/a/image?texture=1&variant=card");
  for (const source of ["blob:http://localhost/preview", "data:image/png;base64,test", "https://images.example/art.png"]) {
    assert.equal(getArcadePixelSource(source), source);
  }
});

test("seasonal pixel art downsamples once, bounds its public cache and retries failures without caching private previews", async t => {
  const images: MockImage[] = [];
  class MockImage {
    src = "";
    crossOrigin = "";
    naturalWidth = 800;
    naturalHeight = 1200;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() { images.push(this); }
  }
  const canvases: { width: number; height: number; draws: unknown[][] }[] = [];
  const previousImage = Object.getOwnPropertyDescriptor(globalThis, "Image");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "Image", { configurable: true, value: MockImage });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    createElement: (tag: string) => {
      assert.equal(tag, "canvas");
      const canvas = {
        width: 0, height: 0, draws: [] as unknown[][],
        getContext: () => ({ drawImage: (...args: unknown[]) => canvas.draws.push(args) }),
        toDataURL: (type: string) => {
          assert.equal(type, "image/png");
          return `data:image/png;base64,${canvas.width}x${canvas.height}`;
        },
      };
      canvases.push(canvas);
      return canvas;
    },
  } });
  t.after(() => {
    if (previousImage) Object.defineProperty(globalThis, "Image", previousImage); else Reflect.deleteProperty(globalThis, "Image");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else Reflect.deleteProperty(globalThis, "document");
  });

  const source = "/api/artwork/pixel-cache/image?variant=card&v=first";
  const first = loadArcadePixelArt(source);
  assert.equal(loadArcadePixelArt(source), first, "Concurrent copies share one image conversion");
  assert.equal(images.length, 1);
  assert.equal(images[0].src, `${source}&texture=1`);
  assert.equal(images[0].crossOrigin, "");
  images[0].onload!();
  assert.equal(await first, "data:image/png;base64,64x96");
  assert.equal(await loadArcadePixelArt(source), await first);
  assert.equal(canvases.length, 1, "Cached artwork is not redrawn");
  assert.equal(canvases[0].draws.length, 1);
  assert.deepEqual(canvases[0].draws[0].slice(1), [0, 0, 64, 96]);

  for (const [width, height, expected] of [[1600, 900, "96x54"], [16, 8, "16x8"]] as const) {
    const pending = loadArcadePixelArt(`${source}-${width}`);
    const image = images.at(-1)!;
    image.naturalWidth = width; image.naturalHeight = height; image.onload!();
    assert.equal(await pending, `data:image/png;base64,${expected}`);
  }
  const failedSource = "/api/artwork/pixel-error/image?variant=card";
  const failed = loadArcadePixelArt(failedSource);
  images.at(-1)!.onerror!();
  await assert.rejects(failed, /could not be loaded/);
  const retry = loadArcadePixelArt(failedSource);
  images.at(-1)!.onload!();
  assert.equal(await retry, "data:image/png;base64,64x96");
  const invalid = loadArcadePixelArt("/api/artwork/pixel-empty/image");
  images.at(-1)!.naturalWidth = 0; images.at(-1)!.onload!();
  await assert.rejects(invalid, /no image dimensions/);

  for (const privateSource of ["/api/artwork/private/image?admin=1", "blob:http://localhost/preview"]) {
    const before = images.length;
    const requests = [loadArcadePixelArt(privateSource), loadArcadePixelArt(privateSource)];
    assert.equal(images.length - before, 2, "Admin images and local uploads are not retained in the shared cache");
    images.slice(before).forEach(image => image.onload!());
    await Promise.all(requests);
  }
  for (let index = 0; index < 33; index++) {
    const pending = loadArcadePixelArt(`/api/artwork/pixel-${index}/image?variant=card`);
    images.at(-1)!.onload!();
    await pending;
  }
  const before = images.length;
  const evicted = loadArcadePixelArt(source);
  assert.equal(images.length, before + 1, "The cache releases old artwork instead of growing indefinitely");
  images.at(-1)!.onload!();
  await evicted;
});
