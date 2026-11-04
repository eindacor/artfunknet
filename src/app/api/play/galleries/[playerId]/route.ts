import { NextResponse } from "next/server";

import { getGalleryExhibition } from "@/server/gallery-exhibition";
import { getDatabase } from "@/server/mongodb";
import { getGalleryNpcs } from "@/server/npc-gameplay";
import { requirePlayerApi } from "@/server/player-api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { playerId } = await params;
  const database = await getDatabase();
  const gallery = await getGalleryExhibition(database, playerId, auth.session.playerId);
  if (!gallery) {
    return NextResponse.json({ error: "This gallery is unavailable." }, { status: 404 });
  }
  const npcs = await getGalleryNpcs(database, playerId, new Date(), auth.session.playerId);
  return NextResponse.json({
    ...gallery,
    npcs: npcs.map(npc => ({ ...npc, alreadyMet: npc.players_met.includes(auth.session.playerId) })),
  });
}
