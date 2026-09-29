import { NextResponse } from "next/server";

import { getGameplaySettings } from "@/server/game-settings";
import { getDatabase } from "@/server/mongodb";
import { getGalleryNpcs, refreshNpcSpawns } from "@/server/npc-gameplay";
import { requirePlayerApi } from "@/server/player-api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { playerId } = await params;
  const database = await getDatabase();
  const settings = await getGameplaySettings(database);
  const now = new Date();
  await refreshNpcSpawns(
    database,
    now,
    settings.active.npcSpawnIntervalMinutes,
    playerId,
  );
  const visitors = await getGalleryNpcs(database, playerId, now);

  return NextResponse.json(
    {
      visitors: visitors.map((visitor) => ({
        _id: visitor._id,
        quality: visitor.quality,
        attribute_id: visitor.attribute_id,
        owner_id: visitor.owner_id,
        owner_name: visitor.owner_name,
        spawned_at: visitor.spawned_at.toISOString(),
        expiration: visitor.expiration.toISOString(),
        icon: visitor.icon,
        npc_name: visitor.npc_name,
        proc_chance: visitor.proc_chance,
        alreadyMet: visitor.players_met.includes(auth.session.playerId),
      })),
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
