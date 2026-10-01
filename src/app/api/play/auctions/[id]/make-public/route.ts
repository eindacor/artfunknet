import { NextResponse } from "next/server";

import { getDisplayedArtworkEffect } from "@/server/artwork-effects";
import { makePrivateAuctionsPublic } from "@/server/auction-gameplay";
import {
  getTransferableAuctionCommissionCoefficient,
  MASTERPIECE_EFFECT_CODES,
} from "@/server/masterpiece-effects";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const database = await getDatabase();
  const effect = await getDisplayedArtworkEffect(
    database,
    auth.session.playerId,
    MASTERPIECE_EFFECT_CODES.transferableAuction,
  );
  if (!effect) {
    return NextResponse.json(
      { error: "The Public Commission effect is not active." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const commissionCoefficient =
    getTransferableAuctionCommissionCoefficient(effect);
  const convertedIds = await makePrivateAuctionsPublic(
    database,
    auth.session.playerId,
    [id],
    commissionCoefficient,
  );
  if (!convertedIds.includes(id)) {
    return NextResponse.json(
      { error: "This private auction is no longer available." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    status: "ok",
    madePublicAuctionId: id,
    commissionCoefficient,
    message: "Private auction converted to a public auction.",
  });
}
