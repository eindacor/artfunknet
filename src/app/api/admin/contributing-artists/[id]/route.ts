import { NextResponse } from "next/server";
import { requireAdminApi } from "@/server/admin-api";
import { artistErrorResponse, artistOriginError } from "@/server/artist-api";
import { setArtistFeatured } from "@/server/contributing-artists";
import { getDatabase } from "@/server/mongodb";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const originError = artistOriginError(request);
  if (originError) return originError;
  let featured: unknown;
  try { featured = (await request.json()).featured; } catch {
    return NextResponse.json({ error: "The featured setting is invalid." }, { status: 400 });
  }
  if (typeof featured !== "boolean") return NextResponse.json({ error: "Choose a featured setting." }, { status: 400 });
  try {
    await setArtistFeatured(await getDatabase(), (await params).id, featured);
    return NextResponse.json({ status: "ok" });
  } catch (error) { return artistErrorResponse(error); }
}
