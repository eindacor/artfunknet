import { NextResponse } from "next/server";
import { recordEconomyMetricsSafely } from "@/server/economy-metrics";

import {
  calculateItemValues,
  rollAttributeValue,
  type Artwork,
  type GameItem,
  type ItemAttribute,
  type LootData,
} from "@/server/gameplay";
import {
  findAttributeType,
  getRerollCost,
  getRerollMinimum,
} from "@/server/item-reroll";
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
    bank_balance: number;
    last_activity: string;
  };
};

type RerollRequest = {
  mode?: unknown;
  attributeId?: unknown;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as RerollRequest;
  if (
    (body.mode !== "value" && body.mode !== "attribute") ||
    typeof body.attributeId !== "string" ||
    body.attributeId.length === 0
  ) {
    return NextResponse.json(
      { error: "A valid reroll mode and attribute are required." },
      { status: 400 },
    );
  }

  const { id } = await params;
  const database = await getDatabase();
  const [item, player, metadata, rerollDiscount] = await Promise.all([
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
      "REROLL_DISCOUNT",
    ),
  ]);

  if (!item || !player) {
    return NextResponse.json(
      { error: "This item cannot currently be rerolled." },
      { status: 409 },
    );
  }
  if (!metadata) {
    return NextResponse.json(
      { error: "Loot metadata is not configured." },
      { status: 500 },
    );
  }
  const attributeType = findAttributeType(item, body.attributeId);
  if (!attributeType) {
    return NextResponse.json(
      { error: "That attribute is no longer on this item." },
      { status: 409 },
    );
  }
  if (body.mode === "attribute" && attributeType !== "unlocked") {
    return NextResponse.json(
      { error: "Only unlocked attributes can be replaced." },
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

  const costMultiplier = getLegendaryNumberParameter(
    rerollDiscount,
    "cost_multiplier",
    1,
  );
  const cost = Math.max(
    0,
    Math.floor(
      getRerollCost(item, artwork.rarity, metadata.loot_data) * costMultiplier,
    ),
  );
  const now = new Date().toISOString();
  const chargedPlayer = await database.collection<Player>("players").findOneAndUpdate(
    {
      _id: player._id,
      active: true,
      "profile.bank_balance": { $gte: cost },
    },
    {
      $inc: { "profile.bank_balance": -cost },
      $set: { "profile.last_activity": now },
    },
    { returnDocument: "after" },
  );
  if (!chargedPlayer) {
    return NextResponse.json(
      { error: "You do not have enough money for this reroll." },
      { status: 409 },
    );
  }

  let responseItem: GameItem;
  try {
    const attributes = structuredClone(item.attributes);
    const targetIndex = attributes[attributeType].findIndex(
      (attribute) => attribute._id === body.attributeId,
    );
    const minimum = getRerollMinimum(item, attributeType);

    if (body.mode === "value") {
      attributes[attributeType][targetIndex].value =
        rollAttributeValue(minimum);
    } else {
      const excludedIds = Object.values(attributes)
        .flat()
        .map((attribute) => attribute._id);
      const [replacement] = await database
        .collection<ItemAttribute>("attributes")
        .aggregate<ItemAttribute>([
          { $match: { _id: { $nin: excludedIds }, active: true } },
          { $sample: { size: 1 } },
        ])
        .toArray();
      if (!replacement) {
        throw new Error("No unused active attributes are available.");
      }
      attributes.unlocked[targetIndex] = {
        ...replacement,
        value: rollAttributeValue(getRerollMinimum(item, "unlocked")),
      };
    }

    const nextItem = {
      ...item,
      attributes,
      roll_count: item.roll_count + 1,
      reroll_spent: (item.reroll_spent ?? 0) + cost,
      condition: item.mint ? 1 : item.condition,
      mint: false,
      mint_value_multiplier: 1,
    };
    const itemArtwork = { ...artwork, ...item.artwork_overrides };
    const values = calculateItemValues(
      nextItem,
      itemArtwork,
      metadata.loot_data,
    );
    const baseRerollCost = getRerollCost(
      nextItem,
      artwork.rarity,
      metadata.loot_data,
    );
    const rerollCost = Math.max(
      0,
      Math.floor(baseRerollCost * costMultiplier),
    );
    responseItem = {
      ...nextItem,
      values,
      reroll_cost: rerollCost,
    };
    const result = await database.collection<GameItem>("items").updateOne(
      {
        _id: item._id,
        owner: player._id,
        status: item.status,
        mint: item.mint,
        roll_count: item.roll_count,
        [`attributes.${attributeType}._id`]: body.attributeId,
      },
      {
        $set: {
          attributes,
          condition: nextItem.condition,
          mint: false,
          mint_value_multiplier: 1,
          values,
          reroll_cost: baseRerollCost,
        },
        $inc: { roll_count: 1, reroll_spent: cost },
      },
    );
    if (result.modifiedCount !== 1) {
      throw new Error("This item changed before the reroll could be applied.");
    }
  } catch (error) {
    try {
      const refund = await database.collection<Player>("players").updateOne(
        { _id: player._id },
        { $inc: { "profile.bank_balance": cost } },
      );
      if (refund.matchedCount !== 1) {
        console.error(
          `Reroll refund could not find player ${player._id}; manual reconciliation of $${cost} is required.`,
        );
      }
    } catch (refundError) {
      console.error(
        `Reroll refund failed for player ${player._id}; manual reconciliation of $${cost} is required.`,
        refundError,
      );
    }
    console.error("Unable to reroll item", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "The reroll failed.",
      },
      { status: 409 },
    );
  }

  await recordEconomyMetricsSafely(database, {
    amount: cost,
    currency: "money",
    direction: "spent",
    source: "reroll",
  });
  return NextResponse.json({
    status: "ok",
    cost,
    bankBalance: chargedPlayer.profile.bank_balance,
    item: sanitizePlayerFacingAuthenticity(responseItem),
  });
}
