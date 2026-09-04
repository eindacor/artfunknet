import { NextResponse } from "next/server";

import {
  createGalleryChatMessage,
  GALLERY_CHAT_MAX_LENGTH,
  getActiveChatPlayers,
  getGalleryChatMessages,
  GLOBAL_CHAT_ROOM_ID,
  type ChatPlayer,
} from "@/server/gallery-chat";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

const GLOBAL_CHAT_OWNER: ChatPlayer = {
  _id: GLOBAL_CHAT_ROOM_ID,
  screen_name: "Global chat",
  active: true,
};

export async function GET() {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    messages: await getGalleryChatMessages(
      await getDatabase(),
      GLOBAL_CHAT_ROOM_ID,
      auth.session.playerId,
    ),
    retentionDays: 7,
  });
}

export async function POST(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  let body: { content?: unknown };
  try {
    body = (await request.json()) as { content?: unknown };
  } catch {
    return NextResponse.json(
      { error: "The chat message is invalid." },
      { status: 400 },
    );
  }
  if (
    typeof body.content !== "string" ||
    body.content.trim().length === 0 ||
    body.content.trim().length > GALLERY_CHAT_MAX_LENGTH
  ) {
    return NextResponse.json(
      {
        error: `Chat messages must contain 1-${GALLERY_CHAT_MAX_LENGTH} characters.`,
      },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const participants = await getActiveChatPlayers(
    database,
    auth.session.playerId,
    auth.session.playerId,
  );
  if (!participants) {
    return NextResponse.json(
      { error: "Global chat is unavailable." },
      { status: 404 },
    );
  }

  try {
    const message = await createGalleryChatMessage(database, {
      galleryOwner: GLOBAL_CHAT_OWNER,
      author: participants.viewer,
      content: body.content,
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The chat message could not be sent.",
      },
      { status: 409 },
    );
  }
}
