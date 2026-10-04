import { NextResponse } from "next/server";

import { serializeGameClientItem } from "@/server/game-client-item";
import type { GameItem } from "@/server/gameplay";
import { hydrateGameItems } from "@/server/item-artwork";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

export async function GET() {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const database = await getDatabase();
  const rawItems = await database
    .collection<GameItem>("items")
    .find({
      owner: auth.session.playerId,
      status: { $in: ["claimed", "displayed"] },
    })
    .sort({ date_received: -1, date_created: -1 })
    .limit(200)
    .toArray();
  const items = await hydrateGameItems(database, rawItems);

  return NextResponse.json(
    {
      items: items.map(serializeGameClientItem),
      total: items.length,
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
