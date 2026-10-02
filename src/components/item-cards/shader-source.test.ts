import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  expandShaderIncludes,
  loadShaderSource,
  resolveShaderIncludeUrl,
} from "./shader-source.ts";

test("shader includes expand nested files once", async () => {
  const includes = new Map([
    [
      "checkerboard",
      "{{{math}}}\nfloat checkerboard(vec2 point) { return sum(point); }",
    ],
    ["math", "float sum(vec2 value) { return value.x + value.y; }"],
  ]);

  const source = await expandShaderIncludes(
    "{{{checkerboard}}}\n{{{math}}}\nvoid main() {}",
    async (includeName) => {
      const include = includes.get(includeName);
      if (!include) throw new Error(`Missing ${includeName}`);
      return include;
    },
  );

  assert.match(source, /float checkerboard/);
  assert.equal(source.match(/float sum/g)?.length, 1);
  assert.match(source, /shader include already expanded: math/);
  assert.doesNotMatch(source, /\{\{\{/);
});

test("shader includes reject unsafe names", async () => {
  await assert.rejects(
    expandShaderIncludes("{{{../private}}}", async () => ""),
    /Invalid shader include/,
  );
});

test("shader includes report circular dependencies", async () => {
  const includes = new Map([
    ["first", "{{{second}}}"],
    ["second", "{{{first}}}"],
  ]);

  await assert.rejects(
    expandShaderIncludes("{{{first}}}", async (includeName) => {
      const include = includes.get(includeName);
      if (!include) throw new Error(`Missing ${includeName}`);
      return include;
    }),
    /Circular shader include: first -> second -> first/,
  );
});

test("shader include names resolve under the shared GLSL directory", () => {
  assert.equal(
    resolveShaderIncludeUrl("patterns/checkerboard"),
    "/shaders/includes/patterns/checkerboard.glsl",
  );
});

test("shader source loading expands includes and reports missing files", async () => {
  const sources = new Map([
    ["/shaders/example.frag", "{{{shared}}}\nvoid main() {}"],
    ["/shaders/includes/shared.glsl", "float sharedValue() { return 1.0; }"],
  ]);

  const loadedSource = await loadShaderSource(
    "/shaders/example.frag",
    async (url) => {
      const source = sources.get(url);
      if (!source) throw new Error("404 Not Found");
      return source;
    },
  );

  assert.match(loadedSource, /float sharedValue/);

  await assert.rejects(
    loadShaderSource("/shaders/missing-include.frag", async (url) => {
      if (url === "/shaders/missing-include.frag") return "{{{missing}}}";
      throw new Error("404 Not Found");
    }),
    /Failed to load shader source "\/shaders\/includes\/missing\.glsl": 404 Not Found/,
  );
});

test("Prismatic Showcase expands the shared utility file", async () => {
  const source = await loadShaderSource(
    "/shaders/prismatic-showcase.frag",
    async (url) =>
      readFile(
        path.join(
          process.cwd(),
          "public",
          ...url.split("/").filter(Boolean),
        ),
        "utf8",
      ),
  );

  assert.match(source, /mat2 createRotationMatrix/);
  assert.match(source, /float getHTVFactor/);
  assert.doesNotMatch(source, /\{\{\{/);
});

test("shared shader utilities avoid syntax unsupported by WebGL 1", async () => {
  const source = await readFile(
    path.join(
      process.cwd(),
      "public",
      "shaders",
      "includes",
      "utility_funcs.glsl",
    ),
    "utf8",
  );

  assert.doesNotMatch(source, /\b\d+(?:\.\d*)?f\b/i);
  assert.doesNotMatch(source, /\bmat[234]x[234]\b/);
  assert.doesNotMatch(
    source,
    /\b(?:float[234](?:x[234])?|half[234]?|fixed[234]?)\b/,
  );
  assert.doesNotMatch(source, /\bvec[234]\s*\[/);
  assert.doesNotMatch(source, /%/);
});

test("shared shader utilities expose a fixed-size image palette sampler", async () => {
  const source = await readFile(
    path.join(
      process.cwd(),
      "public",
      "shaders",
      "includes",
      "utility_funcs.glsl",
    ),
    "utf8",
  );

  assert.match(source, /#define IMAGE_PALETTE_SIZE 8/);
  assert.match(
    source,
    /void getImagePalette\(float seed, out vec3 colors\[IMAGE_PALETTE_SIZE\]\)/,
  );
  assert.equal(source.match(/texture2D\(u_image,/g)?.length, 5);
  assert.equal(source.match(/colors\[[567]\] = paletteColor/g)?.length, 3);
});

test("shared shader utilities compare colors and select the strongest contrast", async () => {
  const source = await readFile(
    path.join(
      process.cwd(),
      "public",
      "shaders",
      "includes",
      "utility_funcs.glsl",
    ),
    "utf8",
  );

  assert.match(
    source,
    /float getColorContrastRating\(vec3 colorA, vec3 colorB\)/,
  );
  assert.match(
    source,
    /void getHighestContrastColors\(\s*vec3 colors\[IMAGE_PALETTE_SIZE\],\s*out vec3 colorA,\s*out vec3 colorB\s*\)/,
  );
  assert.match(
    source,
    /for \(int i = 0; i < IMAGE_PALETTE_SIZE; i\+\+\)/,
  );
  assert.match(
    source,
    /for \(int j = 0; j < IMAGE_PALETTE_SIZE; j\+\+\)/,
  );
});

test("Prismatic Showcase uses a WebGL 1-compatible Perlin loop bound", async () => {
  const source = await readFile(
    path.join(
      process.cwd(),
      "public",
      "shaders",
      "prismatic-showcase.frag",
    ),
    "utf8",
  );

  assert.match(source, /for \(int i=0; i<4; i\+\+\)/);
  assert.doesNotMatch(source, /for \(int i=0; i<iterations; i\+\+\)/);
});
