import { NextResponse } from "next/server";

import { getDatabase } from "@/server/mongodb";
import {
  createPlayerNotification,
  getPlayerNotifications,
  PLAYER_NOTIFICATION_KINDS,
  type PlayerNotificationKind,
} from "@/server/player-notifications";
import { requirePlayerApi } from "@/server/player-api";

type CreateNotificationRequest = {
  kind?: unknown;
  message?: unknown;
};

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

export async function POST(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as CreateNotificationRequest;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const kind = body.kind;
  if (
    message.length === 0 ||
    message.length > 500 ||
    typeof kind !== "string" ||
    !PLAYER_NOTIFICATION_KINDS.includes(kind as PlayerNotificationKind)
  ) {
    return NextResponse.json(
      { error: "A valid notification message and type are required." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const notification = await createPlayerNotification(
    database,
    auth.session.playerId,
    { kind: kind as PlayerNotificationKind, message },
  );
  return NextResponse.json({ notification });
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
