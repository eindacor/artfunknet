import "server-only";

import { spawn } from "node:child_process";
import {
  mkdir,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";

const SNAPSHOT_EXTENSION = ".mongodump.archive.gz";

export type FullDatabaseSnapshotFile = {
  name: string;
  size: number;
  modifiedAt: string;
};

type SnapshotGlobal = typeof globalThis & {
  artfunkFullDatabaseSnapshotOperation?: Promise<void>;
};

const snapshotGlobal = globalThis as SnapshotGlobal;

export async function listFullDatabaseSnapshots(): Promise<
  FullDatabaseSnapshotFile[]
> {
  const directory = getFullSnapshotDirectory();
  await mkdir(directory, { recursive: true });
  const names = await readdir(directory);
  const snapshots = await Promise.all(
    names
      .filter((name) => name.endsWith(SNAPSHOT_EXTENSION))
      .map(async (name) => {
        const details = await stat(path.join(directory, name));
        return {
          name,
          size: details.size,
          modifiedAt: details.mtime.toISOString(),
        };
      }),
  );
  return snapshots.sort((left, right) =>
    right.modifiedAt.localeCompare(left.modifiedAt),
  );
}

export async function generateFullDatabaseSnapshot(
  databaseName: string,
): Promise<FullDatabaseSnapshotFile> {
  if (snapshotGlobal.artfunkFullDatabaseSnapshotOperation) {
    throw new Error("Another full database snapshot is already running.");
  }
  let release: (() => void) | undefined;
  snapshotGlobal.artfunkFullDatabaseSnapshotOperation = new Promise<void>(
    (resolve) => {
      release = resolve;
    },
  );
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not configured.");
    const directory = getFullSnapshotDirectory();
    await mkdir(directory, { recursive: true });
    const timestamp = new Date().toISOString().replaceAll(":", "-");
    const filename =
      `${sanitizeFilename(databaseName)}-${timestamp}${SNAPSHOT_EXTENSION}`;
    const outputPath = path.join(directory, filename);
    const partialPath = `${outputPath}.partial`;
    try {
      await runMongoDump(uri, databaseName, partialPath);
      await rename(partialPath, outputPath);
    } catch (error) {
      await rm(partialPath, { force: true }).catch(() => undefined);
      throw error;
    }
    const details = await stat(outputPath);
    return {
      name: filename,
      size: details.size,
      modifiedAt: details.mtime.toISOString(),
    };
  } finally {
    release?.();
    snapshotGlobal.artfunkFullDatabaseSnapshotOperation = undefined;
  }
}

export async function getFullDatabaseSnapshotDownload(
  filename: string,
): Promise<{ path: string; size: number }> {
  const snapshotPath = resolveFullSnapshotPath(filename);
  const details = await stat(snapshotPath);
  return { path: snapshotPath, size: details.size };
}

function runMongoDump(
  uri: string,
  databaseName: string,
  outputPath: string,
): Promise<void> {
  const executable = process.env.MONGODUMP_PATH?.trim() || "mongodump";
  return new Promise((resolve, reject) => {
    const child = spawn(
      /* turbopackIgnore: true */
      executable,
      [
        "--uri",
        uri,
        "--db",
        databaseName,
        `--archive=${outputPath}`,
        "--gzip",
      ],
      {
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-16_384);
    });
    child.on("error", (error) => {
      reject(
        error.message.includes("ENOENT")
          ? new Error(
              `mongodump is unavailable. Install MongoDB Database Tools or set MONGODUMP_PATH. (${error.message})`,
            )
          : error,
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `mongodump exited with code ${code ?? "unknown"}${
            stderr.trim()
              ? `: ${stderr.trim().replaceAll(uri, "<redacted MongoDB URI>")}`
              : "."
          }`,
        ),
      );
    });
  });
}

function resolveFullSnapshotPath(filename: string): string {
  if (
    path.basename(filename) !== filename ||
    !filename.endsWith(SNAPSHOT_EXTENSION)
  ) {
    throw new Error("Invalid full database snapshot filename.");
  }
  return path.join(getFullSnapshotDirectory(), filename);
}

function getFullSnapshotDirectory(): string {
  const configured = process.env.DATABASE_SNAPSHOT_DIRECTORY?.trim();
  return configured
    ? path.resolve(configured)
    : path.join(process.cwd(), "storage", "db-snapshots");
}

function sanitizeFilename(value: string): string {
  const sanitized = value
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return sanitized || "artfunknet";
}
