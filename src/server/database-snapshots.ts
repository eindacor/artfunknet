import "server-only";

import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzip, gunzip } from "node:zlib";

import {
  BSON,
  type CreateIndexesOptions,
  type Db,
  type Document,
  type IndexSpecification,
} from "mongodb";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const SNAPSHOT_FORMAT = "artfunknet-content-snapshot";
const SNAPSHOT_VERSION = "1";
const SNAPSHOT_EXTENSION = ".artfunk-content.json.gz";
const MAX_SNAPSHOT_BYTES = 512 * 1024 * 1024;

const CONTENT_COLLECTIONS = [
  "artists",
  "artworks",
  "attributes",
  "unique_attributes",
  "gallery_finishes",
  "metadata",
] as const;

const CONTENT_METADATA_IDS = [
  "loot-data",
  "gameplay-settings",
  "card-renderer-settings",
] as const;

type ContentCollectionName = (typeof CONTENT_COLLECTIONS)[number];

type SnapshotIndex = {
  key: Document;
  name: string;
  options: CreateIndexesOptions;
};

type SnapshotCollection = {
  name: ContentCollectionName;
  documents: Document[];
  indexes: SnapshotIndex[];
};

type DatabaseSnapshot = {
  format: typeof SNAPSHOT_FORMAT;
  version: typeof SNAPSHOT_VERSION;
  database: string;
  createdAt: string;
  collections: SnapshotCollection[];
};

export type DatabaseSnapshotFile = {
  name: string;
  size: number;
  modifiedAt: string;
};

type SnapshotGlobal = typeof globalThis & {
  artfunkDatabaseSnapshotOperation?: Promise<void>;
};

const snapshotGlobal = globalThis as SnapshotGlobal;

export async function listDatabaseSnapshots(): Promise<
  DatabaseSnapshotFile[]
> {
  const directory = getSnapshotDirectory();
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

export async function generateDatabaseSnapshot(
  database: Db,
  prefix = "artfunknet-content",
): Promise<DatabaseSnapshotFile> {
  return withSnapshotLock(() =>
    generateDatabaseSnapshotUnlocked(database, prefix),
  );
}

export async function storeUploadedDatabaseSnapshot(
  filename: string,
  bytes: Buffer,
): Promise<DatabaseSnapshotFile> {
  if (bytes.length === 0 || bytes.length > MAX_SNAPSHOT_BYTES) {
    throw new Error("Content snapshot files must be between 1 byte and 512 MB.");
  }
  const snapshot = await parseDatabaseSnapshot(bytes);
  const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const timestamp = snapshot.createdAt.replaceAll(":", "-");
  const safeBase = sanitizePrefix(
    path.basename(filename, SNAPSHOT_EXTENSION),
  );
  const storedName =
    `${safeBase}-${timestamp}-${digest}${SNAPSHOT_EXTENSION}`;
  const directory = getSnapshotDirectory();
  await mkdir(directory, { recursive: true });
  const outputPath = path.join(directory, storedName);
  await writeFile(outputPath, bytes);
  const details = await stat(outputPath);
  return {
    name: storedName,
    size: details.size,
    modifiedAt: details.mtime.toISOString(),
  };
}

export async function readDatabaseSnapshotFile(
  filename: string,
): Promise<Buffer> {
  return readFile(resolveSnapshotPath(filename));
}

export async function restoreDatabaseSnapshot(
  database: Db,
  filename: string,
  confirmation: string,
): Promise<{ collectionCount: number; documentCount: number }> {
  if (confirmation !== `LOAD CONTENT ${database.databaseName}`) {
    throw new Error(
      `Type LOAD CONTENT ${database.databaseName} to confirm content replacement.`,
    );
  }

  return withSnapshotLock(async () => {
    const bytes = await readDatabaseSnapshotFile(filename);
    const snapshot = await parseDatabaseSnapshot(bytes);
    if (await hasCompleteContent(database)) {
      await generateDatabaseSnapshotUnlocked(database, "pre-content-restore");
    }

    let documentCount = 0;
    for (const collectionSnapshot of snapshot.collections) {
      if (collectionSnapshot.name === "metadata") {
        await database
          .collection<Document & { _id: string }>("metadata")
          .deleteMany({
          _id: { $in: [...CONTENT_METADATA_IDS] },
          });
        if (collectionSnapshot.documents.length > 0) {
          await database
            .collection<Document>("metadata")
            .insertMany(collectionSnapshot.documents, {
              ordered: true,
            });
          documentCount += collectionSnapshot.documents.length;
        }
        continue;
      }

      const exists = await database
        .listCollections({ name: collectionSnapshot.name }, { nameOnly: true })
        .hasNext();
      if (exists) {
        await database.collection(collectionSnapshot.name).drop();
      }
      const collection = await database.createCollection(
        collectionSnapshot.name,
      );
      if (collectionSnapshot.documents.length > 0) {
        await collection.insertMany(collectionSnapshot.documents, {
          ordered: true,
        });
        documentCount += collectionSnapshot.documents.length;
      }
      for (const index of collectionSnapshot.indexes) {
        await collection.createIndex(
          index.key as IndexSpecification,
          index.options,
        );
      }
    }

    return {
      collectionCount: snapshot.collections.length,
      documentCount,
    };
  });
}

async function generateDatabaseSnapshotUnlocked(
  database: Db,
  prefix: string,
): Promise<DatabaseSnapshotFile> {
  const collections: SnapshotCollection[] = [];
  for (const name of CONTENT_COLLECTIONS) {
    const exists = await database
      .listCollections({ name }, { nameOnly: true })
      .hasNext();
    if (!exists) {
      throw new Error(`Required content collection ${name} is unavailable.`);
    }
    const collection = database.collection(name);
    const [documents, rawIndexes] = await Promise.all([
      name === "metadata"
        ? database
            .collection<Document & { _id: string }>("metadata")
            .find({ _id: { $in: [...CONTENT_METADATA_IDS] } })
            .toArray()
        : collection.find({}).toArray(),
      collection.indexes(),
    ]);
    if (name === "metadata" && documents.length !== CONTENT_METADATA_IDS.length) {
      throw new Error("Required game metadata is incomplete.");
    }
    collections.push({
      name,
      documents,
      indexes: rawIndexes.flatMap((index) => {
        if (index.name === "_id_" || !index.name) return [];
        const { key, name: indexName, ...rawOptions } = index;
        const options = { ...rawOptions } as Record<string, unknown>;
        delete options.ns;
        delete options.v;
        return [
          {
            key,
            name: indexName,
            options: {
              ...options,
              name: indexName,
            },
          },
        ];
      }),
    });
  }

  const snapshot: DatabaseSnapshot = {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    database: database.databaseName,
    createdAt: new Date().toISOString(),
    collections,
  };
  const compressed = await gzipAsync(
    Buffer.from(
      BSON.EJSON.stringify(snapshot, {
        relaxed: false,
      }),
    ),
  );
  const filename =
    `${sanitizePrefix(prefix)}-${snapshot.createdAt.replaceAll(":", "-")}` +
    SNAPSHOT_EXTENSION;
  const directory = getSnapshotDirectory();
  await mkdir(directory, { recursive: true });
  const outputPath = path.join(directory, filename);
  await writeFile(outputPath, compressed);
  const details = await stat(outputPath);
  return {
    name: filename,
    size: details.size,
    modifiedAt: details.mtime.toISOString(),
  };
}

async function parseDatabaseSnapshot(
  compressed: Buffer,
): Promise<DatabaseSnapshot> {
  let parsed: unknown;
  try {
    const serialized = await gunzipAsync(compressed);
    parsed = BSON.EJSON.parse(serialized.toString("utf8"), {
      relaxed: false,
    });
  } catch {
    throw new Error("The selected file is not a readable content snapshot.");
  }
  if (!isDatabaseSnapshot(parsed)) {
    throw new Error("The selected file is not an Artfunknet content snapshot.");
  }
  return parsed;
}

function isDatabaseSnapshot(value: unknown): value is DatabaseSnapshot {
  if (!isRecord(value)) return false;
  if (
    value.format !== SNAPSHOT_FORMAT ||
    value.version !== SNAPSHOT_VERSION ||
    typeof value.database !== "string" ||
    typeof value.createdAt !== "string" ||
    !Array.isArray(value.collections) ||
    value.collections.length !== CONTENT_COLLECTIONS.length
  ) {
    return false;
  }
  const names = new Set<string>();
  for (const collection of value.collections) {
    if (
      !isRecord(collection) ||
      typeof collection.name !== "string" ||
      !isContentCollectionName(collection.name) ||
      names.has(collection.name) ||
      !Array.isArray(collection.documents) ||
      !collection.documents.every(isRecord) ||
      !Array.isArray(collection.indexes) ||
      !collection.indexes.every(
        (index) =>
          isRecord(index) &&
          isRecord(index.key) &&
          typeof index.name === "string" &&
          isRecord(index.options),
      )
    ) {
      return false;
    }
    if (
      collection.name === "metadata" &&
      !hasExactMetadataDocuments(collection.documents)
    ) {
      return false;
    }
    names.add(collection.name);
  }
  return CONTENT_COLLECTIONS.every((name) => names.has(name));
}

function hasExactMetadataDocuments(documents: Document[]): boolean {
  const ids = documents.map((document) => document._id);
  return (
    ids.length === CONTENT_METADATA_IDS.length &&
    CONTENT_METADATA_IDS.every((id) => ids.includes(id))
  );
}

function resolveSnapshotPath(filename: string): string {
  if (
    path.basename(filename) !== filename ||
    !filename.endsWith(SNAPSHOT_EXTENSION)
  ) {
    throw new Error("Invalid content snapshot filename.");
  }
  return path.join(getSnapshotDirectory(), filename);
}

function getSnapshotDirectory(): string {
  return path.join(process.cwd(), "storage", "db-backups");
}

function sanitizePrefix(value: string): string {
  const sanitized = value
    .replace(SNAPSHOT_EXTENSION, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return sanitized || "artfunknet-content";
}

function isContentCollectionName(
  value: string,
): value is ContentCollectionName {
  return CONTENT_COLLECTIONS.includes(value as ContentCollectionName);
}

async function hasCompleteContent(database: Db): Promise<boolean> {
  const existing = new Set(
    (
      await database
        .listCollections({}, { nameOnly: true })
        .toArray()
    ).map((collection) => collection.name),
  );
  return CONTENT_COLLECTIONS.every((name) => existing.has(name));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function withSnapshotLock<T>(operation: () => Promise<T>): Promise<T> {
  if (snapshotGlobal.artfunkDatabaseSnapshotOperation) {
    throw new Error("Another content snapshot operation is already running.");
  }
  let release: (() => void) | undefined;
  snapshotGlobal.artfunkDatabaseSnapshotOperation = new Promise<void>(
    (resolve) => {
      release = resolve;
    },
  );
  try {
    return await operation();
  } finally {
    release?.();
    snapshotGlobal.artfunkDatabaseSnapshotOperation = undefined;
  }
}
