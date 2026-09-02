import { NextResponse } from "next/server";
import { AUCTION_HOUSE_OWNER_ID } from "@/server/auction-gameplay";
import {
  awardForgeryXpChunk,
  getRedemptionPermission,
  punishForgeryQuality,
} from "@/server/forgery-gameplay";
import type { GameItem } from "@/server/gameplay";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import { createPlayerNotification } from "@/server/player-notifications";

type Player = {
  _id: string;
  active: boolean;
  profile: { bank_balance: number; level: number; xp: number; lottery_tickets: number };
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const database = await getDatabase();
  const item = await database.collection<GameItem>("items").findOne({ _id: id });
  if (!item) return NextResponse.json({ error: "Artwork not found." }, { status: 404 });
  const permission = getRedemptionPermission(item, auth.session.playerId);
  if (!permission.allowed) return NextResponse.json({ error: permission.reason }, { status: 409 });

  if (!item.authenticity.forgery) {
    const result = await database.collection<GameItem>("items").updateOne(
      { _id: item._id, owner: auth.session.playerId, status: "claimed", "authenticity.identified": false },
      {
        $set: {
          "authenticity.identified": true,
          "authenticity.liable": auth.session.playerId,
          "authenticity.liability_pending": false,
        },
      },
    );
    if (result.modifiedCount !== 1) return NextResponse.json({ error: "The report could not be completed." }, { status: 409 });
    return NextResponse.json({
      status: "ok",
      message: "The artwork was legitimate. It is now identified, and filing the false report made you liable for it.",
    });
  }

  const liable = item.authenticity.liable;
  const liableIsSystem = !liable || liable === AUCTION_HOUSE_OWNER_ID || liable.startsWith("system:") || liable.startsWith("bot:");
  const bonusMultiplier = liableIsSystem ? 10 : 1.2;
  const refund = Math.floor(item.authenticity.fee * bonusMultiplier);
  const reserved = await database.collection<GameItem>("items").updateOne(
    { _id: item._id, owner: auth.session.playerId, status: "claimed" },
    { $set: { status: "collector_pending" } },
  );
  if (reserved.modifiedCount !== 1) return NextResponse.json({ error: "The artwork changed before it could be reported." }, { status: 409 });
  let claimantCredited = false;
  try {
    const claimant = await database.collection<Player>("players").updateOne(
      { _id: auth.session.playerId, active: true },
      { $inc: { "profile.bank_balance": refund } },
    );
    if (claimant.modifiedCount !== 1) throw new Error("The claimant refund failed.");
    claimantCredited = true;
    await awardForgeryXpChunk(database, auth.session.playerId, liableIsSystem ? 2 : 1);

    if (liableIsSystem) {
      const removed = await database.collection<GameItem>("items").deleteOne({ _id: item._id, status: "collector_pending" });
      if (removed.deletedCount !== 1) throw new Error("The system forgery could not be removed.");
    } else {
      const charged = await database.collection<Player>("players").updateOne(
        { _id: liable, active: true },
        { $inc: { "profile.bank_balance": -item.authenticity.fee } },
      );
      const transferred = await database.collection<GameItem>("items").updateOne(
        { _id: item._id, owner: auth.session.playerId, status: "collector_pending" },
        {
          $set: {
            owner: liable,
            status: "claimed",
            tags: [],
            date_received: new Date().toISOString(),
            "authenticity.fee": 0,
            "authenticity.identified": true,
            "authenticity.liability_pending": false,
            "authenticity.forgery_quality": punishForgeryQuality(item.authenticity.forgery_quality),
          },
          $push: {
            transaction_history: {
              type: "transfer",
              from_owner: auth.session.playerId,
              to_owner: liable,
              occurred_at: new Date().toISOString(),
              source: "forgery report",
            },
          },
        },
      );
      if (transferred.modifiedCount !== 1) {
        if (charged.modifiedCount === 1) {
          await database.collection<Player>("players").updateOne({ _id: liable }, { $inc: { "profile.bank_balance": item.authenticity.fee } });
        }
        throw new Error("The forgery could not be returned.");
      }
      await createPlayerNotification(database, liable, {
        kind: "warning",
        message: `A forgery report returned an artwork to you and charged a $${item.authenticity.fee.toLocaleString()} liability fee.`,
        dedupeUnread: false,
      });
    }
  } catch (error) {
    if (claimantCredited) {
      await database.collection<Player>("players").updateOne({ _id: auth.session.playerId }, { $inc: { "profile.bank_balance": -refund } });
    }
    await database.collection<GameItem>("items").updateOne(
      { _id: item._id, owner: auth.session.playerId, status: "collector_pending" },
      { $set: { status: "claimed" } },
    );
    console.error("Unable to redeem reported forgery", error);
    return NextResponse.json({ error: "The forgery report could not be settled." }, { status: 500 });
  }
  return NextResponse.json({
    status: "ok",
    refund,
    message: `Forgery confirmed. You received $${refund.toLocaleString()} and an XP reward.`,
  });
}
