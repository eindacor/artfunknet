import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createArtworkSubmission,
  discoverArtworkFiles,
} from "./artwork-import.mjs";

test("discovers supported artwork files recursively", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "artfunkel-artwork-"));

  try {
    await mkdir(path.join(root, "nested"));
    await writeFile(path.join(root, "first.jpg"), "first");
    await writeFile(path.join(root, "notes.txt"), "not an image");
    await writeFile(path.join(root, "nested", "second.PNG"), "second");

    const files = await discoverArtworkFiles(root);

    assert.deepEqual(
      files.map((file) => path.basename(file)),
      ["first.jpg", "second.PNG"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("creates an unverified submission with a stable checksum", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "artfunkel-artwork-"));

  try {
    const publicDirectory = path.join(root, "public", "incoming");
    const imagePath = path.join(publicDirectory, "painting.bmp");
    const importedAt = new Date("2026-01-01T00:00:00.000Z");

    await mkdir(publicDirectory, { recursive: true });
    await writeFile(imagePath, "image contents");

    const first = await createArtworkSubmission(
      imagePath,
      root,
      importedAt,
    );
    const second = await createArtworkSubmission(
      imagePath,
      root,
      importedAt,
    );

    assert.equal(first._id, second._id);
    assert.equal(first.status, "unverified");
    assert.equal(
      first.image.sources[0].public_url,
      "/incoming/painting.bmp",
    );
    assert.deepEqual(first.draft, {});
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
