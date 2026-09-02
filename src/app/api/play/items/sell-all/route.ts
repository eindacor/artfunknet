import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import type { GameItem } from "@/server/gameplay";
import {
  getDisplayedLegendaryEffect,
  getLegendaryNumberParameter,
} from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

export async function POST() {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;
  const database = await getDatabase();
  await recoverPendingSales(database, auth.session.playerId);
  const items = await database.collection<GameItem>("items").find({
    owner: auth.session.playerId,
    status: "unclaimed",
    permanent: { $ne: true },
    original: { $ne: true },
  }).toArray();
  if (items.length === 0) {
    return NextResponse.json(
      { error: "There is no sellable unclaimed loot." },
      { status: 409 },
    );
  }
  const saleBonus = await getDisplayedLegendaryEffect(
    database,
    auth.session.playerId,
    "UNCLAIMED_ITEM_SELL_BONUS",
  );
  const multiplier = getLegendaryNumberParameter(
    saleBonus,
    "sell_multiplier",
    1,
  );
  const amount = items.reduce(
    (sum, item) => sum + Math.floor(item.values.sell * multiplier),
    0,
  );
  const ids = items.map((item) => item._id);
  const operationId = randomUUID();
  let credited = false;
  const reserved = await database.collection<GameItem>("items").updateMany(
    {
      _id: { $in: ids },
      owner: auth.session.playerId,
      status: "unclaimed",
    },
    {
      $set: {
        status: "bulk_sale_pending",
        bulk_sale_operation: operationId,
      },
    },
  );
  if (reserved.modifiedCount !== items.length) {
    await database.collection<GameItem>("items").updateMany(
      {
        _id: { $in: ids },
        owner: auth.session.playerId,
        status: "bulk_sale_pending",
      },
      {
        $set: { status: "unclaimed" },
        $unset: { bulk_sale_operation: "" },
      },
    );
    return NextResponse.json(
      { error: "The loot changed before it could all be sold." },
      { status: 409 },
    );
  }
  try {
    const credit = await database.collection<{
      _id: string;
      active: boolean;
      profile: {
        bank_balance: number;
        last_activity: string;
        bulk_sale_operations?: string[];
      };
    }>("players").updateOne(
      {
        _id: auth.session.playerId,
        active: true,
        "profile.bulk_sale_operations": { $ne: operationId },
      },
      {
        $inc: { "profile.bank_balance": amount },
        $set: { "profile.last_activity": new Date().toISOString() },
        $addToSet: { "profile.bulk_sale_operations": operationId },
      },
    );
    if (credit.modifiedCount !== 1) {
      throw new Error("The bulk sale could not be credited.");
    }
    credited = true;
    const removed = await database.collection<GameItem>("items").deleteMany({
      _id: { $in: ids },
      owner: auth.session.playerId,
      status: "bulk_sale_pending",
      bulk_sale_operation: operationId,
    });
    if (removed.deletedCount !== items.length) {
      throw new Error("The bulk sale cleanup was incomplete.");
    }
  } catch (error) {
    if (!credited) {
      const player = await database.collection<{
        _id: string;
        profile: { bulk_sale_operations?: string[] };
      }>("players").findOne({ _id: auth.session.playerId });
      credited =
        player?.profile.bulk_sale_operations?.includes(operationId) ?? false;
    }
    if (credited) {
      await database.collection<GameItem>("items").deleteMany({
        owner: auth.session.playerId,
        status: "bulk_sale_pending",
        bulk_sale_operation: operationId,
      });
    } else {
      await database.collection<GameItem>("items").updateMany(
        {
          owner: auth.session.playerId,
          status: "bulk_sale_pending",
          bulk_sale_operation: operationId,
        },
        {
          $set: { status: "unclaimed" },
          $unset: { bulk_sale_operation: "" },
        },
      );
    }
    console.error("Unable to complete bulk loot sale", error);
    return NextResponse.json(
      {
        error: credited
          ? "The sale was credited, but cleanup had to be recovered."
          : "The bulk sale could not be completed.",
      },
      { status: 500 },
    );
  }
  return NextResponse.json({
    status: "ok",
    amount,
    message: `Sold ${items.length} unclaimed ${items.length === 1 ? "artwork" : "artworks"} for $${amount.toLocaleString()}.`,
  });
}

async function recoverPendingSales(
  database: Awaited<ReturnType<typeof getDatabase>>,
  playerId: string,
) {
  const pending = await database.collection<GameItem>("items").find({
    owner: playerId,
    status: "bulk_sale_pending",
    bulk_sale_operation: { $type: "string" },
  }).toArray();
  if (pending.length === 0) return;
  const player = await database.collection<{
    _id: string;
    profile: { bulk_sale_operations?: string[] };
  }>("players").findOne({ _id: playerId });
  const credited = new Set(player?.profile.bulk_sale_operations ?? []);
  for (const operationId of new Set(
    pending
      .map((item) => item.bulk_sale_operation)
      .filter((id): id is string => Boolean(id)),
  )) {
    if (credited.has(operationId)) {
      await database.collection<GameItem>("items").deleteMany({
        owner: playerId,
        status: "bulk_sale_pending",
        bulk_sale_operation: operationId,
      });
    } else {
      await database.collection<GameItem>("items").updateMany(
        {
          owner: playerId,
          status: "bulk_sale_pending",
          bulk_sale_operation: operationId,
        },
        {
          $set: { status: "unclaimed" },
          $unset: { bulk_sale_operation: "" },
        },
      );
    }
  }
}
