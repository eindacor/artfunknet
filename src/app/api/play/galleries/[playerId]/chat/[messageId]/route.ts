import { NextResponse } from "next/server";

import {
  deleteGalleryChatMessage,
  editGalleryChatMessage,
  GALLERY_CHAT_MAX_LENGTH,
  getActiveChatPlayers,
} from "@/server/gallery-chat";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ playerId: string; messageId: string }>;
  },
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
  const message = await editGalleryChatMessage(
    database,
    messageId,
    playerId,
    auth.session.playerId,
    body.content,
  );
  if (!message) {
    return NextResponse.json(
      { error: "This chat message cannot be edited." },
      { status: 404 },
    );
  }
  return NextResponse.json({ message });
}

export async function DELETE(
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
  const deleted = await deleteGalleryChatMessage(
    database,
    messageId,
    playerId,
    auth.session.playerId,
  );
  if (!deleted) {
    return NextResponse.json(
      { error: "This chat message cannot be deleted." },
      { status: 404 },
    );
  }
  return NextResponse.json({ status: "deleted" });
}
