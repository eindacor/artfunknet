import { NextResponse } from "next/server";

import {
  type Auction,
  settleAuction,
  settleExpiredAuctions,
  validateBidder,
} from "@/server/auction-gameplay";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import { createPlayerNotification } from "@/server/player-notifications";

type Player = {
  _id: string;
  screen_name: string;
  active: boolean;
  profile: {
    bank_balance: number;
    level: number;
    auction_cap: number;
    inventory_cap: number;
    expansion_slots?: number;
    vintage_count?: number;
    market_expert?: { expiration?: string };
  };
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as {
    amount?: unknown;
    buyNow?: unknown;
  } | null;
  const requestedAmount = Number(body?.amount);
  const buyingNow = body?.buyNow === true;
  const { id } = await params;
  const database = await getDatabase();
  await settleExpiredAuctions(database);
  const [player, auction] = await Promise.all([
    database.collection<Player>("players").findOne({
      _id: auth.session.playerId,
      active: true,
    }),
    database.collection<Auction>("auctions").findOne({
      _id: id,
      expiration: { $gt: new Date().toISOString() },
    }),
  ]);
  if (!player || !auction) {
    return NextResponse.json(
      { error: "This auction is no longer available." },
      { status: 409 },
    );
  }
  const permissionError = await validateBidder(database, player, auction);
  if (permissionError) {
    return NextResponse.json({ error: permissionError }, { status: 409 });
  }
  const amount = buyingNow ? auction.buy_now : requestedAmount;
  if (
    amount === null ||
    !Number.isSafeInteger(amount) ||
    amount < auction.minimum_bid
  ) {
    return NextResponse.json(
      {
        error: `Your bid must be at least $${auction.minimum_bid.toLocaleString()}.`,
      },
      { status: 400 },
    );
  }
  if (buyingNow && auction.buy_now === null) {
    return NextResponse.json(
      { error: "This auction does not have a buy-now price." },
      { status: 400 },
    );
  }

  const sameWinner = auction.current_winner_id === player._id;
  const charge = sameWinner ? amount - auction.current_bid : amount;
  const bidTime = new Date().toISOString();
  const charged = await database.collection<Player>("players").findOneAndUpdate(
    {
      _id: player._id,
      active: true,
      "profile.bank_balance": { $gte: charge },
    },
    {
      $inc: { "profile.bank_balance": -charge },
      $set: { "profile.last_activity": bidTime },
    },
    { returnDocument: "after" },
  );
  if (!charged) {
    return NextResponse.json(
      { error: "You do not have enough available money for that bid." },
      { status: 409 },
    );
  }

  const nextExpiration = buyingNow ? new Date().toISOString() : auction.expiration;
  const updated = await database.collection<Auction>("auctions").updateOne(
    {
      _id: auction._id,
      current_bid: auction.current_bid,
      current_winner_id: auction.current_winner_id,
      expiration: { $gt: bidTime },
      settlement_status: { $ne: "settling" },
    },
    {
      $set: {
        current_bid: amount,
        minimum_bid: amount + auction.increment,
        current_winner_id: player._id,
        current_winner_name: player.screen_name,
        has_bid: true,
        expiration: nextExpiration,
      },
    },
  );
  if (updated.modifiedCount !== 1) {
    await database.collection<Player>("players").updateOne(
      { _id: player._id },
      { $inc: { "profile.bank_balance": charge } },
    );
    return NextResponse.json(
      { error: "Another bid arrived first. Refresh and try again." },
      { status: 409 },
    );
  }

  if (auction.current_winner_id && !sameWinner) {
    await database.collection<Player>("players").updateOne(
      { _id: auction.current_winner_id },
      { $inc: { "profile.bank_balance": auction.current_bid } },
    );
    await createPlayerNotification(database, auction.current_winner_id, {
      kind: "warning",
      message: `You were outbid on ${auction.item_snapshot.title}.`,
      dedupeUnread: false,
    });
  }

  if (buyingNow) {
    const settled = await settleAuction(database, {
      ...auction,
      current_bid: amount,
      minimum_bid: amount + auction.increment,
      current_winner_id: player._id,
      current_winner_name: player.screen_name,
      has_bid: true,
      expiration: nextExpiration,
    });
    if (!settled) {
      return NextResponse.json(
        {
          error:
            "Your purchase was recorded, but final settlement is still pending.",
        },
        { status: 503 },
      );
    }
  }

  return NextResponse.json({
    status: "ok",
    bankBalance: charged.profile.bank_balance,
    message: buyingNow
      ? `Purchased ${auction.item_snapshot.title} for $${amount.toLocaleString()}.`
      : `Bid $${amount.toLocaleString()} on ${auction.item_snapshot.title}.`,
  });
}
