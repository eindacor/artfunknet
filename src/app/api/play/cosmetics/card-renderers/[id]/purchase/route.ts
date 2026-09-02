import { NextResponse } from "next/server";

import {
  getCardCosmetic,
  getCardStyleInventory,
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
    card_style_consumables?: Record<string, number>;
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
  if (!cosmetic) {
    return NextResponse.json(
      { error: "This card cosmetic cannot be purchased." },
      { status: 404 },
    );
  }
  if (cosmetic.id === "museum") {
    return NextResponse.json(
      { error: "Museum Label is already available without a consumable." },
      { status: 409 },
    );
  }

  const database = await getDatabase();
  const rendererSettings = await getCardRendererSettings(database);
  const price = rendererSettings.rendererPrices[cosmetic.id];
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
  const now = new Date().toISOString();
  const quantityPath = `profile.card_style_consumables.${cosmetic.id}`;
  const updatedPlayer = await database
    .collection<Player>("players")
    .findOneAndUpdate(
      {
        _id: player._id,
        active: true,
        "profile.bank_balance": { $gte: price },
      },
      {
        $inc: {
          "profile.bank_balance": -price,
          [quantityPath]: 1,
        },
        $set: { "profile.last_activity": now },
      },
      { returnDocument: "after" },
    );
  if (!updatedPlayer) {
    return NextResponse.json(
      { error: "You do not have enough money for this art style." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    status: "ok",
    cosmeticId: cosmetic.id,
    bankBalance: updatedPlayer.profile.bank_balance,
    styleInventory: getCardStyleInventory(
      updatedPlayer.profile.card_style_consumables,
    ),
  });
}
