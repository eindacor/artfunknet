import { NextResponse } from "next/server";

import { getBulkDisposalPermission } from "@/server/bulk-sale";
import { recordEconomyMetricsSafely } from "@/server/economy-metrics";
import type { GameItem } from "@/server/gameplay";
import { getGameplaySettings } from "@/server/game-settings";
import { canQuickSellItem } from "@/server/offer-reveal";
import { deleteCommunityReactions } from "@/server/community-reaction-cleanup";
import {
  notifyForgeryDetection,
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
import {
  restoreTransferredHallOfFameItem,
  transferIfHallOfFameItem,
} from "@/server/hall-of-fame";
import { getDatabase } from "@/server/mongodb";
import { removeExpiredTransientItems } from "@/server/item-expiration";
import { requirePlayerApi } from "@/server/player-api";
import { getItemDisposalFilter, getItemDisposalPermission } from "@/server/item-permissions";
import { evaluateQuestItemSellBonus } from "@/server/quest-item-sell";
import { refreshGalleryMetadata } from "@/server/gallery-metadata";

type Player = {
  _id: string;
  active: boolean;
  profile: {
    bank_balance: number;
    last_activity: string;
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
  await removeExpiredTransientItems(database);
  const item = await database.collection<GameItem>("items").findOne({
    _id: id,
    owner: auth.session.playerId,
  });
  if (!item) {
    return NextResponse.json(
      { error: "This item cannot currently be sold." },
      { status: 409 },
    );
  }
  const permission = getItemDisposalPermission(item, "sell");
  if (!permission.allowed) {
    return NextResponse.json({ error: permission.reason }, { status: 409 });
  }
  const bulkPermission = await getBulkDisposalPermission(database, auth.session.playerId, item, request);
  if (!bulkPermission.allowed) {
    return NextResponse.json({ error: bulkPermission.reason }, { status: 409 });
  }
  const settings = await getGameplaySettings(database);
  const [hydrated] = await hydrateGameItems(database, [item]);
  if (!canQuickSellItem(hydrated, settings.active.offerRevealThresholds)) {
    return NextResponse.json(
      { error: "Reveal this item before selling it." },
      { status: 409 },
    );
  }
  if (item.authenticity.forgery) {
    await transferForgeryLiability(
      database,
      item,
      auth.session.playerId,
    );
    if (rollForgeryDetected(hydrated, "sell")) {
      if (shouldDestroyDetectedForgery(item)) {
        const preserved = await transferIfHallOfFameItem(database, item);
        const destroyed = preserved
          ? { deletedCount: 1 }
          : await database.collection<GameItem>("items").deleteOne({
              _id: item._id,
              owner: auth.session.playerId,
              ...getItemDisposalFilter("sell", item.status),
              revealed: { $ne: false },
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
        if (!preserved) {
          await deleteCommunityReactions(database, "item", [item._id]);
        }
        if (item.status === "displayed") {
          await refreshGalleryMetadata(database, auth.session.playerId);
        }
        const message = preserved
          ? "The buyer detected the forgery. The sale failed, and Artfunkel Inc. preserved the artwork."
          : "The buyer detected the forgery. The sale failed and the artwork was destroyed.";
        await notifyForgeryDetection(database, auth.session.playerId, `${hydrated.artwork.title}: ${message}`);
        return NextResponse.json({
          status: "ok",
          amount: 0,
          message,
          notificationKind: "error",
          actionDialog: {
            variant: preserved ? "returned" : "destroyed",
            title: "Forgery detected",
            message,
          },
        });
      }
      const identified = await database.collection<GameItem>("items").updateOne(
        { _id: item._id, owner: auth.session.playerId, ...getItemDisposalFilter("sell", item.status), "authenticity.identified": false },
        {
          $set: {
            status: item.status === "displayed" ? "displayed" : "claimed",
            "authenticity.liable": auth.session.playerId,
            "authenticity.liability_pending": false,
            "authenticity.identified": true,
            "authenticity.forgery_quality": punishForgeryQuality(item.authenticity.forgery_quality),
          },
          $unset: { expires_at: "" },
        },
      );
      if (identified.modifiedCount !== 1) {
        return NextResponse.json(
          { error: "The artwork changed before the forgery could be identified." },
          { status: 409 },
        );
      }
      const message = item.status === "displayed"
        ? "The buyer detected the forgery. It was identified and remains featured."
        : "The buyer detected the forgery. It was identified and returned to your inventory.";
      if (item.status === "displayed") {
        await refreshGalleryMetadata(database, auth.session.playerId);
      }
      await notifyForgeryDetection(database, auth.session.playerId, `${hydrated.artwork.title}: ${message}`);
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
  const isHoF = await transferIfHallOfFameItem(database, item);
  const removed = isHoF
    ? item
    : await database.collection<GameItem>("items").findOneAndDelete({
        _id: item._id,
        owner: auth.session.playerId,
        ...getItemDisposalFilter("sell", item.status),
        revealed: { $ne: false },
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
  const questBonus = await evaluateQuestItemSellBonus(
    database,
    auth.session.playerId,
    item.artwork_id,
  );
  const unclaimedMultiplier = getLegendaryNumberParameter(
    saleBonus,
    "sell_multiplier",
    1,
  );
  const amount = Math.floor(
    item.values.sell * unclaimedMultiplier * questBonus.multiplier,
  );

  const result = await database.collection<Player>("players").updateOne(
    { _id: auth.session.playerId, active: true },
    {
      $inc: { "profile.bank_balance": amount },
      $set: { "profile.last_activity": new Date().toISOString() },
    },
  );
  if (result.modifiedCount !== 1) {
    if (isHoF) {
      await restoreTransferredHallOfFameItem(database, item);
    } else {
      await database.collection<GameItem>("items").insertOne(removed);
    }
    return NextResponse.json(
      { error: "The sale could not be applied to your account." },
      { status: 500 },
    );
  }
  if (!isHoF) {
    await deleteCommunityReactions(database, "item", [item._id]);
  }
  if (item.status === "displayed") {
    await refreshGalleryMetadata(database, auth.session.playerId);
  }
  const [hydratedItem] = await hydrateGameItems(database, [item]);
  await rewardUndetectedForgeryExit(database, hydratedItem, {
    artworkTitle: hydratedItem.artwork.title,
    method: "sale",
    removedByPlayerId: auth.session.playerId,
  });
  await recordEconomyMetricsSafely(database, {
    amount,
    currency: "money",
    direction: "earned",
    source: "item-sale",
  });

  return NextResponse.json({ status: "ok", amount });
}
