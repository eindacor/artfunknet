import { requireArtistApi } from "@/server/artist-api";
import { artworkPreviewResponse } from "@/server/artwork-preview";

export async function POST(request: Request) {
  const auth = await requireArtistApi(request);
  if (!auth.ok) return auth.response;
  return artworkPreviewResponse(request);
}
