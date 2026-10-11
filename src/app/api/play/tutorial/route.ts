import { NextResponse } from "next/server";

import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type Player = {
  _id: string;
  active: boolean;
  tutorial_seen?: boolean;
  updated_at: Date;
};

export async function PATCH() {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const database = await getDatabase();
  const result = await database.collection<Player>("players").updateOne(
    { _id: auth.session.playerId, active: true },
    {
      $set: {
        tutorial_seen: true,
        updated_at: new Date(),
      },
    },
  );
  if (result.matchedCount !== 1) {
    return NextResponse.json(
      { error: "The player account is unavailable." },
      { status: 404 },
    );
  }
  return NextResponse.json({ status: "ok" });
}
