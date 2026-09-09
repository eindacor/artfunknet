import { NextResponse } from "next/server";

import type { GameItem } from "@/server/gameplay";
import { deleteCommunityReactions } from "@/server/community-reaction-cleanup";
import {
  punishForgeryQuality,
  rewardUndetectedForgeryExit,
  rollForgeryDetected,
  shouldDestroyDetectedForgery,
  transferForgeryLiability,
} from "@/server/forgery-gameplay";
import { hydrateGameItems } from "@/server/item-artwork";
import {
  getDisplayedLegendaryEffect,
  getLegendaryNumberParameter,
} from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import { removeExpiredTransientItems } from "@/server/item-expiration";
import { requirePlayerApi } from "@/server/player-api";

type Player = {
  _id: string;
  active: boolean;
  profile: {
    bank_balance: number;
    last_activity: string;
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
  await removeExpiredTransientItems(database);
  const item = await database.collection<GameItem>("items").findOne({
    _id: id,
    owner: auth.session.playerId,
    status: { $in: ["claimed", "unclaimed"] },
    permanent: { $ne: true },
    original: { $ne: true },
  });
  if (!item) {
    return NextResponse.json(
      { error: "This item cannot currently be sold." },
      { status: 409 },
    );
  }
  if (item.authenticity.forgery) {
    await transferForgeryLiability(
      database,
      item,
      auth.session.playerId,
    );
    const [hydrated] = await hydrateGameItems(database, [item]);
    if (rollForgeryDetected(hydrated, "sell")) {
      if (shouldDestroyDetectedForgery(item)) {
        const destroyed = await database.collection<GameItem>("items").deleteOne({
          _id: item._id,
          owner: auth.session.playerId,
          status: item.status,
          "authenticity.forgery": true,
          "authenticity.identified": true,
        });
        if (destroyed.deletedCount !== 1) {
          return NextResponse.json(
            {
              error:
                "The detected forgery changed before it could be destroyed.",
            },
            { status: 409 },
          );
        }
        await deleteCommunityReactions(database, "item", [item._id]);
        const message =
          "The buyer detected the forgery. The sale failed and the artwork was destroyed.";
        return NextResponse.json({
          status: "ok",
          amount: 0,
          message,
          notificationKind: "error",
          actionDialog: {
            variant: "destroyed",
            title: "Forgery detected",
            message,
          },
        });
      }
      await database.collection<GameItem>("items").updateOne(
        { _id: item._id, owner: auth.session.playerId },
        {
          $set: {
            status: "claimed",
            "authenticity.liable": auth.session.playerId,
            "authenticity.liability_pending": false,
            "authenticity.identified": true,
            "authenticity.forgery_quality": punishForgeryQuality(item.authenticity.forgery_quality),
          },
          $unset: { expires_at: "" },
        },
      );
      const message =
        "The buyer detected the forgery. It was identified and returned to your inventory.";
      return NextResponse.json({
        status: "ok",
        amount: 0,
        message,
        notificationKind: "error",
        actionDialog: {
          variant: "returned",
          title: "Forgery identified",
          message,
        },
      });
    }
  }
  const removed = await database.collection<GameItem>("items").findOneAndDelete({
    _id: item._id,
    owner: auth.session.playerId,
    status: item.status,
  });
  if (!removed) {
    return NextResponse.json({ error: "This item changed before it could be sold." }, { status: 409 });
  }
  const saleBonus =
    item.status === "unclaimed"
      ? await getDisplayedLegendaryEffect(
          database,
          auth.session.playerId,
          "UNCLAIMED_ITEM_SELL_BONUS",
        )
      : null;
  const amount = Math.floor(
    item.values.sell *
      getLegendaryNumberParameter(saleBonus, "sell_multiplier", 1),
  );

  const result = await database.collection<Player>("players").updateOne(
    { _id: auth.session.playerId, active: true },
    {
      $inc: { "profile.bank_balance": amount },
      $set: { "profile.last_activity": new Date().toISOString() },
    },
  );
  if (result.modifiedCount !== 1) {
    await database.collection<GameItem>("items").insertOne(removed);
    return NextResponse.json(
      { error: "The sale could not be applied to your account." },
      { status: 500 },
    );
  }
  await deleteCommunityReactions(database, "item", [item._id]);
  const [hydratedItem] = await hydrateGameItems(database, [item]);
  await rewardUndetectedForgeryExit(database, hydratedItem, {
    artworkTitle: hydratedItem.artwork.title,
    method: "sale",
    removedByPlayerId: auth.session.playerId,
  });

  return NextResponse.json({ status: "ok", amount });
}
