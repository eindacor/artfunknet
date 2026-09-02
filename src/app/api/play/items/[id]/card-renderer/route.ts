import { NextResponse } from "next/server";
import type { UpdateFilter } from "mongodb";

import {
  getCardCosmetic,
  getCardStyleInventory,
} from "@/components/item-cards/catalog";
import type { GameItem } from "@/server/gameplay";
import { getDemintUpdate } from "@/server/item-mint";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type Player = {
  _id: string;
  active: boolean;
  profile: {
    card_style_consumables?: Record<string, number>;
  };
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as {
    removeStyle?: boolean;
    rendererId?: string;
  };
  const removingStyle = body.removeStyle === true;
  const cosmetic = !removingStyle && body.rendererId
    ? getCardCosmetic(body.rendererId)
    : undefined;
  if (!removingStyle && (!cosmetic || cosmetic.id === "museum")) {
    return NextResponse.json(
      { error: "Select a recognized art style." },
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
  const item = await database.collection<GameItem>("items").findOne(
    {
      _id: id,
      owner: player._id,
      status: { $in: ["claimed", "displayed"] },
    },
  );
  if (!item) {
    return NextResponse.json(
      { error: "Only artwork you own can be customized." },
      { status: 409 },
    );
  }
  const currentCosmetic = getCardCosmetic(item.card_renderer ?? "");
  const currentRendererId =
    currentCosmetic?.id === "museum" ? undefined : currentCosmetic?.id;
  if (removingStyle && !currentRendererId) {
    return NextResponse.json(
      { error: "This item does not have an applied art style." },
      { status: 409 },
    );
  }
  if (!removingStyle && currentRendererId === cosmetic?.id) {
    return NextResponse.json(
      { error: "This art style is already applied." },
      { status: 409 },
    );
  }

  let mintUpdate = {};
  try {
    mintUpdate = (await getDemintUpdate(database, item)) ?? {};
  } catch (error) {
    console.error("Unable to remove Mint before applying cosmetic", error);
    return NextResponse.json(
      { error: "This item's value data is unavailable." },
      { status: 500 },
    );
  }
  const quantityPath = cosmetic
    ? `profile.card_style_consumables.${cosmetic.id}`
    : undefined;
  let updatedPlayer = player;
  if (cosmetic && quantityPath) {
    const consumedPlayer = await database
      .collection<Player>("players")
      .findOneAndUpdate(
        {
          _id: player._id,
          active: true,
          [quantityPath]: { $gte: 1 },
        },
        { $inc: { [quantityPath]: -1 } },
        { returnDocument: "after" },
      );
    if (!consumedPlayer) {
      return NextResponse.json(
        { error: "You do not have this art style consumable available." },
        { status: 409 },
      );
    }
    updatedPlayer = consumedPlayer;
  }

  const rendererFilter =
    item.card_renderer === undefined
      ? { card_renderer: { $exists: false } }
      : { card_renderer: item.card_renderer };
  const itemUpdate: UpdateFilter<GameItem> = removingStyle
    ? {
        $set: mintUpdate,
        $unset: { card_renderer: "" as const },
      }
    : { $set: { ...mintUpdate, card_renderer: cosmetic!.id } };
  const result = await database.collection<GameItem>("items").findOneAndUpdate(
    {
      _id: item._id,
      owner: player._id,
      status: item.status,
      mint: item.mint,
      ...rendererFilter,
    },
    itemUpdate,
    { returnDocument: "after" },
  );
  if (!result) {
    if (cosmetic && quantityPath) {
      const rollback = await database.collection<Player>("players").updateOne(
        { _id: player._id, active: true },
        { $inc: { [quantityPath]: 1 } },
      );
      if (rollback.modifiedCount !== 1) {
        console.error(
          `Unable to restore consumed ${cosmetic.id} art style for player ${player._id}`,
        );
        return NextResponse.json(
          {
            error:
              "The item changed and the consumed art style could not be restored.",
          },
          { status: 500 },
        );
      }
    }
    return NextResponse.json(
      { error: "This item changed before its art style could be applied." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    status: "ok",
    ...(cosmetic ? { rendererId: cosmetic.id } : {}),
    item: result,
    styleInventory: getCardStyleInventory(
      updatedPlayer.profile.card_style_consumables,
    ),
  });
}
