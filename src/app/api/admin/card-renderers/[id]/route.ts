import { NextResponse } from "next/server";

import { isCardRendererId } from "@/components/item-cards/selection";
import { requireAdminApi } from "@/server/admin-api";
import { getDatabase } from "@/server/mongodb";

type UpdateRequest = {
  active?: unknown;
  price?: unknown;
};

type CardRendererSettingsDocument = {
  _id: string;
  inactive_renderer_ids?: string[];
  renderer_prices?: Record<string, number>;
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
  const price = Number(body.price);
  const hasPrice = body.price !== undefined;
  if (
    !isCardRendererId(id) ||
    (!hasActive && !hasPrice) ||
    (hasPrice &&
      (!Number.isSafeInteger(price) ||
        price < 0 ||
        price > Number.MAX_SAFE_INTEGER))
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
  if (hasPrice) {
    await collection.updateOne(
      { _id: "card-renderer-settings" },
      {
        $set: {
          [`renderer_prices.${id}`]: price,
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
    ...(hasPrice ? { price } : {}),
  });
}
