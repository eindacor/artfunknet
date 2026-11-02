import { NextResponse } from "next/server";
import { requireArtistApi, artistErrorResponse } from "@/server/artist-api";
import { validateArtistProfile } from "@/server/contributing-artists";
import type { ArtistRecord } from "@/server/artist-types";

export async function PATCH(request: Request) {
  const auth = await requireArtistApi(request);
  if (!auth.ok) return auth.response;
  let input: Record<string, unknown>;
  try {
    input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
  } catch { return NextResponse.json({ error: "The artist profile form is invalid." }, { status: 400 }); }
  try {
    const value = validateArtistProfile(input);
    await auth.database.collection<ArtistRecord>("artists").updateOne({ _id: auth.artist._id }, { $set: value });
    return NextResponse.json({ status: "ok" });
  } catch (error) { return artistErrorResponse(error); }
}
