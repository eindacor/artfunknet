import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import {
  deleteArtworkImageRecord,
  publishArtworkUpload,
  type ArtworkImageRecord,
} from "@/server/artwork-storage";
import { validateArtworkInput } from "@/server/artwork-create-input";
import { withLeastRepresentedArtworkEffect } from "@/server/artwork-effects";
import { getDatabase } from "@/server/mongodb";
import {
  createOperationId,
  logOperationalError,
  logOperationalInfo,
} from "@/server/operational-logging";
import { withLeastRepresentedRareSpecialAttribute } from "@/server/rare-special-attributes";

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const operationId = createOperationId("artwork-create");
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    logOperationalError("artwork_create.form_parse_failed", error, {
      operationId,
    });
    return NextResponse.json(
      { error: `The artwork form could not be read. Reference: ${operationId}` },
      { status: 400 },
    );
  }
  const file = formData.get("image");
  const metadata = formData.get("metadata");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Select an image to upload." }, { status: 400 });
  }

  let input: unknown;
  try {
    input = JSON.parse(String(metadata));
  } catch {
    return NextResponse.json(
      { error: "The artwork metadata is invalid." },
      { status: 400 },
    );
  }
  const validation = validateArtworkInput(input);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const database = await getDatabase();
  const artist = await
    database
      .collection<{ _id: string; artist_name: string }>("artists")
      .findOne({ _id: validation.value.artist_id });
  if (!artist) {
    return NextResponse.json(
      { error: "The selected artist is unavailable." },
      { status: 400 },
    );
  }

  const artworkId = randomUUID().replaceAll("-", "").slice(0, 24);
  let image: ArtworkImageRecord | undefined;
  try {
    image = await publishArtworkUpload({ artworkId, file });
    const full = image.variants.full;
    const now = new Date();
    const baseArtwork = {
      _id: artworkId,
      serial_counter: 0,
      ...validation.value,
      value_scale: Math.random(),
      artist: artist.artist_name,
      width: Number(
        (
          validation.value.height *
          (full.width / full.height)
        ).toFixed(2),
      ),
      image_width: full.width,
      image_height: full.height,
      image,
      market_data: {},
      created_at: now,
      created_by: auth.session.email,
    };
    const insertArtwork = async (
      effect?: { _id: string; linked_attributes: readonly string[] },
      rareSpecialAttributeId?: string,
    ) => {
      const artwork = {
        ...baseArtwork,
        ...(effect ? { effect_id: effect._id } : {}),
        ...(rareSpecialAttributeId
          ? { special_attributes: [rareSpecialAttributeId] }
          : {}),
      };
      await database.collection<typeof artwork>("artworks").insertOne(artwork);
      return artwork;
    };
    const artwork =
      validation.value.rarity === "legendary" ||
      validation.value.rarity === "masterpiece"
        ? await withLeastRepresentedArtworkEffect(
            database,
            validation.value.rarity,
            insertArtwork,
          )
        : validation.value.rarity === "rare"
          ? await withLeastRepresentedRareSpecialAttribute(
              database,
              (attribute) => insertArtwork(undefined, attribute._id),
            )
        : await insertArtwork();
    logOperationalInfo("artwork_create.completed", {
      artworkId,
      operationId,
    });
    return NextResponse.json(
      { artwork, message: `Added ${artwork.title} to the catalog.` },
      { status: 201 },
    );
  } catch (error) {
    if (image) {
      await deleteArtworkImageRecord(image).catch((cleanupError) => {
        logOperationalError("artwork_create.image_cleanup_failed", cleanupError, {
          artworkId,
          operationId,
        });
      });
    }
    logOperationalError("artwork_create.failed", error, {
      artworkId,
      byteSize: file.size,
      contentType: file.type || "unknown",
      operationId,
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `${error.message} Reference: ${operationId}`
            : `The artwork could not be created. Reference: ${operationId}`,
      },
      { status: 400 },
    );
  }
}
