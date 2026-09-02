import { NextResponse } from "next/server";
import type { UpdateFilter } from "mongodb";

import { getCardCosmetic } from "@/components/item-cards/catalog";
import {
  KNOWLEDGE_TYPES,
  type KnowledgeReward,
  type KnowledgeType,
} from "@/server/art-expert-gameplay";
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
  PRESERVATIONIST_ATTRIBUTE_ID,
} from "@/server/item-leveling";
import { getRerollCost } from "@/server/item-reroll";
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
    knowledge: Partial<Record<KnowledgeType, number>>;
    card_style_consumables?: Record<string, number>;
    last_activity: string;
  };
};

function normalizeKnowledge(
  knowledge: Partial<Record<KnowledgeType, number>>,
): KnowledgeReward {
  return Object.fromEntries(
    KNOWLEDGE_TYPES.map((type) => [
      type,
      Math.max(0, Math.floor(knowledge[type] ?? 0)),
    ]),
  ) as KnowledgeReward;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const database = await getDatabase();
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
      { error: "This item cannot currently be leveled up." },
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
  const cost = getItemLevelUpCost(artwork.rarity, item.level, discounted);
  const availableKnowledge = normalizeKnowledge(player.profile.knowledge);
  if (!canAffordItemLevelUp(availableKnowledge, cost)) {
    return NextResponse.json(
      { error: "You do not have enough Knowledge for this level up." },
      { status: 409 },
    );
  }

  const currentCosmetic = getCardCosmetic(item.card_renderer ?? "");
  const recoveredStyle =
    currentCosmetic && currentCosmetic.id !== "museum"
      ? currentCosmetic
      : undefined;
  const playerIncrements: Record<string, number> = Object.fromEntries([
    ...KNOWLEDGE_TYPES.map((type) => [
      `profile.knowledge.${type}`,
      -cost[type],
    ]),
    ...(recoveredStyle
      ? [[`profile.card_style_consumables.${recoveredStyle.id}`, 1]]
      : []),
  ]);
  const chargedPlayer = await database.collection<Player>("players").findOneAndUpdate(
    {
      _id: playerId,
      active: true,
      ...Object.fromEntries(
        KNOWLEDGE_TYPES.map((type) => [
          `profile.knowledge.${type}`,
          { $gte: cost[type] },
        ]),
      ),
    },
    {
      $inc: playerIncrements,
      $set: { "profile.last_activity": nowIso },
    },
    { returnDocument: "after" },
  );
  if (!chargedPlayer) {
    return NextResponse.json(
      { error: "Your Knowledge balance changed before the level up." },
      { status: 409 },
    );
  }

  async function refundPlayer() {
    const refundIncrements: Record<string, number> = Object.fromEntries([
      ...KNOWLEDGE_TYPES.map((type) => [
        `profile.knowledge.${type}`,
        cost[type],
      ]),
      ...(recoveredStyle
        ? [[`profile.card_style_consumables.${recoveredStyle.id}`, -1]]
        : []),
    ]);
    try {
      const refund = await database.collection<Player>("players").updateOne(
        { _id: playerId },
        { $inc: refundIncrements },
      );
      if (refund.modifiedCount !== 1) {
        console.error(
          `Level-up refund could not find player ${playerId}; manual reconciliation is required.`,
        );
      }
    } catch (refundError) {
      console.error(
        `Level-up refund failed for player ${playerId}; manual reconciliation is required.`,
        refundError,
      );
    }
  }

  let updatedItem: GameItem;
  try {
    const nextItem = {
      ...item,
      level: item.level + 1,
      condition: item.mint ? 1 : item.condition,
      mint: false,
      mint_value_multiplier: 1,
    };
    delete nextItem.card_renderer;
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
      $unset: { card_renderer: "" as const },
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
      throw new Error("This item changed before the level up could be applied.");
    }
    updatedItem = result;
  } catch (error) {
    await refundPlayer();
    console.error("Unable to level up item", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The level up could not be applied.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    status: "ok",
    cost,
    discounted,
    item: sanitizePlayerFacingAuthenticity(updatedItem),
    knowledge: normalizeKnowledge(chargedPlayer.profile.knowledge),
    recoveredStyle: recoveredStyle?.id,
    message: `${artwork.title} reached level ${updatedItem.level}${
      recoveredStyle
        ? `, and its ${recoveredStyle.name} style was recovered`
        : ""
    }${item.mint ? ", and its Mint status was removed" : ""}.`,
  });
}
