import { NextResponse } from "next/server";

import { getDatabase } from "@/server/mongodb";
import { getPlayerSession } from "@/server/session";

export async function requirePlayerApi() {
  const session = await getPlayerSession();

  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Player authentication is required." },
        { status: 401 },
      ),
    };
  }

  const activePlayer = await (await getDatabase())
    .collection<{ _id: string; active: boolean }>("players")
    .findOne(
      { _id: session.playerId, active: true },
      { projection: { _id: 1 } },
    );
  if (!activePlayer) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "This account has been de-activated." },
        { status: 403 },
      ),
    };
  }

  return { ok: true as const, session };
}
