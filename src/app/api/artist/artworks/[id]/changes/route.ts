import { NextResponse } from "next/server";
import { artistErrorResponse, requireArtistApi } from "@/server/artist-api";
import { ArtistExperienceError } from "@/server/contributing-artists";
import { submitArtworkChange } from "@/server/artist-artwork-changes";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireArtistApi(request);
  if (!auth.ok) return auth.response;
  try {
    const form = await request.formData();
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(String(form.get("metadata")));
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
    } catch { throw new ArtistExperienceError("The artwork metadata is invalid."); }
    const file = form.get("image");
    if (file !== null && !(file instanceof File)) throw new ArtistExperienceError("Select an image to upload.");
    const { id } = await params;
    const change = await submitArtworkChange(auth.database, id, auth.artist._id, auth.session.playerId, input, file);
    return NextResponse.json({ change: { id: change._id, metadata: change.metadata } }, { status: 201 });
  } catch (error) { return artistErrorResponse(error); }
}
