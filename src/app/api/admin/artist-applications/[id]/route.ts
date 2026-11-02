import { NextResponse } from "next/server";
import { requireAdminApi } from "@/server/admin-api";
import { artistErrorResponse, artistOriginError } from "@/server/artist-api";
import { approveArtistApplication } from "@/server/contributing-artists";
import { getDatabase } from "@/server/mongodb";
import type { ArtistApplication } from "@/server/artist-types";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const originError = artistOriginError(request);
  if (originError) return originError;
  let action: unknown;
  try { action = (await request.json()).action; } catch {
    return NextResponse.json({ error: "The review action is invalid." }, { status: 400 });
  }
  const { id } = await params;
  const database = await getDatabase();
  try {
    if (action === "approve") {
      await approveArtistApplication(database, id, auth.session.email);
    } else if (action === "deny") {
      const removed = await database.collection<ArtistApplication>("artist_applications").deleteOne({ _id: id, status: "pending" });
      if (!removed.deletedCount) return NextResponse.json({ error: "The application is unavailable or is being approved." }, { status: 409 });
    } else {
      return NextResponse.json({ error: "Choose approve or deny." }, { status: 400 });
    }
    return NextResponse.json({ status: "ok" });
  } catch (error) { return artistErrorResponse(error); }
}
