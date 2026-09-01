import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import {
  getArtworkBufferDimensions,
  getArtworkPixelDimensions,
} from "@/server/artwork-files";
import {
  ArtworkStorageConfigurationError,
  publishArtwork,
  readArtworkObject,
  type ArtworkStorageReference,
} from "@/server/artwork-storage";
import {
  getSpecialAttributeCount,
  type ArtworkRarity,
} from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";

const RARITIES = [
  "common",
  "uncommon",
  "rare",
  "legendary",
  "masterpiece",
] as const;

type ArtworkDraft = {
  artist_id?: string;
  title?: string;
  date?: string | number;
  genre?: string;
  medium?: string;
  rarity?: string;
  value_scale?: string | number;
  height?: string | number;
  special_attribute_ids?: unknown;
  nsfw?: boolean;
};

type ValidatedArtwork = {
  artist_id: string;
  title: string;
  date: number;
  genre: string;
  medium: string;
  rarity: (typeof RARITIES)[number];
  value_scale: number;
  height: number;
  special_attribute_ids: string[];
  nsfw: boolean;
};

type Submission = {
  _id: string;
  status: string;
  image: {
    extension: string;
    mime_type: string;
    storage?: ArtworkStorageReference;
    sources: Array<{ source_path?: string }>;
  };
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const draft = (await request.json()) as ArtworkDraft;
  const validation = validateDraft(draft);

  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const submission = await database
    .collection<Submission>("artwork_submissions")
    .findOne({ _id: id });

  if (!submission || submission.status === "approved") {
    return NextResponse.json(
      { error: "Submission was not found or is already approved." },
      { status: 404 },
    );
  }

  const artist = await database
    .collection<{ _id: string; artist_name: string }>("artists")
    .findOne({ _id: validation.value.artist_id });

  if (!artist || typeof artist.artist_name !== "string") {
    return NextResponse.json(
      { error: "Select an existing artist before approval." },
      { status: 400 },
    );
  }

  const activeAttributeCount = await database
    .collection<{ _id: string; active: boolean }>("attributes")
    .countDocuments({
      _id: { $in: validation.value.special_attribute_ids },
      active: true,
    });
  if (activeAttributeCount !== validation.value.special_attribute_ids.length) {
    return NextResponse.json(
      { error: "Select only active artwork attributes." },
      { status: 400 },
    );
  }

  const localSources = submission.image.sources.filter(
    (source): source is { source_path: string } =>
      typeof source.source_path === "string",
  );
  let pixelDimensions: { width: number; height: number };
  try {
    pixelDimensions = submission.image.storage
      ? await getArtworkBufferDimensions(
          await readArtworkObject(submission.image.storage),
        )
      : await getArtworkPixelDimensions(localSources);
  } catch (error) {
    console.error("Unable to read artwork dimensions", error);
    return NextResponse.json(
      { error: "The source image dimensions could not be determined." },
      { status: 422 },
    );
  }

  const calculatedWidth = Number(
    (
      validation.value.height *
      (pixelDimensions.width / pixelDimensions.height)
    ).toFixed(2),
  );
  const artworkId = submission._id.slice(0, 24);
  let publishedImage: Awaited<ReturnType<typeof publishArtwork>>;
  try {
    publishedImage = await publishArtwork({
      artworkId,
      contentType: submission.image.mime_type,
      intakeStorage: submission.image.storage,
      localSources,
    });
  } catch (error) {
    if (error instanceof ArtworkStorageConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    throw error;
  }
  const now = new Date();
  const artwork = {
    _id: artworkId,
    artist_id: artist._id,
    artist: artist.artist_name,
    title: validation.value.title,
    date: validation.value.date,
    genre: validation.value.genre,
    medium: validation.value.medium,
    rarity: validation.value.rarity,
    value_scale: validation.value.value_scale,
    height: validation.value.height,
    width: calculatedWidth,
    image_width: pixelDimensions.width,
    image_height: pixelDimensions.height,
    nsfw: validation.value.nsfw,
    active: true,
    special_attributes: validation.value.special_attribute_ids,
    unique_attributes: [],
    image: {
      content_type: submission.image.mime_type,
      storage: publishedImage.storage,
    },
    market_data: {},
    created_at: now,
    created_from_submission: submission._id,
  };

  await database
    .collection<typeof artwork>("artworks")
    .updateOne({ _id: artworkId }, { $setOnInsert: artwork }, { upsert: true });
  await database
    .collection<Submission>("artwork_submissions")
    .updateOne(
      { _id: submission._id, status: { $ne: "approved" } },
      {
        $set: {
          status: "approved",
          draft: validation.value,
          "review.updated_at": now,
          "review.updated_by": auth.session.email,
          "review.approved_at": now,
          "review.approved_by": auth.session.email,
          "review.artwork_id": artworkId,
        },
      },
    );

  return NextResponse.json({ status: "ok", artwork_id: artworkId });
}

function validateDraft(
  draft: ArtworkDraft,
):
  | { ok: true; value: ValidatedArtwork }
  | { ok: false; error: string } {
  const artistId = draft.artist_id?.trim();
  const title = draft.title?.trim();
  const genre = draft.genre?.trim();
  const medium = draft.medium?.trim();
  const date = Number(draft.date);
  const valueScale = Number(draft.value_scale);
  const height = Number(draft.height);
  const specialAttributeIds = Array.isArray(draft.special_attribute_ids)
    ? [
        ...new Set(
          draft.special_attribute_ids.filter(
            (value): value is string => typeof value === "string",
          ),
        ),
      ]
    : [];

  if (!artistId || !title || !genre || !medium) {
    return { ok: false, error: "Complete all required text fields." };
  }

  if (!RARITIES.includes(draft.rarity as (typeof RARITIES)[number])) {
    return { ok: false, error: "Select a valid rarity." };
  }
  const rarity = draft.rarity as ArtworkRarity;
  const expectedSpecialAttributes = getSpecialAttributeCount(rarity);
  if (specialAttributeIds.length !== expectedSpecialAttributes) {
    return {
      ok: false,
      error: `${rarity} artwork requires ${expectedSpecialAttributes} special attribute${expectedSpecialAttributes === 1 ? "" : "s"}.`,
    };
  }

  if (!Number.isFinite(date)) {
    return { ok: false, error: "Creation date must be numeric." };
  }

  if (!Number.isFinite(valueScale) || valueScale < 0 || valueScale > 1) {
    return { ok: false, error: "Value scale must be between 0 and 1." };
  }

  if (!Number.isFinite(height) || height <= 0) {
    return { ok: false, error: "Height must be a positive number." };
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
      special_attribute_ids: specialAttributeIds,
      nsfw: draft.nsfw === true,
    },
  };
}
