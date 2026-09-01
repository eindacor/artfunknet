import "server-only";

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

type ArtworkSource = {
  source_path: string;
  extension?: string;
};

function getImportDirectory(): string {
  return path.resolve(
    /* turbopackIgnore: true */
    process.cwd(),
    process.env.ARTWORK_IMPORT_DIR ?? "public/uploaded_images",
  );
}

function isWithinDirectory(filePath: string, directory: string): boolean {
  const relativePath = path.relative(directory, filePath);
  return (
    relativePath !== "" &&
    !relativePath.startsWith(`..${path.sep}`) &&
    relativePath !== ".." &&
    !path.isAbsolute(relativePath)
  );
}

export async function findReadableArtworkSource(
  sources: ArtworkSource[],
): Promise<string> {
  const allowedDirectories = [process.cwd(), getImportDirectory()];

  for (const source of sources) {
    const sourcePath = path.resolve(source.source_path);

    if (
      !allowedDirectories.some((directory) =>
        isWithinDirectory(sourcePath, directory),
      )
    ) {
      continue;
    }

    try {
      await access(sourcePath);
      return sourcePath;
    } catch {
      continue;
    }
  }

  throw new Error("No readable image exists in the configured import directory.");
}

export async function readArtworkSource(
  sources: ArtworkSource[],
): Promise<Buffer> {
  return readFile(
    /* turbopackIgnore: true */
    await findReadableArtworkSource(sources),
  );
}

export async function getArtworkPixelDimensions(
  sources: ArtworkSource[],
): Promise<{ width: number; height: number }> {
  const sourcePath = await findReadableArtworkSource(sources);
  const metadata = await sharp(
    /* turbopackIgnore: true */
    sourcePath,
  ).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("The source image does not contain usable dimensions.");
  }

  return {
    width: metadata.width,
    height: metadata.height,
  };
}

export async function getArtworkBufferDimensions(
  image: Buffer,
): Promise<{ width: number; height: number }> {
  const metadata = await sharp(image).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("The source image does not contain usable dimensions.");
  }

  return {
    width: metadata.width,
    height: metadata.height,
  };
}
