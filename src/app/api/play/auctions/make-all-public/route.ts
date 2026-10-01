import { NextResponse } from "next/server";

import { getDisplayedArtworkEffect } from "@/server/artwork-effects";
import {
  makePrivateAuctionsPublic,
  type Auction,
} from "@/server/auction-gameplay";
import {
  filterBulkLootCandidates,
  parseBulkSaleProtections,
} from "@/server/bulk-sale";
import type { GameItem } from "@/server/gameplay";
import {
  getTransferableAuctionCommissionCoefficient,
  MASTERPIECE_EFFECT_CODES,
} from "@/server/masterpiece-effects";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type TransferableAuctionPlayer = {
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
      { error: "The make-all-public request is invalid." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const [player, effect] = await Promise.all([
    database.collection<TransferableAuctionPlayer>("players").findOne(
      { _id: auth.session.playerId, active: true },
      { projection: { "profile.dismissed_private_auction_ids": 1 } },
    ),
    getDisplayedArtworkEffect(
      database,
      auth.session.playerId,
      MASTERPIECE_EFFECT_CODES.transferableAuction,
    ),
  ]);
  if (!player) {
    return NextResponse.json(
      { error: "The active player could not be found." },
      { status: 409 },
    );
  }
  if (!effect) {
    return NextResponse.json(
      { error: "The Public Commission effect is not active." },
      { status: 403 },
    );
  }

  const dismissedIds = player.profile?.dismissed_private_auction_ids ?? [];
  const privateAuctions = await database
    .collection<Auction>("auctions")
    .find({
      viewer: auth.session.playerId,
      _id: { $nin: dismissedIds },
      expiration: { $gt: new Date().toISOString() },
      settlement_status: { $ne: "settling" },
    })
    .toArray();
  const privateItems = privateAuctions.length
    ? await database
        .collection<GameItem>("items")
        .find({
          _id: { $in: privateAuctions.map((auction) => auction.item_id) },
          status: "auctioned",
        })
        .toArray()
    : [];
  const filtered = await filterBulkLootCandidates(
    database,
    auth.session.playerId,
    parseResult.protections,
    privateItems,
  );
  if (filtered.candidates.length === 0) {
    return NextResponse.json(
      { error: "There are no private auctions to make public." },
      { status: 409 },
    );
  }
  if (filtered.items.length === 0) {
    return NextResponse.json(
      {
        error: "No private auctions match the selected bulk-action options.",
      },
      { status: 409 },
    );
  }

  const eligibleItemIds = new Set(filtered.items.map((item) => item._id));
  const eligibleAuctionIds = privateAuctions
    .filter((auction) => eligibleItemIds.has(auction.item_id))
    .map((auction) => auction._id);
  const commissionCoefficient =
    getTransferableAuctionCommissionCoefficient(effect);
  const madePublicAuctionIds = await makePrivateAuctionsPublic(
    database,
    auth.session.playerId,
    eligibleAuctionIds,
    commissionCoefficient,
  );
  if (madePublicAuctionIds.length === 0) {
    return NextResponse.json(
      { error: "The private auctions could not be made public." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    status: "ok",
    madePublic: madePublicAuctionIds.length,
    madePublicAuctionIds,
    commissionCoefficient,
    message: `${madePublicAuctionIds.length} private ${
      madePublicAuctionIds.length === 1 ? "auction was" : "auctions were"
    } made public.`,
  });
}
