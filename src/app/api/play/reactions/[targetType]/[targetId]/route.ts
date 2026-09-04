import { NextResponse } from "next/server";

import {
  getCommunityReactionSummary,
  toggleCommunityReaction,
} from "@/server/community-reactions";
import {
  isCommunityEmote,
  isCommunityReactionTarget,
  type CommunityReactionTarget,
} from "@/server/community-reactions-core";
import {
  GLOBAL_CHAT_ROOM_ID,
  type GalleryChatDocument,
} from "@/server/gallery-chat";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import { getPublicItemView } from "@/server/public-showcase";

type TargetAccess = {
  expiresAt?: Date;
};

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ targetType: string; targetId: string }>;
  },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { targetType, targetId } = await params;
  if (!isCommunityReactionTarget(targetType)) {
    return NextResponse.json(
      { error: "This reaction target is unsupported." },
      { status: 404 },
    );
  }
  const database = await getDatabase();
  if (
    !(await getTargetAccess(
      database,
      targetType,
      targetId,
      auth.session.playerId,
    ))
  ) {
    return NextResponse.json(
      { error: "This reaction target is unavailable." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    reactions: await getCommunityReactionSummary(
      database,
      targetType,
      targetId,
      auth.session.playerId,
    ),
  });
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ targetType: string; targetId: string }>;
  },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  let body: { emote?: unknown };
  try {
    body = (await request.json()) as { emote?: unknown };
  } catch {
    return NextResponse.json(
      { error: "The reaction request is invalid." },
      { status: 400 },
    );
  }
  const { targetType, targetId } = await params;
  if (
    !isCommunityReactionTarget(targetType) ||
    !isCommunityEmote(body.emote)
  ) {
    return NextResponse.json(
      { error: "Select a supported reaction." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const access = await getTargetAccess(
    database,
    targetType,
    targetId,
    auth.session.playerId,
  );
  if (!access) {
    return NextResponse.json(
      { error: "This reaction target is unavailable." },
      { status: 404 },
    );
  }

  return NextResponse.json(
    await toggleCommunityReaction(database, {
      targetType,
      targetId,
      emote: body.emote,
      playerId: auth.session.playerId,
      expiresAt: access.expiresAt,
    }),
  );
}

async function getTargetAccess(
  database: Awaited<ReturnType<typeof getDatabase>>,
  targetType: CommunityReactionTarget,
  targetId: string,
  viewerId: string,
): Promise<TargetAccess | null> {
  if (targetType === "message") {
    const message = await database
      .collection<GalleryChatDocument>("gallery_chat_messages")
      .findOne({
        _id: targetId,
        hidden: { $ne: true },
        $or: [{ reported: true }, { expires_at: { $gt: new Date() } }],
      });
    if (!message) return null;
    if (message.gallery_owner_id !== GLOBAL_CHAT_ROOM_ID) {
      const owner = await database
        .collection<{ _id: string; active: boolean }>("players")
        .findOne({ _id: message.gallery_owner_id, active: true });
      if (!owner) return null;
    }
    return { expiresAt: message.expires_at };
  }
  if (targetType === "gallery") {
    const owner = await database
      .collection<{ _id: string; active: boolean }>("players")
      .findOne({ _id: targetId, active: true });
    return owner ? {} : null;
  }
  if (targetType === "item") {
    return (await getPublicItemView(database, targetId, viewerId)) ? {} : null;
  }
  const artist = await database
    .collection<{ _id: string }>("artists")
    .findOne({ _id: targetId }, { projection: { _id: 1 } });
  return artist ? {} : null;
}
