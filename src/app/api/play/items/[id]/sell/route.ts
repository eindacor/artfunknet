import { NextResponse } from "next/server";

import type { GameItem } from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type Player = {
  _id: string;
  active: boolean;
  profile: {
    bank_balance: number;
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
  const item = await database.collection<GameItem>("items").findOneAndDelete({
    _id: id,
    owner: auth.session.playerId,
    status: { $in: ["claimed", "unclaimed"] },
    permanent: { $ne: true },
    original: { $ne: true },
  });
  if (!item) {
    return NextResponse.json(
      { error: "This item cannot currently be sold." },
      { status: 409 },
    );
  }

  const result = await database.collection<Player>("players").updateOne(
    { _id: auth.session.playerId, active: true },
    {
      $inc: { "profile.bank_balance": item.values.sell },
      $set: { "profile.last_activity": new Date().toISOString() },
    },
  );
  if (result.modifiedCount !== 1) {
    await database.collection<GameItem>("items").insertOne(item);
    return NextResponse.json(
      { error: "The sale could not be applied to your account." },
      { status: 500 },
    );
  }

  return NextResponse.json({ status: "ok", amount: item.values.sell });
}
