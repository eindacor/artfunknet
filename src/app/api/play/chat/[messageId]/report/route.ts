import { NextResponse } from "next/server";

import {
  GLOBAL_CHAT_ROOM_ID,
  reportGalleryChatMessage,
} from "@/server/gallery-chat";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { messageId } = await params;
  const reported = await reportGalleryChatMessage(
    await getDatabase(),
    messageId,
    GLOBAL_CHAT_ROOM_ID,
    auth.session.playerId,
  );
  if (!reported) {
    return NextResponse.json(
      { error: "This chat message could not be reported." },
      { status: 404 },
    );
  }

  return NextResponse.json({ status: "reported" });
}
