import { NextResponse } from "next/server";

import type { Auction } from "@/server/auction-gameplay";
import { getBulkDisposalPermission } from "@/server/bulk-sale";
import type { GameItem } from "@/server/gameplay";
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
  request: Request,
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
      { error: "This limited-access auction is no longer available." },
      { status: 409 },
    );
  }
  const item = await database.collection<GameItem>("items").findOne(
    { _id: auction.item_id },
  );
  if (item) {
    const bulkPermission = await getBulkDisposalPermission(database, auth.session.playerId, item, request);
    if (!bulkPermission.allowed) {
      return NextResponse.json({ error: bulkPermission.reason }, { status: 409 });
    }
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
      { error: "This limited-access auction could not be dismissed." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    status: "ok",
    dismissedAuctionId: auction._id,
    message: "Limited-access auction dismissed from Offers.",
  });
}
