import { NextResponse } from "next/server";

import {
  getActiveChatPlayers,
  reportGalleryChatMessage,
} from "@/server/gallery-chat";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

export async function POST(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ playerId: string; messageId: string }>;
  },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { playerId, messageId } = await params;
  const database = await getDatabase();
  const participants = await getActiveChatPlayers(
    database,
    auth.session.playerId,
    playerId,
  );
  if (!participants) {
    return NextResponse.json(
      { error: "This gallery chat is unavailable." },
      { status: 404 },
    );
  }

  const reported = await reportGalleryChatMessage(
    database,
    messageId,
    playerId,
    auth.session.playerId,
  );
  if (!reported) {
    return NextResponse.json(
      { error: "The chat message could not be found." },
      { status: 404 },
    );
  }
  return NextResponse.json({ status: "ok" });
}
