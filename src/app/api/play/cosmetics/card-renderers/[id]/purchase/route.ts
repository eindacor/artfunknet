import { NextResponse } from "next/server";

import {
  getCardCosmetic,
  getOwnedCardRendererIds,
} from "@/components/item-cards/catalog";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import {
  getCardRendererSettings,
  isCardRendererActive,
} from "@/server/card-renderer-settings";

type Player = {
  _id: string;
  active: boolean;
  profile: {
    bank_balance: number;
    owned_card_renderers?: string[];
  };
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const cosmetic = getCardCosmetic(id);
  if (!cosmetic || cosmetic.price <= 0) {
    return NextResponse.json(
      { error: "This card cosmetic cannot be purchased." },
      { status: 404 },
    );
  }

  const database = await getDatabase();
  const rendererSettings = await getCardRendererSettings(database);
  if (!isCardRendererActive(cosmetic.id, rendererSettings.activeRendererIds)) {
    return NextResponse.json(
      { error: "This card cosmetic is not currently available." },
      { status: 409 },
    );
  }
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
    getOwnedCardRendererIds(player.profile.owned_card_renderers).includes(
      cosmetic.id,
    )
  ) {
    return NextResponse.json(
      { error: "You already own this card cosmetic." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const updatedPlayer = await database.collection<Player>("players").findOneAndUpdate(
    {
      _id: player._id,
      active: true,
      "profile.bank_balance": { $gte: cosmetic.price },
      "profile.owned_card_renderers": { $ne: cosmetic.id },
    },
    {
      $inc: { "profile.bank_balance": -cosmetic.price },
      $addToSet: { "profile.owned_card_renderers": cosmetic.id },
      $set: { "profile.last_activity": now },
    },
    { returnDocument: "after" },
  );
  if (!updatedPlayer) {
    return NextResponse.json(
      {
        error:
          "You do not have enough money, or this cosmetic was already purchased.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    status: "ok",
    cosmeticId: cosmetic.id,
    bankBalance: updatedPlayer.profile.bank_balance,
    ownedRendererIds: getOwnedCardRendererIds(
      updatedPlayer.profile.owned_card_renderers,
    ),
  });
}
