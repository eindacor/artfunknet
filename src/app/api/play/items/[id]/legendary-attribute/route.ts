import { NextResponse } from "next/server";

import type { Artwork, GameItem } from "@/server/gameplay";
import type { LegendaryAttribute } from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type SelectionRequest = {
  attributeId?: unknown;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as SelectionRequest;
  if (typeof body.attributeId !== "string" || !body.attributeId) {
    return NextResponse.json(
      { error: "Select a valid Legendary Attribute." },
      { status: 400 },
    );
  }

  const { id } = await params;
  const database = await getDatabase();
  const item = await database.collection<GameItem>("items").findOne({
    _id: id,
    owner: auth.session.playerId,
    status: "claimed",
  });
  if (!item) {
    return NextResponse.json(
      { error: "This item's Legendary Attribute cannot currently be changed." },
      { status: 409 },
    );
  }

  const [artwork, legendaryAttribute] = await Promise.all([
    database.collection<Artwork>("artworks").findOne({
      _id: item.artwork_id,
      active: true,
      unique_attributes: body.attributeId,
    }),
    database
      .collection<LegendaryAttribute>("unique_attributes")
      .findOne({ _id: body.attributeId, active: true }),
  ]);
  if (!artwork || !legendaryAttribute) {
    return NextResponse.json(
      { error: "That Legendary Attribute is not available to this item." },
      { status: 409 },
    );
  }

  const result = await database.collection<GameItem>("items").findOneAndUpdate(
    {
      _id: item._id,
      owner: auth.session.playerId,
      status: "claimed",
      active_unique_attribute: item.active_unique_attribute,
    },
    { $set: { active_unique_attribute: body.attributeId } },
    { returnDocument: "after" },
  );
  if (!result) {
    return NextResponse.json(
      { error: "This item changed before the selection could be saved." },
      { status: 409 },
    );
  }

  return NextResponse.json({ status: "ok", item: result });
}
