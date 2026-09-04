import "server-only";

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { readArtworkSource } from "@/server/artwork-files";

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

type LocalArtworkSource = {
  source_path: string;
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
    console.error("Unable to connect to artwork S3 storage", error);
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
  validateUpload(file);

  const bytes = Buffer.from(await file.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  const key = `artwork-intake/${digest}`;
  const storage = isMockS3Enabled()
    ? await putMockObject(key, bytes)
    : await putS3Object(key, bytes, file.type, digest);

  return {
    digest,
    extension: EXTENSIONS_BY_MIME_TYPE[file.type],
    mimeType: file.type,
    byteSize: file.size,
    originalFilename: file.name,
    storage,
  };
}

export async function readArtworkObject(
  storage: ArtworkStorageReference,
): Promise<Buffer> {
  if (storage.provider === "mock-s3") {
    return readFile(resolveMockKey(storage.key));
  }

  assertConfiguredBucket(storage.bucket);
  const result = await getS3Client().send(
    new GetObjectCommand({
      Bucket: storage.bucket,
      Key: storage.key,
    }),
  );

  if (!result.Body) {
    throw new Error("The S3 artwork object has no body.");
  }

  return Buffer.from(await result.Body.transformToByteArray());
}

export async function publishArtwork({
  artworkId,
  contentType,
  intakeStorage,
  localSources,
}: {
  artworkId: string;
  contentType: string;
  intakeStorage?: ArtworkStorageReference;
  localSources: LocalArtworkSource[];
}): Promise<{ storage: ArtworkStorageReference }> {
  const key = `artworks/${artworkId}`;

  if (isMockS3Enabled()) {
    if (intakeStorage?.provider === "mock-s3") {
      await copyMockObject(intakeStorage.key, key);
    } else {
      const bytes = intakeStorage
        ? await readArtworkObject(intakeStorage)
        : await readArtworkSource(localSources);
      await putMockObject(key, bytes);
    }

    return {
      storage: {
        provider: "mock-s3",
        key,
      },
    };
  }

  const bucket = getBucket();

  if (intakeStorage?.provider === "s3") {
    assertConfiguredBucket(intakeStorage.bucket);
    await getS3Client().send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: key,
        CopySource: `${intakeStorage.bucket}/${intakeStorage.key}`,
        ContentType: contentType,
        MetadataDirective: "REPLACE",
      }),
    );
  } else {
    const bytes = intakeStorage
      ? await readArtworkObject(intakeStorage)
      : await readArtworkSource(localSources);
    await putS3Object(key, bytes, contentType, artworkId);
  }

  return {
    storage: {
      provider: "s3",
      bucket,
      key,
    },
  };
}

export function getArtworkUrl(artworkId: string): string {
  if (isMockS3Enabled()) {
    return `/api/artwork/${artworkId}/image`;
  }

  const baseUrl = process.env.ARTWORK_CDN_BASE_URL?.replace(/\/+$/, "");

  if (!baseUrl) {
    throw new ArtworkStorageConfigurationError(
      "ARTWORK_CDN_BASE_URL is not configured.",
    );
  }

  return `${baseUrl}/artworks/${artworkId}`;
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

async function copyMockObject(sourceKey: string, destinationKey: string) {
  const destinationPath = resolveMockKey(destinationKey);

  await mkdir(path.dirname(destinationPath), { recursive: true });
  await copyFile(resolveMockKey(sourceKey), destinationPath);
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

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      Metadata: {
        checksum,
      },
    }),
  );

  return {
    provider: "s3",
    bucket,
    key,
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
