import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";

import { recordEconomyMetricsSafely } from "./economy-metrics.ts";
import {
  getForgeryReturnPermission,
  punishForgeryQuality,
  type ForgeryReturnConfig,
} from "./forgery-gameplay.ts";
import type { GameItem } from "./gameplay.ts";
import { createPlayerNotification } from "./player-notifications.ts";

type ReturnResult =
  | { ok: true; refund: number; purchasePrice: number }
  | { ok: false; status: 404 | 409 | 500; error: string };

type ReturnPlayer = {
  _id: string;
  active: boolean;
  profile: { bank_balance: number; last_activity?: string };
};

export async function returnAuctionForgery(
  database: Db,
  playerId: string,
  itemId: string,
  config: ForgeryReturnConfig,
  now = new Date(),
): Promise<ReturnResult> {
  const items = database.collection<GameItem>("items");
  const players = database.collection<ReturnPlayer>("players");
  const item = await items.findOne({ _id: itemId, owner: playerId });
  if (!item) return { ok: false, status: 404, error: "Artwork not found." };
  const permission = getForgeryReturnPermission(item, playerId, config, now);
  if (!permission.allowed) {
    return { ok: false, status: 409, error: permission.reason };
  }
  // Listing an auction transfers liability to its seller. Detection can later
  // change authenticity.liable, so use the immutable purchase provenance.
  const purchase = item.transaction_history?.at(-1);
  const sellerId = purchase?.from_owner;
  const { refund, purchasePrice } = permission;
  // Validate at the monetary boundary too: stale development modules or
  // malformed runtime data must never turn an undefined amount into NaN.
  if (
    typeof sellerId !== "string" || !sellerId || sellerId === playerId ||
    !Number.isSafeInteger(purchasePrice) || purchasePrice <= 0 ||
    purchasePrice !== purchase?.amount ||
    !Number.isSafeInteger(refund) || refund < 0 || refund > purchasePrice ||
    refund !== Math.floor(purchasePrice * config.forgeryReturnRefundCoefficient)
  ) {
    return { ok: false, status: 409, error: "The auction purchase price or refund could not be verified. Reload and try again." };
  }
  const validBalance = {
    $type: "number" as const,
    $gte: -Number.MAX_VALUE,
    $lte: Number.MAX_VALUE,
  };
  const token = randomUUID();
  const locked = {
    _id: item._id,
    owner: playerId,
    status: "forgery_return_pending" as const,
    forgery_return_operation: token,
  };
  const reserved = await items.updateOne(
    {
      _id: item._id,
      owner: playerId,
      status: "claimed",
      date_received: item.date_received,
      transaction_history: item.transaction_history,
      "authenticity.forgery": true,
      "authenticity.identified": true,
      permanent: { $ne: true },
      repairing: { $ne: true },
    },
    { $set: { status: "forgery_return_pending", forgery_return_operation: token } },
  );
  if (reserved.modifiedCount !== 1) {
    return { ok: false, status: 409, error: "The artwork changed before it could be returned." };
  }
  let sellerCharged = false;
  let buyerCredited = false;
  try {
    // Liability charges can overdraw the seller, as in the original mechanic.
    const charged = await players.updateOne(
      { _id: sellerId, "profile.bank_balance": validBalance },
      { $inc: { "profile.bank_balance": -purchasePrice } },
    );
    if (charged.matchedCount !== 1) throw new Error("The liable seller account is unavailable.");
    sellerCharged = true;
    const credited = await players.updateOne(
      { _id: playerId, active: true, "profile.bank_balance": validBalance },
      {
        $inc: { "profile.bank_balance": refund },
        $set: { "profile.last_activity": now.toISOString() },
      },
    );
    if (credited.matchedCount !== 1) throw new Error("The buyer refund failed.");
    buyerCredited = true;
    const transferred = await items.updateOne(
      locked,
      {
        $set: {
          owner: sellerId,
          status: "claimed",
          tags: [],
          date_received: now.toISOString(),
          "authenticity.liable": sellerId,
          "authenticity.identified": true,
          "authenticity.fee": 0,
          "authenticity.liability_pending": false,
          "authenticity.forgery_quality": punishForgeryQuality(item.authenticity.forgery_quality),
        },
        $unset: { forgery_return_operation: "", expires_at: "" },
        $push: {
          transaction_history: {
            type: "transfer",
            from_owner: playerId,
            to_owner: sellerId,
            occurred_at: now.toISOString(),
            source: "forgery return",
            amount: refund,
          },
        },
      },
    );
    if (transferred.modifiedCount !== 1) throw new Error("The forgery transfer failed.");
  } catch (error) {
    console.error("Unable to return auction forgery", error);
    try {
      if (buyerCredited) {
        const reverted = await players.updateOne(
          { _id: playerId, "profile.bank_balance": validBalance },
          { $inc: { "profile.bank_balance": -refund } },
        );
        if (reverted.matchedCount !== 1) throw new Error("The buyer refund could not be reversed.");
      }
      if (sellerCharged) {
        const reverted = await players.updateOne(
          { _id: sellerId, "profile.bank_balance": validBalance },
          { $inc: { "profile.bank_balance": purchasePrice } },
        );
        if (reverted.matchedCount !== 1) throw new Error("The seller charge could not be reversed.");
      }
      await items.updateOne(locked, {
        $set: { status: "claimed" },
        $unset: { forgery_return_operation: "" },
      });
    } catch (rollbackError) {
      // Keep the item reserved if compensation fails, preventing another refund.
      console.error("Auction forgery return compensation failed", { itemId, token, rollbackError });
    }
    return { ok: false, status: 500, error: "The forgery return could not be settled." };
  }
  await recordEconomyMetricsSafely(database, [
    { amount: refund, currency: "money", direction: "earned", source: "auction-forgery-return" },
    { amount: purchasePrice, currency: "money", direction: "spent", source: "forgery-liability" },
  ]);
  for (const notification of [
    {
      playerId: sellerId,
      kind: "warning",
      message: `An auction forgery was returned to your inventory. You were charged the full $${purchasePrice.toLocaleString()} purchase price.`,
    },
    {
      playerId,
      kind: "success",
      message: `Your auction forgery was successfully returned to the seller. $${refund.toLocaleString()} of the $${purchasePrice.toLocaleString()} purchase price was refunded to your bank balance.`,
    },
  ] as const) {
    try {
      await createPlayerNotification(database, notification.playerId, {
        kind: notification.kind,
        message: notification.message,
        dedupeUnread: false,
      });
    } catch (error) {
      console.error("Unable to notify player of forgery return", { playerId: notification.playerId, error });
    }
  }
  return { ok: true, refund, purchasePrice };
}
