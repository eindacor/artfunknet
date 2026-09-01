import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getGameplaySettings } from "@/server/game-settings";
import type { ItemAttribute } from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";
import {
  NPC_QUALITIES,
  type GalleryNpc,
  type NpcQuality,
} from "@/server/npc-gameplay";
import { getAdminSession, getPlayerSession } from "@/server/session";

type SpawnNpcRequest = {
  attributeId?: unknown;
  quality?: unknown;
};

type TestPlayer = {
  _id: string;
  screen_name: string;
  active: boolean;
  test_account: boolean;
};

type AdminSpawnedNpc = GalleryNpc & {
  admin_spawned: true;
  spawned_by: string;
  spawn_key: string;
};

export async function POST(request: Request) {
  const [admin, playerSession] = await Promise.all([
    getAdminSession(),
    getPlayerSession(),
  ]);
  if (!admin || !playerSession) {
    return NextResponse.json(
      { error: "Active administrator impersonation is required." },
      { status: 401 },
    );
  }

  const body = (await request.json()) as SpawnNpcRequest;
  if (
    typeof body.attributeId !== "string" ||
    body.attributeId.length === 0 ||
    typeof body.quality !== "string" ||
    !NPC_QUALITIES.includes(body.quality as NpcQuality)
  ) {
    return NextResponse.json(
      { error: "A valid NPC type and quality are required." },
      { status: 400 },
    );
  }
  const quality = body.quality as NpcQuality;

  const database = await getDatabase();
  const [player, attribute, settings] = await Promise.all([
    database.collection<TestPlayer>("players").findOne({
      _id: playerSession.playerId,
      active: true,
      test_account: true,
    }),
    database
      .collection<ItemAttribute>("attributes")
      .findOne({ _id: body.attributeId, active: true }),
    getGameplaySettings(database),
  ]);
  if (!player) {
    return NextResponse.json(
      { error: "The active player is not an available test account." },
      { status: 403 },
    );
  }
  if (!attribute) {
    return NextResponse.json(
      { error: "The selected NPC type is not available." },
      { status: 404 },
    );
  }

  const now = new Date();
  const expiration = new Date(
    now.getTime() + settings.active.npcSpawnIntervalMinutes * 60 * 1000,
  );
  const npc: AdminSpawnedNpc = {
    _id: randomUUID(),
    quality,
    attribute_id: attribute._id,
    owner_id: player._id,
    owner_name: player.screen_name,
    spawned_at: now,
    expiration,
    players_met: [],
    icon: attribute.icon,
    npc_name: attribute.npc_name,
    proc_chance: 1,
    admin_spawned: true,
    spawned_by: admin.email,
    spawn_key: `admin:${player._id}:${randomUUID()}`,
  };
  await database.collection<AdminSpawnedNpc>("npcs").insertOne(npc);

  return NextResponse.json({
    status: "ok",
    message: `Spawned a ${quality} ${attribute.npc_name} visitor.`,
  });
}
