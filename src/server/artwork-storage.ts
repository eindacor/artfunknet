import "server-only";

import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type {
  ArtworkImageVariantName,
  ProcessedArtworkVariant,
} from "@/server/artwork-image-processing";
import {
  logOperationalError,
  logOperationalInfo,
} from "@/server/operational-logging";

const EXTENSIONS_BY_MIME_TYPE: Record<string, string> = {
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/tiff": "tiff",
  "image/webp": "webp",
};

export type ArtworkStorageReference =
  | {
      provider: "mock-s3";
      key: string;
    }
  | {
      provider: "s3";
      bucket: string;
      key: string;
      version_id?: string;
    };

export type ArtworkStorageConnectionStatus = {
  provider: "mock-s3" | "s3";
  configured: boolean;
  connected: boolean | null;
  bucket: string | null;
  region: string;
  cdnBaseUrl: string | null;
  message: string;
};

export type ArtworkImageVariant = Omit<ProcessedArtworkVariant, "path"> & {
  storage: ArtworkStorageReference;
};

export type ArtworkImageRecord = {
  version: 2;
  variants: Record<ArtworkImageVariantName, ArtworkImageVariant>;
};

export type LegacyArtworkImageRecord = {
  content_type: string;
  storage: ArtworkStorageReference;
};

let s3Client: S3Client | undefined;

export async function getArtworkStorageConnectionStatus({
  verify = false,
}: {
  verify?: boolean;
} = {}): Promise<ArtworkStorageConnectionStatus> {
  const region = process.env.AWS_REGION?.trim() || "us-east-1";
  const cdnBaseUrl =
    process.env.ARTWORK_CDN_BASE_URL?.trim().replace(/\/+$/, "") || null;

  if (isMockS3Enabled()) {
    return {
      provider: "mock-s3",
      configured: true,
      connected: true,
      bucket: null,
      region,
      cdnBaseUrl,
      message: "Local mock-S3 artwork storage is enabled.",
    };
  }

  const bucket = process.env.ARTWORK_S3_BUCKET?.trim() || null;
  if (!bucket) {
    return {
      provider: "s3",
      configured: false,
      connected: false,
      bucket: null,
      region,
      cdnBaseUrl,
      message: "ARTWORK_S3_BUCKET is not configured.",
    };
  }

  if (!verify) {
    return {
      provider: "s3",
      configured: true,
      connected: null,
      bucket,
      region,
      cdnBaseUrl,
      message: "S3 is configured but has not been tested in this view.",
    };
  }

  try {
    await getS3Client().send(new HeadBucketCommand({ Bucket: bucket }));
    return {
      provider: "s3",
      configured: true,
      connected: true,
      bucket,
      region,
      cdnBaseUrl,
      message: `Connected to S3 bucket ${bucket}.`,
    };
  } catch (error) {
    logOperationalError("artwork_storage.connection_failed", error, {
      bucket,
      region,
    });
    return {
      provider: "s3",
      configured: true,
      connected: false,
      bucket,
      region,
      cdnBaseUrl,
      message: `Could not access S3 bucket ${bucket}. Check the bucket, region, credentials, and IAM permissions.`,
    };
  }
}

export async function verifyArtworkStorageConnection(): Promise<void> {
  const status = await getArtworkStorageConnectionStatus({ verify: true });
  if (!status.connected) {
    throw new ArtworkStorageConfigurationError(status.message);
  }
}

export async function uploadArtworkIntake(file: File) {
  const upload = await readArtworkUpload(file);
  const key = `artwork-intake/${upload.digest}`;
  const storage = isMockS3Enabled()
    ? await putMockObject(key, upload.bytes)
    : await putS3Object(
        key,
        upload.bytes,
        upload.mimeType,
        upload.digest,
      );
  const intakeStorage =
    storage.provider === "s3"
      ? {
          provider: storage.provider,
          bucket: storage.bucket,
          key: storage.key,
        }
      : storage;
  logOperationalInfo("artwork_storage.intake_uploaded", {
    byteSize: upload.byteSize,
    contentType: upload.mimeType,
    key: storage.key,
    provider: storage.provider,
  });

  return {
    digest: upload.digest,
    extension: upload.extension,
    mimeType: upload.mimeType,
    byteSize: upload.byteSize,
    originalFilename: upload.originalFilename,
    storage: intakeStorage,
  };
}

export async function readArtworkUpload(file: File) {
  validateUpload(file);

  const bytes = Buffer.from(await file.arrayBuffer());
  return {
    bytes,
    digest: createHash("sha256").update(bytes).digest("hex"),
    extension: EXTENSIONS_BY_MIME_TYPE[file.type],
    mimeType: file.type,
    byteSize: file.size,
    originalFilename: file.name,
  };
}

export async function readArtworkObject(
  storage: ArtworkStorageReference,
): Promise<Buffer> {
  if (storage.provider === "mock-s3") {
    return readFile(resolveMockKey(storage.key));
  }

  assertConfiguredBucket(storage.bucket);
  let result;
  try {
    result = await getS3Client().send(
      new GetObjectCommand({
        Bucket: storage.bucket,
        Key: storage.key,
        VersionId: storage.version_id,
      }),
    );
  } catch (error) {
    logOperationalError("artwork_storage.read_failed", error, {
      bucket: storage.bucket,
      key: storage.key,
    });
    throw error;
  }

  if (!result.Body) {
    throw new Error("The S3 artwork object has no body.");
  }

  return Buffer.from(await result.Body.transformToByteArray());
}

export async function publishArtworkVariants({
  artworkId,
  variants,
}: {
  artworkId: string;
  variants: Record<ArtworkImageVariantName, ProcessedArtworkVariant>;
}): Promise<ArtworkImageRecord> {
  const publishedEntries: Array<
    [ArtworkImageVariantName, ArtworkImageVariant]
  > = [];
  try {
    for (const name of ["full", "card", "thumb"] as const) {
      const variant = variants[name];
      const key =
        `artworks/${name}/${artworkId}_${name}_` +
        `${variant.checksum.slice(0, 16)}.${variant.extension}`;
      const bytes = await readFile(variant.path);
      const storage = isMockS3Enabled()
        ? await putMockObject(key, bytes)
        : await putS3Object(
            key,
            bytes,
            variant.content_type,
            variant.checksum,
          );

      publishedEntries.push([
        name,
        {
          extension: variant.extension,
          content_type: variant.content_type,
          width: variant.width,
          height: variant.height,
          byte_size: variant.byte_size,
          checksum: variant.checksum,
          storage,
        },
      ]);
      logOperationalInfo("artwork_storage.variant_published", {
        artworkId,
        byteSize: variant.byte_size,
        height: variant.height,
        key: storage.key,
        provider: storage.provider,
        variant: name,
        width: variant.width,
      });
    }
  } catch (error) {
    await Promise.all(
      publishedEntries.map(([, variant]) =>
        deleteArtworkObject(variant.storage),
      ),
    ).catch((cleanupError) => {
      logOperationalError(
        "artwork_storage.partial_publication_cleanup_failed",
        cleanupError,
        { artworkId, publishedVariantCount: publishedEntries.length },
      );
    });
    throw error;
  }

  return {
    version: 2,
    variants: Object.fromEntries(
      publishedEntries,
    ) as ArtworkImageRecord["variants"],
  };
}

export async function deleteArtworkImageRecord(
  image: ArtworkImageRecord | LegacyArtworkImageRecord,
  retainedStorageKeys: ReadonlySet<string> = new Set(),
): Promise<void> {
  if (!("variants" in image)) {
    if (!retainedStorageKeys.has(getStorageIdentity(image.storage))) {
      await deleteArtworkObject(image.storage);
    }
    return;
  }
  await Promise.all(
    Object.values(image.variants)
      .map(({ storage }) => storage)
      .filter(
        (storage) => !retainedStorageKeys.has(getStorageIdentity(storage)),
      )
      .map((storage) => deleteArtworkObject(storage)),
  );
}

export function getArtworkImageStorageKeys(
  image: ArtworkImageRecord | LegacyArtworkImageRecord,
): Set<string> {
  const storages = "variants" in image
    ? Object.values(image.variants).map(({ storage }) => storage)
    : [image.storage];
  return new Set(storages.map(getStorageIdentity));
}

export async function deleteArtworkObject(
  storage: ArtworkStorageReference,
): Promise<void> {
  if (storage.provider === "mock-s3") {
    await unlink(resolveMockKey(storage.key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
    return;
  }

  assertConfiguredBucket(storage.bucket);
  try {
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: storage.bucket,
        Key: storage.key,
        VersionId: storage.version_id,
      }),
    );
  } catch (error) {
    logOperationalError("artwork_storage.delete_failed", error, {
      bucket: storage.bucket,
      key: storage.key,
    });
    throw error;
  }
}

export function getArtworkUrl(
  artworkId: string,
  variant: ArtworkImageVariantName = "full",
): string {
  return `/api/artwork/${encodeURIComponent(artworkId)}/image?variant=${variant}`;
}

export function getArtworkObjectPublicUrl(
  storage: ArtworkStorageReference,
): string | null {
  if (storage.provider !== "s3") return null;
  const baseUrl =
    process.env.ARTWORK_CDN_BASE_URL?.trim().replace(/\/+$/, "") || null;
  if (!baseUrl) return null;
  const encodedKey = storage.key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${baseUrl}/${encodedKey}`;
}

export class ArtworkUploadError extends Error {}
export class ArtworkStorageConfigurationError extends Error {}

function isMockS3Enabled(): boolean {
  return process.env.USE_MOCK_S3?.toLowerCase() === "true";
}

async function putMockObject(
  key: string,
  bytes: Buffer,
): Promise<ArtworkStorageReference> {
  const outputPath = resolveMockKey(key);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);

  return {
    provider: "mock-s3",
    key,
  };
}

function resolveMockKey(key: string): string {
  const storageRoot = path.join(process.cwd(), "storage", "mock-s3");
  const resolvedPath = path.resolve(storageRoot, key);
  const relativePath = path.relative(storageRoot, resolvedPath);

  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("Invalid mock S3 object key.");
  }

  return resolvedPath;
}

async function putS3Object(
  key: string,
  bytes: Buffer,
  contentType: string,
  checksum: string,
): Promise<ArtworkStorageReference> {
  const bucket = getBucket();

  let result;
  try {
    result = await getS3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        CacheControl: key.startsWith("artworks/")
          ? "public, max-age=31536000, immutable"
          : "private, no-store",
        Metadata: {
          checksum,
        },
      }),
    );
  } catch (error) {
    logOperationalError("artwork_storage.write_failed", error, {
      bucket,
      byteSize: bytes.byteLength,
      contentType,
      key,
    });
    throw error;
  }

  return {
    provider: "s3",
    bucket,
    key,
    ...(result.VersionId ? { version_id: result.VersionId } : {}),
  };
}

function getS3Client(): S3Client {
  s3Client ??= new S3Client({
    region: process.env.AWS_REGION ?? "us-east-1",
  });

  return s3Client;
}

function getBucket(): string {
  const bucket = process.env.ARTWORK_S3_BUCKET?.trim();

  if (!bucket) {
    throw new ArtworkStorageConfigurationError(
      "ARTWORK_S3_BUCKET is not configured.",
    );
  }

  return bucket;
}

function assertConfiguredBucket(bucket: string) {
  if (bucket !== getBucket()) {
    throw new ArtworkStorageConfigurationError(
      "The artwork record references an unexpected S3 bucket.",
    );
  }
}

function getStorageIdentity(storage: ArtworkStorageReference): string {
  return storage.provider === "s3"
    ? `s3:${storage.bucket}:${storage.key}`
    : `mock-s3:${storage.key}`;
}

function validateUpload(file: File) {
  const maxBytes = Number(
    process.env.MAX_ARTWORK_UPLOAD_BYTES ?? 25 * 1024 * 1024,
  );

  if (file.size === 0) {
    throw new ArtworkUploadError("The selected image is empty.");
  }

  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new ArtworkStorageConfigurationError(
      "MAX_ARTWORK_UPLOAD_BYTES is invalid.",
    );
  }

  if (file.size > maxBytes) {
    throw new ArtworkUploadError(
      `The selected image exceeds the ${(
        maxBytes /
        1024 /
        1024
      ).toFixed(0)} MB limit.`,
    );
  }

  if (!EXTENSIONS_BY_MIME_TYPE[file.type]) {
    throw new ArtworkUploadError(
      "Supported image types are BMP, GIF, JPEG, PNG, TIFF, and WebP.",
    );
  }
}
