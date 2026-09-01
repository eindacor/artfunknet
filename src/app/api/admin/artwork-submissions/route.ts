import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import {
  ArtworkStorageConfigurationError,
  ArtworkUploadError,
  uploadArtworkIntake,
  type ArtworkStorageReference,
} from "@/server/artwork-storage";
import { getDatabase } from "@/server/mongodb";

type Submission = {
  _id: string;
  status: string;
  draft: Record<string, unknown>;
  image: {
    extension: string;
    mime_type: string;
    byte_size: number;
    sha256: string;
    storage?: ArtworkStorageReference;
    sources: Array<{
      original_filename: string;
      source_path?: string;
      relative_path?: string;
      upload_filename?: string;
    }>;
  };
  review: {
    imported_at: Date;
    updated_at: Date;
    imported_by: string;
  };
};

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  const formData = await request.formData();
  const file = formData.get("image");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Select an image to upload." },
      { status: 400 },
    );
  }

  try {
    const upload = await uploadArtworkIntake(file);
    const database = await getDatabase();
    const collection =
      database.collection<Submission>("artwork_submissions");
    const now = new Date();
    const submission: Submission = {
      _id: upload.digest,
      status: "unverified",
      image: {
        extension: upload.extension,
        mime_type: upload.mimeType,
        byte_size: upload.byteSize,
        sha256: upload.digest,
        storage: upload.storage,
        sources: [
          {
            original_filename: upload.originalFilename,
            upload_filename: upload.originalFilename,
          },
        ],
      },
      draft: {},
      review: {
        imported_at: now,
        updated_at: now,
        imported_by: auth.session.email,
      },
    };

    const existing = await collection.findOne({ _id: upload.digest });
    if (existing?.status === "approved") {
      return NextResponse.json(
        { error: "This image has already been approved." },
        { status: 409 },
      );
    }

    await collection.updateOne(
      { _id: upload.digest },
      { $setOnInsert: submission },
      { upsert: true },
    );
    await collection.updateOne(
      { _id: upload.digest },
      {
        $set: {
          "image.storage": upload.storage,
        },
        $addToSet: {
          "image.sources": {
            original_filename: upload.originalFilename,
            upload_filename: upload.originalFilename,
          },
        },
      },
    );

    const stored = await collection.findOne({ _id: upload.digest });
    if (!stored) {
      throw new Error("The uploaded submission could not be loaded.");
    }

    return NextResponse.json(
      {
        submission: {
          id: stored._id,
          status: stored.status,
          draft: stored.draft ?? {},
          importedAt: stored.review.imported_at.toISOString(),
          sources: stored.image.sources.map((source) => ({
            filename: source.original_filename,
            path:
              source.relative_path ??
              `S3: ${stored.image.storage?.key ?? "artwork intake"}`,
          })),
        },
      },
      { status: existing ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof ArtworkUploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof ArtworkStorageConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    throw error;
  }
}
