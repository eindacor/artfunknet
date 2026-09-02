import { NextResponse } from "next/server";

import { isCardRendererId } from "@/components/item-cards/selection";
import { requireAdminApi } from "@/server/admin-api";
import { getDatabase } from "@/server/mongodb";

type UpdateRequest = {
  active?: unknown;
};

type CardRendererSettingsDocument = {
  _id: string;
  inactive_renderer_ids?: string[];
  created_at?: Date;
  updated_at?: Date;
  updated_by?: string;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = (await request.json()) as UpdateRequest;
  const hasActive = typeof body.active === "boolean";
  if (
    !isCardRendererId(id) ||
    !hasActive
  ) {
    return NextResponse.json(
      { error: "Card renderer settings are invalid." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const now = new Date();
  const collection =
    database.collection<CardRendererSettingsDocument>("metadata");
  if (hasActive) {
    await collection.updateOne(
      { _id: "card-renderer-settings" },
      body.active
        ? {
            $pull: { inactive_renderer_ids: id },
            $set: { updated_at: now, updated_by: auth.session.email },
            $setOnInsert: { created_at: now },
          }
        : {
            $addToSet: { inactive_renderer_ids: id },
            $set: { updated_at: now, updated_by: auth.session.email },
            $setOnInsert: { created_at: now },
          },
      { upsert: true },
    );
  }
  return NextResponse.json({
    status: "ok",
    active: body.active,
  });
}
