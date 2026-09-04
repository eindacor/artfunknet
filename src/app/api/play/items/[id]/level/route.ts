import { NextResponse } from "next/server";
import type { UpdateFilter } from "mongodb";

import {
  calculateItemValues,
  type Artwork,
  type GameItem,
  type LootData,
} from "@/server/gameplay";
import {
  canAffordItemLevelUp,
  getItemLevelUpCost,
  ITEM_LEVEL_MAX,
  prepareItemForLevelUp,
  PRESERVATIONIST_ATTRIBUTE_ID,
} from "@/server/item-leveling";
import { getRerollCost } from "@/server/item-reroll";
import { ensurePlayerKarma } from "@/server/karma";
import {
  getDisplayedLegendaryEffect,
  getLegendaryNumberParameter,
} from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import { sanitizePlayerFacingAuthenticity } from "@/server/forgery-gameplay";

type Player = {
  _id: string;
  active: boolean;
  profile: {
    karma?: number;
    last_activity: string;
  };
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const database = await getDatabase();
  await ensurePlayerKarma(database, auth.session.playerId);
  const now = new Date();
  const nowIso = now.toISOString();
  const [item, player, metadata, levelUpDiscount, preservationist] =
    await Promise.all([
      database.collection<GameItem>("items").findOne({
        _id: id,
        owner: auth.session.playerId,
        status: "claimed",
      }),
      database.collection<Player>("players").findOne({
        _id: auth.session.playerId,
        active: true,
      }),
      database
        .collection<{ _id: string; loot_data: LootData }>("metadata")
        .findOne({ _id: "loot-data" }),
      getDisplayedLegendaryEffect(
        database,
        auth.session.playerId,
        "LEVEL_UP_COST_REDUCTION",
      ),
      database.collection("npcs").findOne({
        owner_id: auth.session.playerId,
        attribute_id: PRESERVATIONIST_ATTRIBUTE_ID,
        expiration: { $gt: now },
      }),
    ]);

  if (!item || !player) {
    return NextResponse.json(
      { error: "This item cannot currently be promoted." },
      { status: 409 },
    );
  }
  if (!metadata) {
    return NextResponse.json(
      { error: "Loot metadata is not configured." },
      { status: 500 },
    );
  }
  const playerId = player._id;
  if (item.level >= ITEM_LEVEL_MAX) {
    return NextResponse.json(
      { error: `This item has reached level ${ITEM_LEVEL_MAX}.` },
      { status: 409 },
    );
  }

  const artwork = await database.collection<Artwork>("artworks").findOne({
    _id: item.artwork_id,
    active: true,
  });
  if (!artwork) {
    return NextResponse.json(
      { error: "The artwork referenced by this item is unavailable." },
      { status: 409 },
    );
  }

  const conditionMinimum = getLegendaryNumberParameter(
    levelUpDiscount,
    "condition_minimum",
    0.8,
  );
  const discounted =
    Boolean(levelUpDiscount && preservationist) &&
    item.condition > conditionMinimum;
  const cost = getItemLevelUpCost(item.level, discounted);
  const availableKarma = Math.max(0, Math.floor(player.profile.karma ?? 0));
  if (!canAffordItemLevelUp(availableKarma, cost)) {
    return NextResponse.json(
      { error: "You do not have enough Karma for this promotion." },
      { status: 409 },
    );
  }

  const chargedPlayer = await database.collection<Player>("players").findOneAndUpdate(
    {
      _id: playerId,
      active: true,
      "profile.karma": { $gte: cost },
    },
    {
      $inc: { "profile.karma": -cost },
      $set: { "profile.last_activity": nowIso },
    },
    { returnDocument: "after" },
  );
  if (!chargedPlayer) {
    return NextResponse.json(
      { error: "Your Karma balance changed before the promotion." },
      { status: 409 },
    );
  }

  async function refundPlayer() {
    try {
      const refund = await database.collection<Player>("players").updateOne(
        { _id: playerId },
        { $inc: { "profile.karma": cost } },
      );
      if (refund.modifiedCount !== 1) {
        console.error(
          `Promotion refund could not find player ${playerId}; manual reconciliation is required.`,
        );
      }
    } catch (refundError) {
      console.error(
        `Promotion refund failed for player ${playerId}; manual reconciliation is required.`,
        refundError,
      );
    }
  }

  let updatedItem: GameItem;
  try {
    const nextItem = prepareItemForLevelUp(item);
    const itemArtwork = { ...artwork, ...item.artwork_overrides };
    const values = calculateItemValues(
      nextItem,
      itemArtwork,
      metadata.loot_data,
    );
    const rerollCost = getRerollCost(
      nextItem,
      artwork.rarity,
      metadata.loot_data,
    );
    const rendererFilter =
      item.card_renderer === undefined
        ? { card_renderer: { $exists: false } }
        : { card_renderer: item.card_renderer };
    const itemUpdate: UpdateFilter<GameItem> = {
      $set: {
        level: nextItem.level,
        condition: nextItem.condition,
        mint: false,
        mint_value_multiplier: 1,
        values,
        reroll_cost: rerollCost,
      },
    };
    const result = await database.collection<GameItem>("items").findOneAndUpdate(
      {
        _id: item._id,
        owner: playerId,
        status: "claimed",
        level: item.level,
        condition: item.condition,
        mint: item.mint,
        mint_value_multiplier: item.mint_value_multiplier,
        ...rendererFilter,
      },
      itemUpdate,
      { returnDocument: "after" },
    );
    if (!result) {
      throw new Error("This item changed before the promotion could be applied.");
    }
    updatedItem = result;
  } catch (error) {
    await refundPlayer();
    console.error("Unable to promote item", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The promotion could not be applied.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    status: "ok",
    cost,
    discounted,
    item: sanitizePlayerFacingAuthenticity(updatedItem),
    karma: Math.max(0, Math.floor(chargedPlayer.profile.karma ?? 0)),
    message: `${artwork.title} reached Promotion Level ${updatedItem.level}${
      item.mint ? ", and its Mint status was removed" : ""
    }.`,
  });
}
