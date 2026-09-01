import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import { readArtworkSource } from "@/server/artwork-files";
import {
  readArtworkObject,
  type ArtworkStorageReference,
} from "@/server/artwork-storage";
import { getDatabase } from "@/server/mongodb";

type Submission = {
  _id: string;
  image: {
    mime_type: string;
    storage?: ArtworkStorageReference;
    sources: Array<{ source_path?: string }>;
  };
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const database = await getDatabase();
  const submission = await database
    .collection<Submission>("artwork_submissions")
    .findOne({ _id: id });

  if (!submission) {
    return NextResponse.json(
      { error: "Artwork submission was not found." },
      { status: 404 },
    );
  }

  try {
    const localSources = submission.image.sources.filter(
      (source): source is { source_path: string } =>
        typeof source.source_path === "string",
    );
    const image = submission.image.storage
      ? await readArtworkObject(submission.image.storage)
      : await readArtworkSource(localSources);

    return new NextResponse(new Uint8Array(image), {
      headers: {
        "content-type": submission.image.mime_type,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Unable to load artwork source", error);
    return NextResponse.json(
      { error: "The source image is unavailable." },
      { status: 404 },
    );
  }
}
