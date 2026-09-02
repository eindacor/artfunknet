import { NextResponse } from "next/server";

import {
  createAuction,
  PUBLIC_AUCTION_DURATIONS,
  settleExpiredAuctions,
} from "@/server/auction-gameplay";
import { transferForgeryLiability } from "@/server/forgery-gameplay";
import type { GameItem } from "@/server/gameplay";
import { hydrateGameItems } from "@/server/item-artwork";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type Player = {
  _id: string;
  screen_name: string;
  active: boolean;
  profile: {
    auction_cap: number;
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
    startingBid?: unknown;
    buyNow?: unknown;
    durationMinutes?: unknown;
  } | null;
  const startingBid = Number(body?.startingBid);
  const buyNow =
    body?.buyNow === null || body?.buyNow === "" || body?.buyNow === undefined
      ? null
      : Number(body.buyNow);
  const durationMinutes = Number(body?.durationMinutes);
  if (
    !Number.isSafeInteger(startingBid) ||
    startingBid < 0 ||
    (buyNow !== null &&
      (!Number.isSafeInteger(buyNow) || buyNow < startingBid)) ||
    !PUBLIC_AUCTION_DURATIONS.includes(
      durationMinutes as (typeof PUBLIC_AUCTION_DURATIONS)[number],
    )
  ) {
    return NextResponse.json(
      { error: "Enter valid whole-dollar prices and an auction duration." },
      { status: 400 },
    );
  }

  const { id } = await params;
  const database = await getDatabase();
  await settleExpiredAuctions(database);
  const [player, item] = await Promise.all([
    database.collection<Player>("players").findOne({
      _id: auth.session.playerId,
      active: true,
    }),
    database.collection<GameItem>("items").findOne({
      _id: id,
      owner: auth.session.playerId,
      status: "claimed",
      permanent: { $ne: true },
      repairing: { $ne: true },
    }),
  ]);
  if (!player || !item) {
    return NextResponse.json(
      { error: "This artwork cannot currently be auctioned." },
      { status: 409 },
    );
  }
  if (startingBid < item.values.auction_min) {
    return NextResponse.json(
      {
        error: `The starting price must be at least $${item.values.auction_min.toLocaleString()}.`,
      },
      { status: 400 },
    );
  }
  if (buyNow !== null && buyNow < item.values.auction_min) {
    return NextResponse.json(
      {
        error: `The buy-now price must be at least $${item.values.auction_min.toLocaleString()}.`,
      },
      { status: 400 },
    );
  }

  const marketExpert =
    new Date(player.profile.market_expert?.expiration ?? 0).getTime() >
    Date.now();
  const cap = Math.floor(player.profile.auction_cap * (marketExpert ? 1.5 : 1));
  const activeCount = await database.collection("auctions").countDocuments({
    seller_id: player._id,
    expiration: { $gt: new Date().toISOString() },
    settlement_status: { $ne: "settling" },
  });
  if (activeCount >= cap) {
    return NextResponse.json(
      { error: `You may only run ${cap} auctions at once.` },
      { status: 409 },
    );
  }

  await transferForgeryLiability(database, item, player._id);
  const reserved = await database.collection<GameItem>("items").updateOne(
    {
      _id: item._id,
      owner: player._id,
      status: "claimed",
      permanent: { $ne: true },
      repairing: { $ne: true },
    },
    {
      $set: { status: "auctioned" },
      $pull: { tags: "for sale" },
    },
  );
  if (reserved.modifiedCount !== 1) {
    return NextResponse.json(
      { error: "This artwork changed before the auction was created." },
      { status: 409 },
    );
  }

  try {
    const [hydrated] = await hydrateGameItems(database, [item]);
    const auction = await createAuction(database, hydrated, {
      sellerId: player._id,
      sellerName: player.screen_name,
      startingBid,
      buyNow,
      durationMinutes,
    });
    await database.collection<Player>("players").updateOne(
      { _id: player._id },
      { $set: { "profile.last_activity": new Date().toISOString() } },
    );
    return NextResponse.json({
      status: "ok",
      auctionId: auction._id,
      message: `${hydrated.artwork.title} is now up for auction.`,
    });
  } catch (error) {
    await database.collection<GameItem>("items").updateOne(
      { _id: item._id, owner: player._id, status: "auctioned" },
      { $set: { status: "claimed" } },
    );
    console.error("Unable to create auction", error);
    return NextResponse.json(
      { error: "The auction could not be created." },
      { status: 500 },
    );
  }
}
