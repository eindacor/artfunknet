import { NextResponse } from "next/server";

import { requireAdminApi } from "@/server/admin-api";
import {
  createGlobalSystemChatMessage,
  ensureGalleryChatIndexes,
  getGalleryChatReports,
  type GalleryChatDocument,
} from "@/server/gallery-chat";
import { getDatabase } from "@/server/mongodb";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    reports: await getGalleryChatReports(await getDatabase()),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  let body: { content?: unknown };
  try {
    body = (await request.json()) as { content?: unknown };
  } catch {
    return NextResponse.json(
      { error: "The announcement is invalid." },
      { status: 400 },
    );
  }
  if (typeof body.content !== "string") {
    return NextResponse.json(
      { error: "Announcement text is required." },
      { status: 400 },
    );
  }
  try {
    await createGlobalSystemChatMessage(await getDatabase(), {
      content: body.content,
    });
    return NextResponse.json({ status: "ok" }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The announcement could not be posted.",
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  let body: { id?: unknown; hidden?: unknown; action?: unknown };
  try {
    body = (await request.json()) as {
      id?: unknown;
      hidden?: unknown;
      action?: unknown;
    };
  } catch {
    return NextResponse.json(
      { error: "The moderation request is invalid." },
      { status: 400 },
    );
  }
  if (typeof body.id !== "string" || body.id.length === 0) {
    return NextResponse.json(
      { error: "A reported message is required." },
      { status: 400 },
    );
  }
  const dismissing = body.action === "dismiss";
  if (!dismissing && typeof body.hidden !== "boolean") {
    return NextResponse.json(
      { error: "A message visibility state is required." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  await ensureGalleryChatIndexes(database);
  const moderatedAt = new Date();
  const result = await database
    .collection<GalleryChatDocument>("gallery_chat_messages")
    .updateOne(
      {
        _id: body.id,
        reported: true,
        dismissed_at: { $exists: false },
        ...(dismissing ? { hidden: { $ne: true } } : {}),
      },
      dismissing
        ? {
            $set: {
              dismissed_at: moderatedAt,
              dismissed_by: auth.session.email,
              moderated_at: moderatedAt,
              moderated_by: auth.session.email,
            },
          }
        : {
            $set: {
              hidden: body.hidden as boolean,
              moderated_at: moderatedAt,
              moderated_by: auth.session.email,
            },
        },
    );
  if (result.matchedCount !== 1) {
    return NextResponse.json(
      { error: "The reported chat message could not be found." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    status: "ok",
    dismissed: dismissing,
    ...(dismissing ? {} : { hidden: body.hidden }),
  });
}
