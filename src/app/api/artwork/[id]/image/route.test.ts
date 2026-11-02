import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test, { type TestContext } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import * as imageUrls from "../../../../../server/artwork-image-url.ts";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  await readFile(new URL("./route.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } },
).outputText;
const bytes = Buffer.from("artwork fixture");
const checksum = createHash("sha256").update(bytes).digest("hex");
const storage = { provider: "mock-s3", key: `artworks/thumb/${checksum}.webp` };
const image = {
  version: 2,
  variants: { thumb: { checksum, content_type: "image/webp", storage } },
};

function createRoute(t: TestContext, artworkImage: unknown = image, publicUrl: string | null = null) {
  const readArtworkObject = t.mock.fn(async () => bytes);
  const findOne = t.mock.fn(async () => ({ _id: "art", active: true, image: artworkImage }));
  const dependencies: Record<string, unknown> = {
    "@/components/seed_image.png": { src: "/seed.png" },
    "@/server/artwork-image-url": imageUrls,
    "@/server/artwork-storage": {
      readArtworkObject,
      getArtworkObjectPublicUrl: () => publicUrl,
    },
    "@/server/mongodb": { getDatabase: async () => ({ collection: () => ({ findOne }) }) },
    "@/server/operational-logging": { logOperationalError: t.mock.fn() },
  };
  const exports = {} as { GET: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> };
  runInNewContext(compiled, {
    exports,
    require: (id: string) => Object.hasOwn(dependencies, id) ? dependencies[id] : require(id),
    process, Buffer, Uint8Array, URL,
  });
  return {
    readArtworkObject,
    findOne,
    get(query = "variant=thumb", headers?: HeadersInit) {
      return exports.GET(new Request(`http://localhost/api/artwork/art/image?${query}`, { headers }), {
        params: Promise.resolve({ id: "art" }),
      });
    },
  };
}

test("validated content-version URLs are immutable locally and same-origin textures stay same-origin", async (t) => {
  const route = createRoute(t);
  const response = await route.get(`variant=thumb&v=${checksum}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(response.headers.get("etag"), `"${checksum}"`);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  const textureRoute = createRoute(t, image, "https://cdn.example/art.webp");
  const texture = await textureRoute.get(`variant=card&v=${checksum}&texture=1`);
  assert.equal(texture.status, 200);
  assert.equal(texture.headers.get("location"), null);
  assert.equal(texture.headers.get("x-artwork-image-variant"), "thumb");
  assert.equal(texture.headers.get("cache-control"), "public, max-age=31536000, immutable");
});

test("unversioned thumbnails revalidate without rereading or redownloading unchanged object bytes", async (t) => {
  const route = createRoute(t);
  const first = await route.get();
  assert.equal(first.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  assert.equal(route.readArtworkObject.mock.callCount(), 1);
  for (const match of [`"${checksum}"`, `W/"${checksum}"`, `"other", W/"${checksum}"`, "*"]) {
    const cached = await route.get("variant=thumb", { "if-none-match": match });
    assert.equal(cached.status, 304);
    assert.equal(await cached.text(), "");
    assert.equal(cached.headers.get("etag"), first.headers.get("etag"));
  }
  assert.equal(route.readArtworkObject.mock.callCount(), 1);
  const changed = await route.get("variant=thumb", { "if-none-match": '"different"' });
  assert.equal(changed.status, 200);
  assert.equal(route.readArtworkObject.mock.callCount(), 2);
});

test("only the current checksum may receive immutable caching, including after an image replacement", async (t) => {
  const route = createRoute(t);
  for (const version of ["2", "old", "d".repeat(64)]) {
    const stale = await route.get(`variant=thumb&v=${version}&texture=1`, { "if-none-match": `"${version}"` });
    assert.equal(stale.status, 307);
    const target = new URL(stale.headers.get("location")!);
    assert.equal(target.searchParams.get("v"), checksum);
    assert.equal(target.searchParams.get("texture"), "1");
    assert.equal(stale.headers.get("cache-control"), "no-store");
  }
  assert.equal(route.readArtworkObject.mock.callCount(), 0);
  const replaced = createRoute(t, {
    ...image, variants: { thumb: { ...image.variants.thumb, checksum: "e".repeat(64) } },
  });
  const response = await replaced.get("variant=thumb", { "if-none-match": `"${checksum}"` });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("etag"), `"${"e".repeat(64)}"`);
});

test("CDN redirects are cacheable by content version and unversioned redirects must revalidate", async (t) => {
  const route = createRoute(t, image, "https://cdn.example/art.webp");
  const versioned = await route.get(`variant=thumb&v=${checksum}`);
  assert.equal(versioned.status, 307);
  assert.equal(versioned.headers.get("location"), "https://cdn.example/art.webp");
  assert.match(versioned.headers.get("cache-control")!, /immutable/);
  const unversioned = await route.get();
  assert.equal(unversioned.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  const cached = await route.get("variant=thumb", { "if-none-match": `"${checksum}"` });
  assert.equal(cached.status, 304);
  assert.equal(route.readArtworkObject.mock.callCount(), 0);
});

test("legacy image bytes can revalidate but are never treated as immutable without a checksum", async (t) => {
  const route = createRoute(t, { content_type: "image/png", storage });
  const first = await route.get();
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  const cached = await route.get("variant=thumb", { "if-none-match": first.headers.get("etag")! });
  assert.equal(cached.status, 304);
  assert.equal(route.readArtworkObject.mock.callCount(), 2);
});

test("fallbacks and storage errors are not cached as artwork versions", async (t) => {
  const missing = createRoute(t, null);
  const fallback = await missing.get(`variant=thumb&v=${checksum}`);
  assert.equal(fallback.status, 200);
  assert.equal(fallback.headers.get("cache-control"), "no-store");
  assert.equal(fallback.headers.get("x-artwork-image-variant"), "seed");
  const broken = createRoute(t);
  broken.readArtworkObject.mock.mockImplementation(async () => { throw new Error("Missing object"); });
  const failed = await broken.get(`variant=thumb&v=${checksum}`);
  assert.equal(failed.status, 404);
  assert.equal(failed.headers.get("cache-control"), "no-store");
});
