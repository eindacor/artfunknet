import { NextResponse } from "next/server";

import {
  ARTWORK_DETAIL_IMAGE_COUNT,
  isValidArtworkDetailImageAdjustment,
  roundArtworkDetailImageAdjustments,
} from "@/components/item-cards/artwork-image-adjustments";
import { requireAdminApi } from "@/server/admin-api";
import type {
  Artwork,
  ArtworkDetailImageAdjustments,
} from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";

type UpdateRequest = {
  adjustments?: unknown;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = (await request.json()) as UpdateRequest;
  if (
    !Array.isArray(body.adjustments) ||
    body.adjustments.length > ARTWORK_DETAIL_IMAGE_COUNT ||
    !body.adjustments.every(isValidArtworkDetailImageAdjustment) ||
    new Set(body.adjustments.map((adjustment) => adjustment.slot)).size !==
      body.adjustments.length
  ) {
    return NextResponse.json(
      { error: "Provide up to four unique artwork detail adjustments." },
      { status: 400 },
    );
  }

  const adjustments = roundArtworkDetailImageAdjustments(
    body.adjustments as ArtworkDetailImageAdjustments,
  );
  const database = await getDatabase();
  const now = new Date();
  const result = await database.collection<Artwork>("artworks").updateOne(
    { _id: id },
    {
      $set: {
        detail_image_adjustments: adjustments,
        updated_at: now,
        updated_by: auth.session.email,
      },
    },
  );
  if (result.matchedCount !== 1) {
    return NextResponse.json({ error: "Artwork not found." }, { status: 404 });
  }

  return NextResponse.json({
    status: "ok",
    artworkId: id,
    adjustments,
  });
}
