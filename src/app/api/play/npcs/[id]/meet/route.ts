import { NextResponse } from "next/server";

import {
  NPC_QUALITIES,
  type GalleryNpc,
  type NpcQuality,
} from "@/server/npc-gameplay";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

const NPC_MEETING_LIMITS: Record<NpcQuality, number> = {
  bronze: 120,
  silver: 100,
  gold: 80,
  platinum: 60,
};

type Player = {
  _id: string;
  active: boolean;
  profile: {
    npcs_met?: Partial<Record<NpcQuality, number>>;
  };
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const database = await getDatabase();
  const now = new Date();
  const [player, npc] = await Promise.all([
    database
      .collection<Player>("players")
      .findOne({ _id: auth.session.playerId, active: true }),
    database
      .collection<GalleryNpc>("npcs")
      .findOne({ _id: id, expiration: { $gt: now } }),
  ]);
  if (!player || !npc || !NPC_QUALITIES.includes(npc.quality)) {
    return NextResponse.json(
      { error: "This visitor is no longer available." },
      { status: 404 },
    );
  }

  const meetings = player.profile.npcs_met?.[npc.quality] ?? 0;
  if (meetings >= NPC_MEETING_LIMITS[npc.quality]) {
    return NextResponse.json(
      { error: `${npc.quality} visitor limit reached.` },
      { status: 409 },
    );
  }

  const result = await database.collection<GalleryNpc>("npcs").updateOne(
    {
      _id: npc._id,
      expiration: { $gt: now },
      players_met: { $ne: player._id },
    },
    { $addToSet: { players_met: player._id } },
  );
  if (result.modifiedCount !== 1) {
    return NextResponse.json(
      { error: "You have already met this visitor." },
      { status: 409 },
    );
  }

  await database.collection<Player>("players").updateOne(
    { _id: player._id },
    {
      $inc: { [`profile.npcs_met.${npc.quality}`]: 1 },
      $set: { "profile.last_activity": now.toISOString() },
    },
  );

  // TODO AI: When the Art Expert roll-count reduction interaction is ported,
  // its legendary bonus should also reroll one random attribute for free.
  return NextResponse.json({
    status: "ok",
    message: `You met ${npc.npc_name}. Their full interaction will be added as NPC rewards are ported.`,
  });
}
