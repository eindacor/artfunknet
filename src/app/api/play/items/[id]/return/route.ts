import { NextResponse } from "next/server";

import { returnAuctionForgery } from "@/server/auction-forgery-return";
import { getGameplaySettings } from "@/server/game-settings";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const database = await getDatabase();
  const settings = await getGameplaySettings(database);
  const result = await returnAuctionForgery(database, auth.session.playerId, id, settings.active);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    status: "ok",
    refund: result.refund,
    message: `Forgery returned. You received a $${result.refund.toLocaleString()} refund of the $${result.purchasePrice.toLocaleString()} auction price.`,
  });
}
