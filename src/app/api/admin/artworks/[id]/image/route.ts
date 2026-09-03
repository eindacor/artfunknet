import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import {
  uploadArtworkIntake,
  publishArtwork,
} from "@/server/artwork-storage";
import { getArtworkBufferDimensions } from "@/server/artwork-files";
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
    const upload = await uploadArtworkIntake(file);
    const dimensions = await getArtworkBufferDimensions(
      Buffer.from(await file.arrayBuffer()),
    );
    const published = await publishArtwork({
      artworkId: id,
      contentType: upload.mimeType,
      intakeStorage: upload.storage,
      localSources: [],
    });
    const updated = {
      ...artwork,
      image: {
        content_type: upload.mimeType,
        storage: published.storage,
      },
      image_width: dimensions.width,
      image_height: dimensions.height,
      updated_at: new Date(),
      updated_by: auth.session.email,
    };
    await database
      .collection<ArtworkDocument>("artworks")
      .replaceOne({ _id: id }, updated);

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
