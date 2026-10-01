import { NextResponse } from "next/server";

import type { GameItem } from "@/server/gameplay";
import { normalizeItemTags } from "@/server/item-tags";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "The item tags request is invalid." },
      { status: 400 },
    );
  }
  if (!isRecord(body)) {
    return NextResponse.json(
      { error: "The item tags request is invalid." },
      { status: 400 },
    );
  }
  if (
    Object.keys(body).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(body, "tags")
  ) {
    return NextResponse.json(
      { error: "The item tags request is invalid." },
      { status: 400 },
    );
  }
  const normalized = normalizeItemTags(body.tags);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const { id } = await params;
  const database = await getDatabase();
  const result = await database.collection<GameItem>("items").updateOne(
    {
      _id: id,
      owner: auth.session.playerId,
      status: { $in: ["claimed", "displayed", "auctioned"] },
    },
    { $set: { tags: normalized.tags } },
  );
  if (result.matchedCount !== 1) {
    return NextResponse.json(
      { error: "This item cannot currently be tagged." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    status: "ok",
    tags: normalized.tags,
    message: "Item tags updated.",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
