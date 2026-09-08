import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import {
  deleteArtworkImageRecord,
  getArtworkImageStorageKeys,
  publishArtworkUpload,
  type ArtworkImageRecord,
  type LegacyArtworkImageRecord,
} from "@/server/artwork-storage";
import { getDatabase } from "@/server/mongodb";
import {
  createOperationId,
  logOperationalError,
  logOperationalInfo,
} from "@/server/operational-logging";

type ArtworkDocument = {
  _id: string;
  title: string;
  image?: ArtworkImageRecord | LegacyArtworkImageRecord;
  [key: string]: unknown;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const operationId = createOperationId("artwork-image-replacement");
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    logOperationalError("artwork_image.form_parse_failed", error, {
      artworkId: id,
      operationId,
    });
    return NextResponse.json(
      { error: `The upload form could not be read. Reference: ${operationId}` },
      { status: 400 },
    );
  }
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
    let updated: ArtworkDocument;
    let published: ArtworkImageRecord | undefined;
    try {
      published = await publishArtworkUpload({
        artworkId: id,
        file,
      });
      const full = published.variants.full;
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
    } catch (error) {
      if (published) {
        await deleteArtworkImageRecord(published).catch((cleanupError) => {
          logOperationalError(
            "artwork_image.new_variant_cleanup_failed",
            cleanupError,
            { artworkId: id, operationId },
          );
        });
      }
      throw error;
    }

    if (artwork.image && published) {
      await deleteArtworkImageRecord(
        artwork.image,
        getArtworkImageStorageKeys(published),
      ).catch((cleanupError) => {
        logOperationalError(
          "artwork_image.old_variant_cleanup_failed",
          cleanupError,
          { artworkId: id, operationId },
        );
      });
    }
    logOperationalInfo("artwork_image.replaced", {
      artworkId: id,
      fullHeight: updated.image_height as number,
      fullWidth: updated.image_width as number,
      operationId,
    });
    return NextResponse.json({
      artwork: {
        ...updated,
        _id: id,
      },
      message: `Updated the image for ${artwork.title}.`,
    });
  } catch (error) {
    logOperationalError("artwork_image.replacement_failed", error, {
      artworkId: id,
      byteSize: file.size,
      contentType: file.type || "unknown",
      operationId,
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `${error.message} Reference: ${operationId}`
            : `Image upload failed. Reference: ${operationId}`,
      },
      { status: 400 },
    );
  }
}
