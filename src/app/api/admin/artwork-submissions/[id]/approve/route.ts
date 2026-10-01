import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import { readArtworkSource } from "@/server/artwork-files";
import { processArtworkImage } from "@/server/artwork-image-processing";
import {
  ArtworkStorageConfigurationError,
  deleteArtworkImageRecord,
  publishArtworkVariants,
  readArtworkObject,
  type ArtworkImageRecord,
  type ArtworkStorageReference,
} from "@/server/artwork-storage";
import {
  type ArtworkRarity,
} from "@/server/gameplay";
import { withLeastRepresentedArtworkEffect } from "@/server/artwork-effects";
import { getDatabase } from "@/server/mongodb";
import {
  createOperationId,
  logOperationalError,
  logOperationalInfo,
} from "@/server/operational-logging";

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
  height?: string | number;
  nsfw?: boolean;
};

type ValidatedArtwork = {
  artist_id: string;
  title: string;
  date: number;
  genre: string;
  medium: string;
  rarity: (typeof RARITIES)[number];
  height: number;
  nsfw: boolean;
};

type Submission = {
  _id: string;
  status: string;
  image: {
    extension: string;
    mime_type: string;
    storage?: ArtworkStorageReference;
    variants?: ArtworkImageRecord;
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
  const operationId = createOperationId("artwork-approval");
  let draft: ArtworkDraft;
  try {
    draft = (await request.json()) as ArtworkDraft;
  } catch (error) {
    logOperationalError("artwork_approval.request_parse_failed", error, {
      operationId,
      submissionId: id,
    });
    return NextResponse.json(
      { error: `The approval request is invalid. Reference: ${operationId}` },
      { status: 400 },
    );
  }
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

  const localSources = submission.image.sources.filter(
    (source): source is { source_path: string } =>
      typeof source.source_path === "string",
  );
  const artworkId = submission._id.slice(0, 24);
  let processedImage:
    | Awaited<ReturnType<typeof processArtworkImage>>
    | undefined;
  let publishedImage: ArtworkImageRecord | undefined = submission.image.variants;
  let publishedDuringApproval = false;
  let artworkCreated = false;
  try {
    if (!publishedImage) {
      let sourceImage: Buffer;
      try {
        sourceImage = submission.image.storage
          ? await readArtworkObject(submission.image.storage)
          : await readArtworkSource(localSources);
      } catch (error) {
        logOperationalError("artwork_approval.source_read_failed", error, {
          operationId,
          submissionId: id,
          storageProvider: submission.image.storage?.provider ?? "local",
        });
        return NextResponse.json(
          { error: "The source image could not be read." },
          { status: 422 },
        );
      }

      try {
        processedImage = await processArtworkImage({
          artworkId,
          extension: submission.image.extension,
          source: sourceImage,
        });
      } catch (error) {
        logOperationalError("artwork_approval.processing_failed", error, {
          artworkId,
          extension: submission.image.extension,
          operationId,
          sourceByteSize: sourceImage.byteLength,
          submissionId: id,
        });
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "The artwork image could not be processed.",
          },
          { status: 422 },
        );
      }
      publishedImage = await publishArtworkVariants({
        artworkId,
        variants: processedImage.variants,
      });
      publishedDuringApproval = true;
    }
    if (!publishedImage) {
      throw new Error("The artwork image variants are unavailable.");
    }
    const pixelDimensions = publishedImage.variants.full;
    const calculatedWidth = Number(
      (
        validation.value.height *
        (pixelDimensions.width / pixelDimensions.height)
      ).toFixed(2),
    );
    const now = new Date();
    const baseArtwork = {
      _id: artworkId,
      artist_id: artist._id,
      artist: artist.artist_name,
      title: validation.value.title,
      date: validation.value.date,
      genre: validation.value.genre,
      medium: validation.value.medium,
      rarity: validation.value.rarity,
      value_scale: Math.random(),
      height: validation.value.height,
      width: calculatedWidth,
      image_width: pixelDimensions.width,
      image_height: pixelDimensions.height,
      nsfw: validation.value.nsfw,
      active: true,
      image: publishedImage,
      market_data: {},
      created_at: now,
      created_from_submission: submission._id,
    };

    const insertArtwork = async (
      effect?: { _id: string; linked_attributes: readonly string[] },
    ) => {
      const specialAttributes =
        validation.value.rarity === "rare"
          ? (
              await database
                .collection<{ _id: string }>("attributes")
                .aggregate<{ _id: string }>([
                  { $match: { active: true } },
                  { $sample: { size: 1 } },
                ])
                .toArray()
            ).map((attribute) => attribute._id)
          : [];
      if (validation.value.rarity === "rare" && specialAttributes.length !== 1) {
        throw new Error("No active artwork attribute is available.");
      }
      const artwork = {
        ...baseArtwork,
        ...(effect ? { effect_id: effect._id } : {}),
        ...(specialAttributes.length
          ? { special_attributes: specialAttributes }
          : {}),
      };
      return database
        .collection<typeof artwork>("artworks")
        .updateOne({ _id: artworkId }, { $setOnInsert: artwork }, { upsert: true });
    };
    const artworkUpdate =
      validation.value.rarity === "legendary" ||
      validation.value.rarity === "masterpiece"
        ? await withLeastRepresentedArtworkEffect(
            database,
            validation.value.rarity,
            insertArtwork,
          )
        : await insertArtwork();
    artworkCreated = artworkUpdate.upsertedCount === 1;
    const submissionUpdate = await database
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
    if (submissionUpdate.modifiedCount !== 1) {
      throw new Error("The artwork submission approval could not be committed.");
    }
  } catch (error) {
    if (artworkCreated) {
      await database
        .collection<{ _id: string; created_from_submission: string }>(
          "artworks",
        )
        .deleteOne({ _id: artworkId, created_from_submission: submission._id })
        .catch((cleanupError) => {
          logOperationalError(
            "artwork_approval.database_rollback_failed",
            cleanupError,
            { artworkId, operationId, submissionId: id },
          );
        });
    }
    if (publishedImage && publishedDuringApproval) {
      await deleteArtworkImageRecord(publishedImage).catch((cleanupError) => {
        logOperationalError(
          "artwork_approval.storage_rollback_failed",
          cleanupError,
          { artworkId, operationId, submissionId: id },
        );
      });
    }
    logOperationalError("artwork_approval.commit_failed", error, {
      artworkCreated,
      artworkId,
      imagePublished: Boolean(publishedImage),
      operationId,
      submissionId: id,
    });
    if (error instanceof ArtworkStorageConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(
      {
        error: `The artwork could not be approved. Reference: ${operationId}`,
      },
      { status: 500 },
    );
  } finally {
    if (processedImage) {
      await processedImage.cleanup().catch((cleanupError) => {
        logOperationalError(
          "artwork_approval.temporary_cleanup_failed",
          cleanupError,
          { artworkId, operationId, submissionId: id },
        );
      });
    }
  }

  logOperationalInfo("artwork_approval.completed", {
    artworkId,
    operationId,
    submissionId: id,
  });
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
  const height = Number(draft.height);

  if (!artistId || !title || !genre || !medium) {
    return { ok: false, error: "Complete all required text fields." };
  }

  if (!RARITIES.includes(draft.rarity as (typeof RARITIES)[number])) {
    return { ok: false, error: "Select a valid rarity." };
  }
  const rarity = draft.rarity as ArtworkRarity;
  if (!Number.isFinite(date)) {
    return { ok: false, error: "Creation date must be numeric." };
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
      height,
      nsfw: draft.nsfw === true,
    },
  };
}
