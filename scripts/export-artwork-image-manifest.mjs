import { writeFile } from "node:fs/promises";
import path from "node:path";

import { MongoClient } from "mongodb";

const EXTENSIONS_BY_CONTENT_TYPE = {
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/tiff": "tiff",
  "image/webp": "webp",
};

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB ?? "artfunkel";
const outputPath = path.resolve(
  process.argv[2] ?? "artwork-image-manifest.txt",
);

if (!uri) {
  throw new Error("MONGODB_URI is not configured.");
}

const client = new MongoClient(uri);

try {
  console.log("[MONGO-CONNECT] export-artwork-image-manifest.mjs: connecting");
  await client.connect();
  console.log("[MONGO-CONNECT] export-artwork-image-manifest: connected");
  const database = client.db(databaseName);
  const artworks = await database
    .collection("artworks")
    .find(
      {
        $or: [
          { "image.storage": { $exists: true } },
          { "image.variants.full.storage": { $exists: true } },
        ],
      },
      {
        projection: {
          _id: 1,
          artist: 1,
          title: 1,
          created_from_submission: 1,
          image: 1,
        },
      },
    )
    .sort({ _id: 1 })
    .toArray();
  const submissionIds = artworks
    .map((artwork) => artwork.created_from_submission)
    .filter((id) => typeof id === "string");
  const submissions = await database
    .collection("artwork_submissions")
    .find(
      { _id: { $in: submissionIds } },
      {
        projection: {
          _id: 1,
          "image.extension": 1,
          "image.sources.original_filename": 1,
          "image.sources.upload_filename": 1,
        },
      },
    )
    .toArray();
  const submissionById = new Map(
    submissions.map((submission) => [submission._id, submission]),
  );
  const rows = artworks.map((artwork) => {
    const submission = submissionById.get(artwork.created_from_submission);
    const sourceImage = artwork.image.variants?.full ?? artwork.image;
    const extension =
      sourceImage.extension ??
      EXTENSIONS_BY_CONTENT_TYPE[sourceImage.content_type] ??
      submission?.image?.extension;
    if (!extension) {
      throw new Error(
        `Artwork ${artwork._id} does not have a recognized image extension.`,
      );
    }

    const source = sourceImage.storage;
    const sourceLocator =
      source.provider === "s3"
        ? `s3://${source.bucket}/${source.key}`
        : normalizePath(path.join("storage", "mock-s3", source.key));
    const originalSource = submission?.image?.sources?.[0];
    const originalFilename =
      originalSource?.upload_filename ??
      originalSource?.original_filename ??
      "";

    return [
      artwork._id,
      sourceLocator,
      originalFilename,
      extension,
      `${artwork._id}_full.${extension}`,
      `${artwork._id}_card.${extension}`,
      `${artwork._id}_thumb.${extension}`,
      artwork.artist,
      artwork.title,
    ].map(escapeField);
  });
  const header = [
    "artwork_id",
    "source_locator",
    "original_filename",
    "extension",
    "full_filename",
    "card_filename",
    "thumb_filename",
    "artist",
    "title",
  ];

  await writeFile(
    outputPath,
    [header, ...rows].map((row) => row.join("\t")).join("\n") + "\n",
    "utf8",
  );
  console.log(
    `Wrote ${rows.length} artwork entries to ${path.relative(process.cwd(), outputPath)}.`,
  );
} finally {
  await client.close();
}

function escapeField(value) {
  return String(value ?? "")
    .replaceAll("\t", " ")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ");
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}
