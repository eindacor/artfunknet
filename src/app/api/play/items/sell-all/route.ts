import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  beginBulkOperation,
  completeBulkOperation,
  getBulkForgeryDialog,
  getBulkForgeryMessage,
  getFilteredBulkLootCandidates,
  parseBulkSaleProtections,
  processBulkForgeries,
  recoverPendingBulkOperations,
  wasBulkOperationCredited,
} from "@/server/bulk-sale";
import { deleteCommunityReactions } from "@/server/community-reaction-cleanup";
import { recordEconomyMetricsSafely } from "@/server/economy-metrics";
import { rewardUndetectedForgeryExit } from "@/server/forgery-gameplay";
import type { GameItem } from "@/server/gameplay";
import { transferHallOfFameItems } from "@/server/hall-of-fame";
import { removeExpiredTransientItems } from "@/server/item-expiration";
import {
  getDisplayedLegendaryEffect,
  getLegendaryNumberParameter,
} from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import { getActiveQuestTargetIds } from "@/server/quest-item-sell";

export async function POST(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const rawBody = await request.text().catch(() => "");
  const parseResult = parseBulkSaleProtections(rawBody);
  if (!parseResult.ok) {
    return NextResponse.json(
      { error: "The sell-all request is invalid." },
      { status: 400 },
    );
  }
  const protections = parseResult.protections;

  const database = await getDatabase();
  await removeExpiredTransientItems(database);
  await recoverPendingBulkOperations(database, auth.session.playerId);

  const { candidates, hydratedCandidates, items, questTargetIds } =
    await getFilteredBulkLootCandidates(database, auth.session.playerId, protections);

  if (candidates.length === 0) {
    return NextResponse.json(
      { error: "There is no sellable unclaimed loot." },
      { status: 409 },
    );
  }
  if (items.length === 0) {
    return NextResponse.json(
      { error: "No unclaimed loot matches the selected sell-all options." },
      { status: 409 },
    );
  }

  const { validItems: sellableItems, destroyedIds, identifiedIds, caughtIds, hydrated } =
    await processBulkForgeries(database, auth.session.playerId, items, hydratedCandidates, "sell");

  if (sellableItems.length === 0) {
    const message = getBulkForgeryMessage(
      destroyedIds.length,
      identifiedIds.size,
      true,
      "sale",
    );
    return NextResponse.json({
      status: "ok",
      amount: 0,
      message,
      notificationKind: "error",
      ...(caughtIds.size > 0
        ? {
            actionDialog: getBulkForgeryDialog(
              destroyedIds.length,
              identifiedIds.size,
              message,
            ),
          }
        : {}),
    });
  }

  const [saleBonus, questSellBonus, activeQuestTargetIds] = await Promise.all([
    getDisplayedLegendaryEffect(
      database,
      auth.session.playerId,
      "UNCLAIMED_ITEM_SELL_BONUS",
    ),
    getDisplayedLegendaryEffect(
      database,
      auth.session.playerId,
      "QUEST_ITEM_SELL_BONUS",
    ),
    questTargetIds.size > 0
      ? Promise.resolve(questTargetIds)
      : getActiveQuestTargetIds(database, auth.session.playerId),
  ]);

  const unclaimedMultiplier = getLegendaryNumberParameter(
    saleBonus,
    "sell_multiplier",
    1,
  );
  const questMultiplier = getLegendaryNumberParameter(
    questSellBonus,
    "sell_multiplier",
    2,
  );

  const amount = sellableItems.reduce((sum, item) => {
    const itemQuestMultiplier =
      questSellBonus && activeQuestTargetIds.has(item.artwork_id)
        ? questMultiplier
        : 1;
    return (
      sum +
      Math.floor(
        item.values.sell * unclaimedMultiplier * itemQuestMultiplier,
      )
    );
  }, 0);

  const ids = sellableItems.map((item) => item._id);
  const operationId = randomUUID();
  const operationStartedAt = new Date();
  let credited = false;

  const operationStarted = await beginBulkOperation(
    database,
    auth.session.playerId,
    {
      id: operationId,
      kind: "sale",
      started_at: operationStartedAt.toISOString(),
    },
  );
  if (!operationStarted) {
    return NextResponse.json(
      { error: "Another bulk inventory operation is already in progress." },
      { status: 409 },
    );
  }

  let reserved;
  try {
    reserved = await database.collection<GameItem>("items").updateMany(
      {
        _id: { $in: ids },
        owner: auth.session.playerId,
        status: "unclaimed",
      },
      {
        $set: {
          status: "bulk_sale_pending",
          bulk_sale_operation: operationId,
        },
      },
    );
  } catch (error) {
    await recoverPendingBulkOperations(database, auth.session.playerId, {
      forceOperationId: operationId,
    });
    throw error;
  }

  if (reserved.modifiedCount !== sellableItems.length) {
    await recoverPendingBulkOperations(database, auth.session.playerId, {
      forceOperationId: operationId,
    });
    return NextResponse.json(
      { error: "The loot changed before it could all be sold." },
      { status: 409 },
    );
  }

  try {
    const credit = await database.collection<{
      _id: string;
      active: boolean;
      profile: {
        bank_balance: number;
        last_activity: string;
      };
    }>("players").updateOne(
      {
        _id: auth.session.playerId,
        active: true,
        "profile.bulk_operation_receipt.id": operationId,
        "profile.bulk_operation_receipt.kind": "sale",
        "profile.bulk_operation_receipt.state": "reserved",
      },
      {
        $inc: { "profile.bank_balance": amount },
        $set: {
          "profile.last_activity": operationStartedAt.toISOString(),
          "profile.bulk_operation_receipt.state": "credited",
          "profile.bulk_operation_receipt.credited_at":
            operationStartedAt.toISOString(),
        },
      },
    );
    if (credit.modifiedCount !== 1) {
      throw new Error("The bulk sale could not be credited.");
    }
    credited = true;

    const hallOfFameIds = await transferHallOfFameItems(
      database,
      sellableItems.map((item) => ({
        ...item,
        status: "bulk_sale_pending" as const,
      })),
    );
    const deletedIds = ids.filter((id) => !hallOfFameIds.has(id));
    const removed = await database.collection<GameItem>("items").deleteMany({
      _id: { $in: deletedIds },
      owner: auth.session.playerId,
      status: "bulk_sale_pending",
      bulk_sale_operation: operationId,
    });
    if (removed.deletedCount !== deletedIds.length) {
      throw new Error("The bulk sale cleanup was incomplete.");
    }
    await deleteCommunityReactions(database, "item", deletedIds);
    await completeBulkOperation(
      database,
      auth.session.playerId,
      operationId,
    );
  } catch (error) {
    if (!credited) {
      credited = await wasBulkOperationCredited(
        database,
        auth.session.playerId,
        operationId,
        "sale",
      );
    }
    await recoverPendingBulkOperations(database, auth.session.playerId, {
      forceOperationId: operationId,
    });
    console.error("Unable to complete bulk loot sale", error);
    return NextResponse.json(
      {
        error: credited
          ? "The sale was credited, but cleanup had to be recovered."
          : "The bulk sale could not be completed.",
      },
      { status: 500 },
    );
  }

  const hydratedById = new Map(
    hydrated.map((item) => [item._id, item]),
  );
  for (const item of sellableItems) {
    const hydratedItem = hydratedById.get(item._id);
    if (!hydratedItem) continue;
    await rewardUndetectedForgeryExit(database, hydratedItem, {
      artworkTitle: hydratedItem.artwork.title,
      method: "sale",
      removedByPlayerId: auth.session.playerId,
    });
  }

  await recordEconomyMetricsSafely(database, {
    amount,
    currency: "money",
    direction: "earned",
    source: "bulk-item-sale",
  });

  const message = `Sold ${sellableItems.length} unclaimed ${sellableItems.length === 1 ? "artwork" : "artworks"} for $${amount.toLocaleString()}${caughtIds.size > 0 ? `; ${getBulkForgeryMessage(destroyedIds.length, identifiedIds.size, false, "sale")}` : ""}.`;
  return NextResponse.json({
    status: "ok",
    amount,
    message,
    ...(caughtIds.size > 0 ? { notificationKind: "error" } : {}),
    ...(caughtIds.size > 0
      ? {
          actionDialog: getBulkForgeryDialog(
            destroyedIds.length,
            identifiedIds.size,
            message,
          ),
        }
      : {}),
  });
}
