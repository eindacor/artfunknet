import { NextResponse } from "next/server";

import type { GameItem } from "@/server/gameplay";
import {
  getDisplayedLegendaryEffect,
  getLegendaryNumberParameter,
} from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import {
  getUnexpiredItemFilter,
  removeExpiredTransientItems,
} from "@/server/item-expiration";
import { requirePlayerApi } from "@/server/player-api";

type Player = {
  _id: string;
  active: boolean;
  profile: {
    bank_balance: number;
    inventory_cap: number;
    expansion_slots: number;
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
  const expirationNow = new Date();
  await removeExpiredTransientItems(database, expirationNow);
  const unexpiredFilter = getUnexpiredItemFilter(expirationNow);
  const [player, item, discountEffect, rollCountEffect] = await Promise.all([
    database.collection<Player>("players").findOne({
      _id: auth.session.playerId,
      active: true,
    }),
    database.collection<GameItem>("items").findOne({
      _id: id,
      owner: auth.session.playerId,
      status: "for_sale",
      ...unexpiredFilter,
    }),
    getDisplayedLegendaryEffect(
      database,
      auth.session.playerId,
      "DEALER_DISCOUNT",
    ),
    getDisplayedLegendaryEffect(
      database,
      auth.session.playerId,
      "DEALER_PURCHASE_ROLL_COUNT_SET",
    ),
  ]);
  if (!player || !item) {
    return NextResponse.json(
      { error: "This dealer offer is no longer available." },
      { status: 409 },
    );
  }

  const inventoryCount = await database
    .collection<GameItem>("items")
    .countDocuments({
      owner: player._id,
      status: { $in: ["claimed", "displayed"] },
      original: { $ne: true },
      vintage: { $ne: true },
    });
  const capacity =
    player.profile.inventory_cap + player.profile.expansion_slots;
  if (inventoryCount >= capacity && !item.original && !item.vintage) {
    return NextResponse.json(
      { error: "Your inventory is currently full." },
      { status: 409 },
    );
  }

  const amount = Math.floor(
    item.values.dealer *
      getLegendaryNumberParameter(
        discountEffect,
        "cost_multiplier",
        1,
      ),
  );
  const now = new Date().toISOString();
  const chargedPlayer = await database.collection<Player>("players").findOneAndUpdate(
    {
      _id: player._id,
      active: true,
      "profile.bank_balance": { $gte: amount },
    },
    {
      $inc: { "profile.bank_balance": -amount },
      $set: { "profile.last_activity": now },
    },
    { returnDocument: "after" },
  );
  if (!chargedPlayer) {
    return NextResponse.json(
      { error: "You do not have enough money for this artwork." },
      { status: 409 },
    );
  }

  const setter: Partial<GameItem> = {
    status: "claimed",
    date_received: now,
  };
  if (rollCountEffect) {
    setter.roll_count = Math.floor(
      getLegendaryNumberParameter(rollCountEffect, "roll_count", -20),
    );
  }
  const result = await database.collection<GameItem>("items").updateOne(
    {
      _id: item._id,
      owner: player._id,
      status: "for_sale",
      ...unexpiredFilter,
    },
    { $set: setter, $unset: { expires_at: "" } },
  );
  if (result.modifiedCount !== 1) {
    const refund = await database
      .collection<Player>("players")
      .updateOne(
        { _id: player._id },
        { $inc: { "profile.bank_balance": amount } },
      );
    if (refund.modifiedCount !== 1) {
      console.error(
        `Dealer purchase refund failed for player ${player._id}; manual reconciliation of $${amount} is required.`,
      );
    }
    return NextResponse.json(
      { error: "This dealer offer changed before it could be purchased." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    status: "ok",
    amount,
    bankBalance: chargedPlayer.profile.bank_balance,
    message: `Purchased artwork for $${amount.toLocaleString()}.`,
  });
}
