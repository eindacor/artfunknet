import { NextResponse } from "next/server";

import type { Auction } from "@/server/auction-gameplay";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type AuctionDismissalPlayer = {
  _id: string;
  active: boolean;
  profile: {
    dismissed_private_auction_ids?: string[];
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
  const auction = await database.collection<Auction>("auctions").findOne({
    _id: id,
    viewer: auth.session.playerId,
    expiration: { $gt: new Date().toISOString() },
    settlement_status: { $ne: "settling" },
  });
  if (!auction) {
    return NextResponse.json(
      { error: "This private auction is no longer available." },
      { status: 409 },
    );
  }

  const dismissed = await database
    .collection<AuctionDismissalPlayer>("players")
    .updateOne(
      { _id: auth.session.playerId, active: true },
      {
        $addToSet: {
          "profile.dismissed_private_auction_ids": auction._id,
        },
      },
    );
  if (dismissed.matchedCount !== 1) {
    return NextResponse.json(
      { error: "This private auction could not be dismissed." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    status: "ok",
    dismissedAuctionId: auction._id,
    message: "Private auction dismissed from Loot.",
  });
}
