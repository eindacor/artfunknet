import { NextResponse } from "next/server";
import { recordEconomyMetricsSafely } from "@/server/economy-metrics";

import {
  calculateAuthenticationCost,
  getAuthenticationPermission,
} from "@/server/forgery-gameplay";
import type { GameItem } from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type Player = {
  _id: string;
  active: boolean;
  profile: { bank_balance: number; last_activity?: string };
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const database = await getDatabase();
  const item = await database.collection<GameItem>("items").findOne({ _id: id });
  if (!item) {
    return NextResponse.json({ error: "Artwork not found." }, { status: 404 });
  }
  const permission = getAuthenticationPermission(
    item,
    auth.session.playerId,
  );
  if (!permission.allowed) {
    return NextResponse.json({ error: permission.reason }, { status: 409 });
  }
  const cost = calculateAuthenticationCost(item.authenticity.fee);
  const charged = await database.collection<Player>("players").updateOne(
    {
      _id: auth.session.playerId,
      active: true,
      "profile.bank_balance": { $gte: cost },
    },
    {
      $inc: { "profile.bank_balance": -cost },
      $set: { "profile.last_activity": new Date().toISOString() },
    },
  );
  if (charged.modifiedCount !== 1) {
    return NextResponse.json(
      {
        error: `You need $${cost.toLocaleString()} to authenticate this artwork.`,
      },
      { status: 409 },
    );
  }
  const authenticated = await database.collection<GameItem>("items").updateOne(
    {
      _id: id,
      owner: auth.session.playerId,
      status: "claimed",
      "authenticity.identified": false,
    },
    { $set: { "authenticity.identified": true } },
  );
  if (authenticated.modifiedCount !== 1) {
    await database.collection<Player>("players").updateOne(
      { _id: auth.session.playerId },
      { $inc: { "profile.bank_balance": cost } },
    );
    return NextResponse.json(
      { error: "The artwork changed before it could be authenticated." },
      { status: 409 },
    );
  }
  await recordEconomyMetricsSafely(database, {
    amount: cost,
    currency: "money",
    direction: "spent",
    source: "authentication",
  });
  return NextResponse.json({
    status: "ok",
    cost,
    forgery: item.authenticity.forgery,
    message: item.authenticity.forgery
      ? `Authentication confirmed a forgery ($${cost.toLocaleString()} fee).`
      : `Authentication confirmed legitimate artwork ($${cost.toLocaleString()} fee).`,
    ...(!item.authenticity.forgery
      ? {
          actionDialog: {
            variant: "authenticated",
            title: "This item was successfully authenticated!",
            message: `The artwork is genuine. The $${cost.toLocaleString()} authentication fee was charged.`,
          },
        }
      : {}),
  });
}
