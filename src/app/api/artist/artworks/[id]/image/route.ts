import { NextResponse } from "next/server";
import { requireArtistApi } from "@/server/artist-api";
import { readArtworkObject, type ArtworkImageRecord, type LegacyArtworkImageRecord } from "@/server/artwork-storage";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireArtistApi(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const artwork = await auth.database.collection<{
    _id: string; artist_id: string; image?: ArtworkImageRecord | LegacyArtworkImageRecord;
  }>("artworks").findOne({ _id: id, artist_id: auth.artist._id });
  const image = artwork?.image;
  const variant = image && ("variants" in image ? image.variants.card : image);
  if (!variant) return NextResponse.json({ error: "Artwork image not found." }, { status: 404 });
  try {
    return new NextResponse(new Uint8Array(await readArtworkObject(variant.storage)), {
      headers: { "content-type": variant.content_type, "cache-control": "private, no-store", vary: "Cookie" },
    });
  } catch {
    return NextResponse.json({ error: "Artwork image could not be loaded." }, { status: 404 });
  }
}
