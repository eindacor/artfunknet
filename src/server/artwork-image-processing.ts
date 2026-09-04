import "server-only";

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const ARTWORK_IMAGE_VARIANTS = ["full", "card", "thumb"] as const;

export type ArtworkImageVariantName =
  (typeof ARTWORK_IMAGE_VARIANTS)[number];

export type ProcessedArtworkVariant = {
  path: string;
  extension: string;
  content_type: string;
  width: number;
  height: number;
  byte_size: number;
  checksum: string;
};

export type ProcessedArtworkImage = {
  variants: Record<ArtworkImageVariantName, ProcessedArtworkVariant>;
  cleanup: () => Promise<void>;
};

export async function processArtworkImage({
  artworkId,
  extension,
  source,
}: {
  artworkId: string;
  extension: string;
  source: Buffer;
}): Promise<ProcessedArtworkImage> {
  if (!/^[A-Za-z0-9_-]+$/.test(artworkId)) {
    throw new Error("The artwork ID is not safe for image processing.");
  }
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "artfunkel-artwork-"),
  );
  const normalizedExtension = extension.toLowerCase().replace(/^\./, "");
  const inputPath = path.join(
    temporaryDirectory,
    `source.${normalizedExtension}`,
  );
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await rm(temporaryDirectory, { recursive: true, force: true });
  };

  try {
    await writeFile(inputPath, source);
    const output = await runProcessor([
      path.join(process.cwd(), "scripts", "process-artwork-image.py"),
      "--input",
      inputPath,
      "--output-dir",
      temporaryDirectory,
      "--artwork-id",
      artworkId,
      "--extension",
      normalizedExtension,
      "--card-max",
      process.env.ARTWORK_CARD_MAX_PIXELS ?? "900",
      "--thumb-max",
      process.env.ARTWORK_THUMB_MAX_PIXELS ?? "240",
    ]);
    const parsed = JSON.parse(output) as {
      variants?: Partial<
        Record<ArtworkImageVariantName, ProcessedArtworkVariant>
      >;
    };
    const variants = {} as Record<
      ArtworkImageVariantName,
      ProcessedArtworkVariant
    >;
    for (const variant of ARTWORK_IMAGE_VARIANTS) {
      const value = parsed.variants?.[variant];
      const expectedFilename =
        `${artworkId}_${variant}.${normalizedExtension}`;
      const resolvedPath = value ? path.resolve(value.path) : "";
      if (
        !value ||
        path.dirname(resolvedPath) !== temporaryDirectory ||
        path.basename(resolvedPath) !== expectedFilename ||
        value.extension !== normalizedExtension ||
        !Number.isSafeInteger(value.width) ||
        value.width <= 0 ||
        !Number.isSafeInteger(value.height) ||
        value.height <= 0 ||
        !Number.isSafeInteger(value.byte_size) ||
        value.byte_size <= 0 ||
        !/^[a-f0-9]{64}$/.test(value.checksum)
      ) {
        throw new Error(
          `The artwork processor returned invalid ${variant} metadata.`,
        );
      }
      const outputBytes = await readFile(resolvedPath);
      const outputChecksum = createHash("sha256")
        .update(outputBytes)
        .digest("hex");
      if (
        outputBytes.byteLength !== value.byte_size ||
        outputChecksum !== value.checksum
      ) {
        throw new Error(
          `The generated ${variant} image failed its integrity check.`,
        );
      }
      variants[variant] = { ...value, path: resolvedPath };
    }

    return { variants, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function runProcessor(arguments_: string[]): Promise<string> {
  const configuredExecutable = process.env.ARTWORK_PYTHON_BINARY?.trim();
  const executable =
    configuredExecutable || (process.platform === "win32" ? "py" : "python3");
  const processArguments =
    !configuredExecutable && process.platform === "win32"
      ? ["-3", ...arguments_]
      : arguments_;
  const timeoutMs = Number(
    process.env.ARTWORK_PROCESSING_TIMEOUT_MS ?? 120_000,
  );
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("ARTWORK_PROCESSING_TIMEOUT_MS must be positive.");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ executable, processArguments, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill();
      reject(new Error("Artwork image processing timed out."));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new Error(`Unable to start the artwork image processor: ${error.message}`),
      );
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(
          new Error(
            stderr.trim() ||
              `Artwork image processing exited with code ${code ?? "unknown"}.`,
          ),
        );
      }
    });
  });
}
