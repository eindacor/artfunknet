import { NextResponse } from "next/server";

import {
  getCardCosmetic,
  getOwnedCardRendererIds,
} from "@/components/item-cards/catalog";
import type { GameItem } from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type Player = {
  _id: string;
  active: boolean;
  profile: {
    owned_card_renderers?: string[];
  };
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as { rendererId?: string };
  const cosmetic = body.rendererId
    ? getCardCosmetic(body.rendererId)
    : undefined;
  if (!cosmetic) {
    return NextResponse.json(
      { error: "Select a recognized card cosmetic." },
      { status: 400 },
    );
  }

  const { id } = await params;
  const database = await getDatabase();
  const player = await database.collection<Player>("players").findOne({
    _id: auth.session.playerId,
    active: true,
  });
  if (!player) {
    return NextResponse.json(
      { error: "The player account is unavailable." },
      { status: 404 },
    );
  }
  if (
    !getOwnedCardRendererIds(
      player.profile.owned_card_renderers,
    ).includes(cosmetic.id)
  ) {
    return NextResponse.json(
      { error: "Purchase this card cosmetic before applying it." },
      { status: 403 },
    );
  }

  const result = await database.collection<GameItem>("items").updateOne(
    {
      _id: id,
      owner: player._id,
      status: { $in: ["claimed", "displayed"] },
    },
    { $set: { card_renderer: cosmetic.id } },
  );
  if (result.matchedCount !== 1) {
    return NextResponse.json(
      { error: "Only artwork you own can be customized." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    status: "ok",
    rendererId: cosmetic.id,
  });
}
