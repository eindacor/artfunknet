import { NextResponse } from "next/server";

import {
  filterBulkLootCandidates,
  getFilteredBulkLootCandidates,
  parseBulkSaleProtections,
} from "@/server/bulk-sale";
import {
  type Auction,
} from "@/server/auction-gameplay";
import { deleteCommunityReactions } from "@/server/community-reaction-cleanup";
import type { GameItem } from "@/server/gameplay";
import { removeExpiredTransientItems } from "@/server/item-expiration";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type DeclineAllPlayer = {
  _id: string;
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
      { error: "The decline-all request is invalid." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  await removeExpiredTransientItems(database);
  const now = new Date().toISOString();
  const player = await database.collection<DeclineAllPlayer>("players").findOne(
    { _id: auth.session.playerId },
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
  const [dealerResult, privateAuctions] = await Promise.all([
    getFilteredBulkLootCandidates(
      database,
      auth.session.playerId,
      parseResult.protections,
      ["for_sale"],
    ),
    database
      .collection<Auction>("auctions")
      .find({
        viewer: auth.session.playerId,
        _id: { $nin: dismissedPrivateAuctionIds },
        expiration: { $gt: now },
        settlement_status: { $ne: "settling" },
      })
      .toArray(),
  ]);
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
  if (
    dealerResult.candidates.length === 0 &&
    privateResult.candidates.length === 0
  ) {
    return NextResponse.json(
      { error: "There are no dealer offers or private auctions to decline." },
      { status: 409 },
    );
  }
  if (dealerResult.items.length === 0 && privateResult.items.length === 0) {
    return NextResponse.json(
      {
        error:
          "No dealer offers or private auctions match the selected bulk-action options.",
      },
      { status: 409 },
    );
  }

  const itemIds = dealerResult.items.map((item) => item._id);
  const result = await database.collection<GameItem>("items").deleteMany({
    _id: { $in: itemIds },
    owner: auth.session.playerId,
    status: "for_sale",
  });
  const remainingIds =
    result.deletedCount === itemIds.length
      ? new Set<string>()
      : new Set(
          (
            await database
              .collection<GameItem>("items")
              .find({ _id: { $in: itemIds } })
              .project<Pick<GameItem, "_id">>({ _id: 1 })
              .toArray()
          ).map((item) => item._id),
        );
  const deletedIds = itemIds.filter((itemId) => !remainingIds.has(itemId));

  await deleteCommunityReactions(database, "item", deletedIds);

  const privateItemIds = new Set(privateResult.items.map((item) => item._id));
  const newlyDismissedPrivateAuctionIds = privateAuctions
    .filter((auction) => privateItemIds.has(auction.item_id))
    .map((auction) => auction._id);
  if (newlyDismissedPrivateAuctionIds.length > 0) {
    const dismissed = await database
      .collection<DeclineAllPlayer>("players")
      .updateOne(
        { _id: auth.session.playerId },
        {
          $addToSet: {
            "profile.dismissed_private_auction_ids": {
              $each: newlyDismissedPrivateAuctionIds,
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
  }

  const declined =
    result.deletedCount + newlyDismissedPrivateAuctionIds.length;
  return NextResponse.json({
    status: "ok",
    declined,
    declinedPrivateAuctionIds: newlyDismissedPrivateAuctionIds,
    message: `${declined} ${
      declined === 1 ? "offer was" : "offers were"
    } declined.`,
  });
}
