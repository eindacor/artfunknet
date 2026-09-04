import { NextResponse } from "next/server";

import { getDatabase } from "@/server/mongodb";
import {
  getPlayerNotifications,
} from "@/server/player-notifications";
import { requirePlayerApi } from "@/server/player-api";

export async function GET() {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const database = await getDatabase();
  const notifications = await getPlayerNotifications(
    database,
    auth.session.playerId,
  );
  return NextResponse.json({ notifications });
}

export async function PATCH() {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const database = await getDatabase();
  await database.collection("player_notifications").updateMany(
    { user_id: auth.session.playerId, read: false },
    { $set: { read: true } },
  );
  return NextResponse.json({ status: "ok" });
}

export async function DELETE() {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const database = await getDatabase();
  await database
    .collection("player_notifications")
    .deleteMany({ user_id: auth.session.playerId });
  return NextResponse.json({ status: "ok" });
}
