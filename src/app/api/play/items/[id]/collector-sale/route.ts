import { NextResponse } from "next/server";

import type { GameItem } from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import { refreshGalleryMetadata } from "@/server/gallery-metadata";
import { getItemDisposalFilter, getItemDisposalPermission } from "@/server/item-permissions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const database = await getDatabase();
  const item = await database.collection<GameItem>("items").findOne({
    _id: id,
    owner: auth.session.playerId,
    status: { $in: ["claimed", "displayed"] },
  });
  if (!item) {
    return NextResponse.json(
      { error: "This item cannot be offered to Art Collectors." },
      { status: 409 },
    );
  }

  const offered = item.tags.includes("for sale");
  const body = (await request.json().catch(() => null)) as {
    offered?: unknown;
  } | null;
  const nextOffered =
    typeof body?.offered === "boolean" ? body.offered : !offered;
  const permission = getItemDisposalPermission(item, "collector-sale");
  if (nextOffered && !permission.allowed) {
    return NextResponse.json({ error: permission.reason }, { status: 409 });
  }
  if (nextOffered === offered) {
    return NextResponse.json({
      status: "ok",
      message: offered
        ? "This artwork is already available to Art Collectors."
        : "This artwork is already unavailable to Art Collectors.",
    });
  }
  const result = await database.collection<GameItem>("items").updateOne(
    {
      _id: item._id,
      owner: auth.session.playerId,
      status: item.status,
      mint: item.mint,
      tags: nextOffered ? { $ne: "for sale" } : "for sale",
      ...(nextOffered ? getItemDisposalFilter("collector-sale", item.status) : {}),
    },
    nextOffered
      ? { $addToSet: { tags: "for sale" } }
      : { $pull: { tags: "for sale" } },
  );
  if (result.modifiedCount !== 1) {
    return NextResponse.json(
      { error: "This item's Collector availability changed." },
      { status: 409 },
    );
  }

  if (item.status === "displayed") {
    await refreshGalleryMetadata(database, auth.session.playerId);
  }
  return NextResponse.json({
    status: "ok",
    message: nextOffered
      ? "Added this artwork to your Collector offerings."
      : "Removed this artwork from your Collector offerings.",
  });
}
