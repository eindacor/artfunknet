import { NextResponse } from "next/server";

import { isCardRendererId } from "@/components/item-cards/selection";
import { requireAdminApi } from "@/server/admin-api";
import { getCardRendererSettings } from "@/server/card-renderer-settings";
import { getDatabase } from "@/server/mongodb";

type UpdateRequest = {
  active?: unknown;
  name?: unknown;
  supporter?: unknown;
};

type CardRendererSettingsDocument = {
  _id: string;
  active_renderer_ids?: string[];
  supporter_renderer_ids?: string[];
  renderer_names?: Record<string, string>;
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
  const hasSupporter = typeof body.supporter === "boolean";
  const name = typeof body.name === "string" ? body.name.trim() : null;
  if (
    !isCardRendererId(id) ||
    (!hasActive && !hasSupporter && name === null) ||
    (name !== null && (name.length === 0 || name.length > 80))
  ) {
    return NextResponse.json(
      { error: "Card renderer settings are invalid." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  await getCardRendererSettings(database);
  const now = new Date();
  const collection =
    database.collection<CardRendererSettingsDocument>("metadata");
  if (hasActive) {
    await collection.updateOne(
      { _id: "card-renderer-settings" },
      body.active
        ? {
            $addToSet: { active_renderer_ids: id },
            $set: { updated_at: now, updated_by: auth.session.email },
            $setOnInsert: { created_at: now },
          }
        : {
            $pull: { active_renderer_ids: id },
            $set: { updated_at: now, updated_by: auth.session.email },
            $setOnInsert: { created_at: now },
          },
      { upsert: true },
    );
  }
  if (hasSupporter) {
    await collection.updateOne(
      { _id: "card-renderer-settings" },
      body.supporter
        ? {
            $addToSet: { supporter_renderer_ids: id },
            $set: { updated_at: now, updated_by: auth.session.email },
            $setOnInsert: { created_at: now },
          }
        : {
            $pull: { supporter_renderer_ids: id },
            $set: { updated_at: now, updated_by: auth.session.email },
            $setOnInsert: { created_at: now },
          },
      { upsert: true },
    );
  }
  if (name !== null) {
    await collection.updateOne(
      { _id: "card-renderer-settings" },
      {
        $set: {
          [`renderer_names.${id}`]: name,
          updated_at: now,
          updated_by: auth.session.email,
        },
        $setOnInsert: { created_at: now },
      },
      { upsert: true },
    );
  }
  return NextResponse.json({
    status: "ok",
    ...(hasActive ? { active: body.active } : {}),
    ...(hasSupporter ? { supporter: body.supporter } : {}),
    ...(name !== null ? { name } : {}),
  });
}
