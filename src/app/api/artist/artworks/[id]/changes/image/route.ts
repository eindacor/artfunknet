import { NextResponse } from "next/server";
import { requireArtistApi } from "@/server/artist-api";
import type { ArtworkChangeRequest } from "@/server/artist-artwork-changes";
import { readArtworkObject } from "@/server/artwork-storage";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireArtistApi(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const change = await auth.database.collection<ArtworkChangeRequest>("artwork_change_requests")
    .findOne({ artwork_id: id, artist_id: auth.artist._id });
  const image = change?.image?.variants.card;
  if (!image) return NextResponse.json({ error: "Proposed image not found." }, { status: 404 });
  try {
    return new NextResponse(new Uint8Array(await readArtworkObject(image.storage)), {
      headers: { "content-type": image.content_type, "cache-control": "private, no-store", vary: "Cookie" },
    });
  } catch {
    return NextResponse.json({ error: "Proposed image could not be loaded." }, { status: 404 });
  }
}
