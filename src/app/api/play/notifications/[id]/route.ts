import { NextResponse } from "next/server";

import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import type { PlayerNotification } from "@/server/player-notifications";

type UpdateNotificationRequest = {
  read?: unknown;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as UpdateNotificationRequest;
  if (typeof body.read !== "boolean") {
    return NextResponse.json(
      { error: "A valid read state is required." },
      { status: 400 },
    );
  }

  const { id } = await params;
  const database = await getDatabase();
  const result = await database
    .collection<PlayerNotification>("player_notifications")
    .updateOne(
      { _id: id, user_id: auth.session.playerId },
      { $set: { read: body.read } },
    );
  if (result.matchedCount !== 1) {
    return NextResponse.json(
      { error: "Notification not found." },
      { status: 404 },
    );
  }
  return NextResponse.json({ status: "ok" });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const database = await getDatabase();
  const result = await database
    .collection<PlayerNotification>("player_notifications")
    .deleteOne({ _id: id, user_id: auth.session.playerId });
  if (result.deletedCount !== 1) {
    return NextResponse.json(
      { error: "Notification not found." },
      { status: 404 },
    );
  }
  return NextResponse.json({ status: "ok" });
}
