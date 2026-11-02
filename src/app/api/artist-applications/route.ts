import { NextResponse } from "next/server";
import { artistErrorResponse, artistOriginError } from "@/server/artist-api";
import { submitArtistApplication } from "@/server/contributing-artists";
import { getDatabase } from "@/server/mongodb";
import { getPlayerSession } from "@/server/session";

export async function POST(request: Request) {
  const originError = artistOriginError(request);
  if (originError) return originError;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return NextResponse.json({ error: "The application form is invalid." }, { status: 400 });
  }
  try {
    const session = await getPlayerSession();
    const id = await submitArtistApplication(await getDatabase(), body, session?.playerId);
    return NextResponse.json({ id, message: "Your artist application is awaiting admin review." }, { status: 201 });
  } catch (error) {
    return artistErrorResponse(error);
  }
}
