import { spawn } from "node:child_process";
import {
  mkdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB ?? "artfunkel";
const executable = process.env.MONGODUMP_PATH?.trim() || "mongodump";
const directory = process.env.DATABASE_SNAPSHOT_DIRECTORY?.trim()
  ? path.resolve(process.env.DATABASE_SNAPSHOT_DIRECTORY)
  : path.join(process.cwd(), "storage", "db-snapshots");

if (!uri) throw new Error("MONGODB_URI is not configured.");

await mkdir(directory, { recursive: true });
const timestamp = new Date().toISOString().replaceAll(":", "-");
const filename =
  `${sanitizeFilename(databaseName)}-${timestamp}.mongodump.archive.gz`;
const outputPath = path.join(directory, filename);
const partialPath = `${outputPath}.partial`;

try {
  await runMongoDump(partialPath);
  await rename(partialPath, outputPath);
  const details = await stat(outputPath);
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      event: "database_snapshot.completed",
      database: databaseName,
      filename,
      path: outputPath,
      bytes: details.size,
    }),
  );
} catch (error) {
  await rm(partialPath, { force: true }).catch(() => undefined);
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "database_snapshot.failed",
      database: databaseName,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
}

function runMongoDump(targetPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      [
        "--uri",
        uri,
        "--db",
        databaseName,
        `--archive=${targetPath}`,
        "--gzip",
      ],
      {
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
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

function sanitizeFilename(value) {
  const sanitized = value
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return sanitized || "artfunknet";
}
