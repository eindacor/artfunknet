import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getGameplaySettings } from "@/server/game-settings";
import { serializeGameClientItem } from "@/server/game-client-item";
import type { GameItem, ItemAttribute } from "@/server/gameplay";
import { getUnexpiredItemFilter } from "@/server/item-expiration";
import { hydrateGameItems } from "@/server/item-artwork";
import { ART_DONOR_ATTRIBUTE_ID } from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import {
  getGalleryNpcs,
  refreshNpcSpawns,
  type GalleryNpc,
} from "@/server/npc-gameplay";
import { requirePlayerApi } from "@/server/player-api";

type BootstrapPlayer = {
  _id: string;
  screen_name: string;
  active: boolean;
  test_account: boolean;
};

type DemoDonor = GalleryNpc & {
  demo_spawned: true;
  spawn_key: string;
};

export async function GET(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const database = await getDatabase();
  const player = await database
    .collection<BootstrapPlayer>("players")
    .findOne(
      { _id: auth.session.playerId, active: true },
      { projection: { _id: 1, screen_name: 1, test_account: 1 } },
    );
  if (!player) {
    return NextResponse.json(
      { error: "This account has been de-activated." },
      { status: 403 },
    );
  }

  const settings = await getGameplaySettings(database);
  const now = new Date();
  await refreshNpcSpawns(
    database,
    now,
    settings.active.npcSpawnIntervalMinutes,
    player._id,
  );
  let donorVisitor = (await getGalleryNpcs(database, player._id, now)).find(
    (visitor) =>
      visitor.attribute_id === ART_DONOR_ATTRIBUTE_ID &&
      !visitor.players_met.includes(player._id),
  );

  const ensureDemoDonor =
    new URL(request.url).searchParams.get("ensureDemoDonor") === "1";
  if (
    !donorVisitor &&
    ensureDemoDonor &&
    (process.env.NODE_ENV !== "production" || player.test_account)
  ) {
    try {
      const demoDonor = await createDemoDonor(
        database,
        player,
        now,
        settings.active.npcSpawnIntervalMinutes,
      );
      await database.collection<DemoDonor>("npcs").insertOne(demoDonor);
      donorVisitor = demoDonor;
    } catch (error) {
      console.error("Unable to create the Unreal demo donor", error);
      return NextResponse.json(
        { error: "The demo donor could not be created." },
        { status: 500 },
      );
    }
  }

  const rawUnclaimedItems = await database
    .collection<GameItem>("items")
    .find({
      owner: player._id,
      status: { $in: ["unclaimed", "won"] },
      ...getUnexpiredItemFilter(now),
    })
    .sort({ date_created: -1 })
    .limit(20)
    .toArray();
  const unclaimedItems = await hydrateGameItems(database, rawUnclaimedItems);

  return NextResponse.json(
    {
      player: {
        id: player._id,
        screenName: player.screen_name,
      },
      donorVisitor: donorVisitor
        ? {
            id: donorVisitor._id,
            name: donorVisitor.npc_name,
            quality: donorVisitor.quality,
            ownerId: donorVisitor.owner_id,
            ownerName: donorVisitor.owner_name,
          }
        : null,
      unclaimedItems: unclaimedItems.map(serializeGameClientItem),
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}

async function createDemoDonor(
  database: Awaited<ReturnType<typeof getDatabase>>,
  player: BootstrapPlayer,
  now: Date,
  spawnIntervalMinutes: number,
): Promise<DemoDonor> {
  const attribute = await database
    .collection<ItemAttribute>("attributes")
    .findOne({ _id: ART_DONOR_ATTRIBUTE_ID, active: true });
  if (!attribute) {
    throw new Error("The Art Donor visitor type is not available.");
  }

  const id = randomUUID();
  return {
    _id: id,
    quality: "bronze",
    attribute_id: attribute._id,
    owner_id: player._id,
    owner_name: player.screen_name,
    spawned_at: now,
    expiration: new Date(
      now.getTime() + spawnIntervalMinutes * 60 * 1000,
    ),
    players_met: [],
    icon: attribute.icon,
    npc_name: attribute.npc_name,
    proc_chance: 1,
    demo_spawned: true,
    spawn_key: `game-demo:${player._id}:${id}`,
  };
}
