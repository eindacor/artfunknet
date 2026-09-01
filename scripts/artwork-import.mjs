import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const MIME_TYPES = {
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".webp": "image/webp",
};

export async function discoverArtworkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await discoverArtworkFiles(entryPath)));
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (entry.isFile() && MIME_TYPES[extension]) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

export async function createArtworkSubmission(filePath, projectRoot, importedAt) {
  const file = await stat(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const relativePath = path.relative(projectRoot, filePath);
  const normalizedPath = relativePath.split(path.sep).join("/");
  const digest = await hashFile(filePath);
  const publicUrl = normalizedPath.startsWith("public/")
    ? `/${normalizedPath.slice("public/".length)}`
    : undefined;
  const source = {
    original_filename: path.basename(filePath),
    source_path: path.resolve(filePath),
    relative_path: normalizedPath,
    ...(publicUrl ? { public_url: publicUrl } : {}),
  };

  return {
    _id: digest,
    status: "unverified",
    image: {
      extension: extension.slice(1),
      mime_type: MIME_TYPES[extension],
      byte_size: file.size,
      sha256: digest,
      sources: [source],
    },
    draft: {},
    review: {
      imported_at: importedAt,
      updated_at: importedAt,
    },
  };
}

async function hashFile(filePath) {
  const { createReadStream } = await import("node:fs");
  const hash = createHash("sha256");

  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  return hash.digest("hex");
}
