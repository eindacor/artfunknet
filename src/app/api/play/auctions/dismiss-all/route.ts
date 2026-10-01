import { NextResponse } from "next/server";

import {
  filterBulkLootCandidates,
  parseBulkSaleProtections,
} from "@/server/bulk-sale";
import { type Auction } from "@/server/auction-gameplay";
import type { GameItem } from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type DismissAllPlayer = {
  _id: string;
  active: boolean;
  profile?: {
    dismissed_private_auction_ids?: string[];
  };
};

export async function POST(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const rawBody = await request.text().catch(() => "");
  const parseResult = parseBulkSaleProtections(rawBody);
  if (!parseResult.ok) {
    return NextResponse.json(
      { error: "The dismiss-all request is invalid." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const now = new Date().toISOString();
  const player = await database.collection<DismissAllPlayer>("players").findOne(
    { _id: auth.session.playerId, active: true },
    { projection: { "profile.dismissed_private_auction_ids": 1 } },
  );
  if (!player) {
    return NextResponse.json(
      { error: "The active player could not be found." },
      { status: 409 },
    );
  }
  const dismissedPrivateAuctionIds =
    player.profile?.dismissed_private_auction_ids ?? [];
  const privateAuctions = await database
    .collection<Auction>("auctions")
    .find({
      viewer: auth.session.playerId,
      _id: { $nin: dismissedPrivateAuctionIds },
      expiration: { $gt: now },
      settlement_status: { $ne: "settling" },
    })
    .toArray();
  const privateAuctionItems = privateAuctions.length
    ? await database
        .collection<GameItem>("items")
        .find({
          _id: { $in: privateAuctions.map((auction) => auction.item_id) },
          status: "auctioned",
        })
        .toArray()
    : [];
  const privateResult = await filterBulkLootCandidates(
    database,
    auth.session.playerId,
    parseResult.protections,
    privateAuctionItems,
  );
  if (privateResult.candidates.length === 0) {
    return NextResponse.json(
      { error: "There are no private auctions to dismiss." },
      { status: 409 },
    );
  }
  if (privateResult.items.length === 0) {
    return NextResponse.json(
      {
        error: "No private auctions match the selected bulk-action options.",
      },
      { status: 409 },
    );
  }

  const privateItemIds = new Set(privateResult.items.map((item) => item._id));
  const dismissedAuctionIds = privateAuctions
    .filter((auction) => privateItemIds.has(auction.item_id))
    .map((auction) => auction._id);

  const dismissed = await database
    .collection<DismissAllPlayer>("players")
    .updateOne(
      { _id: auth.session.playerId, active: true },
      {
        $addToSet: {
          "profile.dismissed_private_auction_ids": {
            $each: dismissedAuctionIds,
          },
        },
      },
    );
  if (dismissed.matchedCount !== 1) {
    return NextResponse.json(
      { error: "The private auctions could not be dismissed." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    status: "ok",
    dismissed: dismissedAuctionIds.length,
    dismissedPrivateAuctionIds: dismissedAuctionIds,
    message: `${dismissedAuctionIds.length} private ${
      dismissedAuctionIds.length === 1 ? "auction was" : "auctions were"
    } dismissed.`,
  });
}
