import { NextResponse } from "next/server";

import {
  ARTWORK_IMAGE_SCALE_MAX,
  ARTWORK_IMAGE_SCALE_MIN,
  ARTWORK_IMAGE_TRANSLATION_MAX,
  ARTWORK_IMAGE_TRANSLATION_MIN,
  roundArtworkImageAdjustment,
} from "@/components/item-cards/artwork-image-adjustments";
import { isCardRendererId } from "@/components/item-cards/selection";
import { requireAdminApi } from "@/server/admin-api";
import type { Artwork } from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";

type UpdateRequest = {
  rendererId?: unknown;
  adjustment?: {
    x?: unknown;
    y?: unknown;
    scale?: unknown;
  };
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = (await request.json()) as UpdateRequest;
  const rendererId =
    typeof body.rendererId === "string" ? body.rendererId : undefined;
  const x = Number(body.adjustment?.x);
  const y = Number(body.adjustment?.y);
  const scale = Number(body.adjustment?.scale);

  if (
    !isCardRendererId(rendererId) ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(scale) ||
    x < ARTWORK_IMAGE_TRANSLATION_MIN ||
    x > ARTWORK_IMAGE_TRANSLATION_MAX ||
    y < ARTWORK_IMAGE_TRANSLATION_MIN ||
    y > ARTWORK_IMAGE_TRANSLATION_MAX ||
    scale < ARTWORK_IMAGE_SCALE_MIN ||
    scale > ARTWORK_IMAGE_SCALE_MAX
  ) {
    return NextResponse.json(
      { error: "The art style image adjustment is invalid." },
      { status: 400 },
    );
  }

  const adjustment = roundArtworkImageAdjustment({ x, y, scale });
  const database = await getDatabase();
  const now = new Date();
  const result = await database.collection<Artwork>("artworks").updateOne(
    { _id: id },
    {
      $set: {
        [`art_style_adjustments.${rendererId}`]: adjustment,
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
    rendererId,
    adjustment,
  });
}
