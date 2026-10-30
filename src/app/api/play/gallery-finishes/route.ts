import { NextResponse } from "next/server";

import { parseGalleryFinishUpdate } from "@/server/gallery-finishes";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import { savePlayerGalleryFinishes } from "@/server/player-gallery-finishes";

export async function PATCH(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const body: unknown = await request.json().catch(() => null);
  const update = parseGalleryFinishUpdate(body);
  if (!update) {
    return NextResponse.json(
      {
        error: "Provide a gallery ID and all six finish colors as RGB arrays with three numbers between 0 and 1.",
      },
      { status: 400 },
    );
  }

  const saved = await savePlayerGalleryFinishes(
    await getDatabase(),
    auth.session.playerId,
    update.galleryId,
    update.finishes,
  );
  if (!saved) {
    return NextResponse.json(
      { error: "This gallery is unavailable or does not belong to you." },
      { status: 404 },
    );
  }
  return NextResponse.json(update);
}
