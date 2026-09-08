import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import {
  deleteArtworkImageRecord,
  publishArtworkUpload,
  type ArtworkImageRecord,
} from "@/server/artwork-storage";
import {
  ARTWORK_RARITIES,
  getSpecialAttributeCount,
  type ArtworkRarity,
} from "@/server/gameplay";
import { deriveArtworkLegendaryAttributeIds } from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import {
  createOperationId,
  logOperationalError,
  logOperationalInfo,
} from "@/server/operational-logging";

type ArtworkInput = {
  artist_id?: unknown;
  title?: unknown;
  date?: unknown;
  genre?: unknown;
  medium?: unknown;
  rarity?: unknown;
  value_scale?: unknown;
  height?: unknown;
  active?: unknown;
  nsfw?: unknown;
  special_attributes?: unknown;
};

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

  let input: ArtworkInput;
  try {
    input = JSON.parse(String(metadata)) as ArtworkInput;
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
  const [artist, activeAttributeCount] = await Promise.all([
    database
      .collection<{ _id: string; artist_name: string }>("artists")
      .findOne({ _id: validation.value.artist_id }),
    database
      .collection<{ _id: string; active: boolean }>("attributes")
      .countDocuments({
        _id: { $in: validation.value.special_attributes },
        active: true,
      }),
  ]);
  if (!artist || activeAttributeCount !== validation.value.special_attributes.length) {
    return NextResponse.json(
      { error: "The selected artist or attributes are unavailable." },
      { status: 400 },
    );
  }

  const artworkId = randomUUID().replaceAll("-", "").slice(0, 24);
  let image: ArtworkImageRecord | undefined;
  try {
    const uniqueAttributes = await deriveArtworkLegendaryAttributeIds(
      database,
      validation.value.special_attributes,
    );
    image = await publishArtworkUpload({ artworkId, file });
    const full = image.variants.full;
    const now = new Date();
    const artwork = {
      _id: artworkId,
      ...validation.value,
      artist: artist.artist_name,
      width: Number(
        (
          validation.value.height *
          (full.width / full.height)
        ).toFixed(2),
      ),
      image_width: full.width,
      image_height: full.height,
      unique_attributes: uniqueAttributes,
      image,
      market_data: {},
      created_at: now,
      created_by: auth.session.email,
    };
    await database.collection<typeof artwork>("artworks").insertOne(artwork);
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

function validateArtworkInput(
  input: ArtworkInput,
):
  | {
      ok: true;
      value: {
        artist_id: string;
        title: string;
        date: number;
        genre: string;
        medium: string;
        rarity: ArtworkRarity;
        value_scale: number;
        height: number;
        active: boolean;
        nsfw: boolean;
        special_attributes: string[];
      };
    }
  | { ok: false; error: string } {
  const artistId = typeof input.artist_id === "string" ? input.artist_id.trim() : "";
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const genre = typeof input.genre === "string" ? input.genre.trim() : "";
  const medium = typeof input.medium === "string" ? input.medium.trim() : "";
  const date = Number(input.date);
  const valueScale = Number(input.value_scale);
  const height = Number(input.height);
  const rarity = input.rarity as ArtworkRarity;
  const specialAttributes = Array.isArray(input.special_attributes)
    ? [...new Set(input.special_attributes.filter(
        (id): id is string => typeof id === "string",
      ))]
    : [];
  if (!artistId || !title || !genre || !medium) {
    return { ok: false, error: "Complete all required artwork fields." };
  }
  if (
    !Number.isFinite(date) ||
    !Number.isFinite(valueScale) ||
    valueScale < 0 ||
    valueScale > 1 ||
    !Number.isFinite(height) ||
    height <= 0 ||
    !ARTWORK_RARITIES.includes(rarity)
  ) {
    return {
      ok: false,
      error: "Provide valid artwork dimensions, value, date, and rarity.",
    };
  }
  const requiredAttributes = getSpecialAttributeCount(rarity);
  if (specialAttributes.length !== requiredAttributes) {
    return {
      ok: false,
      error: `${rarity} artwork requires ${requiredAttributes} special attribute${requiredAttributes === 1 ? "" : "s"}.`,
    };
  }
  return {
    ok: true,
    value: {
      artist_id: artistId,
      title,
      date,
      genre,
      medium,
      rarity,
      value_scale: valueScale,
      height,
      active: input.active !== false,
      nsfw: input.nsfw === true,
      special_attributes: specialAttributes,
    },
  };
}
