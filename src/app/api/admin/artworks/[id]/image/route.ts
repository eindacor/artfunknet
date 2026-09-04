import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import { processArtworkImage } from "@/server/artwork-image-processing";
import {
  publishArtworkVariants,
  readArtworkUpload,
  verifyArtworkStorageConnection,
} from "@/server/artwork-storage";
import { getDatabase } from "@/server/mongodb";

type ArtworkDocument = {
  _id: string;
  title: string;
  [key: string]: unknown;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const formData = await request.formData();
  const file = formData.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Select an image to upload." }, { status: 400 });
  }

  const database = await getDatabase();
  const artwork = await database
    .collection<ArtworkDocument>("artworks")
    .findOne({ _id: id });
  if (!artwork) {
    return NextResponse.json({ error: "Artwork not found." }, { status: 404 });
  }

  try {
    await verifyArtworkStorageConnection();
    const upload = await readArtworkUpload(file);
    const processed = await processArtworkImage({
      artworkId: id,
      extension: upload.extension,
      source: upload.bytes,
    });
    let updated: ArtworkDocument;
    try {
      const published = await publishArtworkVariants({
        artworkId: id,
        variants: processed.variants,
      });
      const full = processed.variants.full;
      updated = {
        ...artwork,
        image: published,
        image_width: full.width,
        image_height: full.height,
        updated_at: new Date(),
        updated_by: auth.session.email,
      };
      const result = await database
        .collection<ArtworkDocument>("artworks")
        .replaceOne({ _id: id }, updated);
      if (result.modifiedCount !== 1) {
        throw new Error("The artwork image metadata could not be updated.");
      }
    } finally {
      await processed.cleanup();
    }

    return NextResponse.json({
      artwork: {
        ...updated,
        _id: id,
      },
      message: `Updated the image for ${artwork.title}.`,
    });
  } catch (error) {
    console.error("Unable to upload catalog artwork image", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image upload failed." },
      { status: 400 },
    );
  }
}
