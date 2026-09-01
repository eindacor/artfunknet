import {
  access,
  copyFile,
  mkdir,
  readFile,
  unlink,
} from "node:fs/promises";
import path from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB ?? "artfunkel";
const bucket = process.env.ARTWORK_S3_BUCKET?.trim();
const region = process.env.AWS_REGION ?? "us-east-1";
const useMockS3 = process.env.USE_MOCK_S3?.toLowerCase() === "true";
const desiredProvider = useMockS3 ? "mock-s3" : "s3";

if (!uri) {
  throw new Error("MONGODB_URI is not configured.");
}

if (!useMockS3 && !bucket) {
  throw new Error("ARTWORK_S3_BUCKET is not configured.");
}

const mongoClient = new MongoClient(uri);
const s3Client = useMockS3 ? undefined : new S3Client({ region });

try {
  await mongoClient.connect();
  const database = mongoClient.db(databaseName);
  const artworks = await database
    .collection("artworks")
    .find({
      created_from_submission: { $exists: true },
      "image.storage.provider": { $ne: desiredProvider },
    })
    .toArray();
  let published = 0;

  for (const artwork of artworks) {
    const submission = await database
      .collection("artwork_submissions")
      .findOne({ _id: artwork.created_from_submission });
    const mockSource =
      artwork.image?.storage?.provider === "mock-s3"
        ? path.join(
            process.cwd(),
            "storage",
            "mock-s3",
            artwork.image.storage.key,
          )
        : undefined;
    const sourcePath = await findExistingSource([
      ...(mockSource ? [{ source_path: mockSource }] : []),
      ...(submission?.image?.sources ?? []),
    ]);

    if (!sourcePath) {
      console.warn(`No local source found for artwork ${artwork._id}`);
      continue;
    }

    const key = `artworks/${artwork._id}`;
    const contentType =
      submission?.image?.mime_type ?? "application/octet-stream";

    let storage;

    if (useMockS3) {
      const outputPath = path.join(
        process.cwd(),
        "storage",
        "mock-s3",
        key,
      );
      await mkdir(path.dirname(outputPath), { recursive: true });
      await copyFile(sourcePath, outputPath);
      storage = {
        provider: "mock-s3",
        key,
      };
    } else {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: await readFile(sourcePath),
          ContentType: contentType,
          Metadata: {
            "artwork-id": String(artwork._id),
          },
        }),
      );
      storage = {
        provider: "s3",
        bucket,
        key,
      };
    }

    await database.collection("artworks").updateOne(
      { _id: artwork._id },
      {
        $set: {
          image: {
            content_type: contentType,
            storage,
          },
        },
        $unset: {
          image_url: "",
          filename: "",
          file_extension: "",
          image_storage: "",
        },
      },
    );
    const oldPublicPath =
      typeof artwork.image_url === "string" &&
      artwork.image_url.startsWith("/artwork/")
        ? path.join(process.cwd(), "public", artwork.image_url)
        : undefined;

    if (oldPublicPath) {
      try {
        await unlink(oldPublicPath);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
          throw error;
        }
      }
    }

    published++;
  }

  console.log(`Published approved artworks to ${desiredProvider}: ${published}`);
} finally {
  await mongoClient.close();
}

async function findExistingSource(sources) {
  for (const source of sources) {
    if (!source.source_path) {
      continue;
    }

    try {
      await access(source.source_path);
      return source.source_path;
    } catch {
      continue;
    }
  }

  return undefined;
}
