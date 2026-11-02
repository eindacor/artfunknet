import { NextResponse } from "next/server";
import { ArtistExperienceError } from "./contributing-artists.ts";
import { getDatabase } from "./mongodb.ts";
import { requirePlayerApi } from "./player-api";
import { getPublicBaseUrl } from "./public-url";
import type { ArtistRecord } from "./artist-types.ts";

export function artistOriginError(request: Request) {
  return request.headers.get("origin") !== new URL(getPublicBaseUrl(request)).origin
    ? NextResponse.json({ error: "Submit this form from artfunkel." }, { status: 403 })
    : null;
}

export async function requireArtistApi(request: Request) {
  const originError = artistOriginError(request);
  if (originError) return { ok: false as const, response: originError };
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth;
  const database = await getDatabase();
  const player = await database.collection<{ _id: string; artist_id?: string }>("players")
    .findOne({ _id: auth.session.playerId, active: true, account_deletion: { $ne: true } });
  const artist = player?.artist_id
    ? await database.collection<ArtistRecord>("artists").findOne({ _id: player.artist_id })
    : null;
  if (!artist) return { ok: false as const, response: NextResponse.json({ error: "An approved artist account is required." }, { status: 403 }) };
  return { ok: true as const, session: auth.session, artist, database };
}

export function artistErrorResponse(error: unknown) {
  if (error instanceof ArtistExperienceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Artist operation failed", error instanceof Error ? error.message : "unknown error");
  return NextResponse.json({ error: "The artist operation could not be completed. Please try again." }, { status: 500 });
}
