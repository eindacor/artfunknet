import { NextResponse } from "next/server";

import {
  createGalleryChatMessage,
  GALLERY_CHAT_MAX_LENGTH,
  getActiveChatPlayers,
  getGalleryChatMessages,
} from "@/server/gallery-chat";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { playerId } = await params;
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

  return NextResponse.json({
    messages: await getGalleryChatMessages(
      database,
      playerId,
      auth.session.playerId,
    ),
    retentionDays: 7,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ playerId: string }> },
) {
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

  const { playerId } = await params;
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

  try {
    const message = await createGalleryChatMessage(database, {
      galleryOwner: participants.owner,
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
