import { randomUUID } from "node:crypto";

import type { AnyBulkWriteOperation } from "mongodb";
import { NextResponse } from "next/server";

import {
  getBulkAcquisitionRequirements,
  selectBulkPurchaseItems,
} from "@/server/bulk-acquisition";
import { recordEconomyMetricsSafely } from "@/server/economy-metrics";
import type { GameItem } from "@/server/gameplay";
import { checkItemForHallOfFameStatus } from "@/server/hall-of-fame";
import {
  getUnexpiredItemFilter,
  removeExpiredTransientItems,
} from "@/server/item-expiration";
import {
  getDisplayedLegendaryEffect,
  getLegendaryNumberParameter,
} from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type AcquireManyRequest = {
  itemIds?: unknown;
  mode?: unknown;
  setForSale?: unknown;
};

type PlayerRecord = {
  _id: string;
  active: boolean;
  screen_name: string;
  test_account?: boolean;
  profile: {
    bank_balance: number;
    expansion_slots?: number;
    inventory_cap: number;
    last_activity: string;
  };
};

export async function POST(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as
    | AcquireManyRequest
    | null;
  const mode =
    body?.mode === "all-for-sale" || body?.mode === "selected"
      ? body.mode
      : null;
  const setForSale = body?.setForSale === true;
  const itemIds =
    Array.isArray(body?.itemIds) &&
    body.itemIds.length > 0 &&
    body.itemIds.length <= 200 &&
    body.itemIds.every(
      (itemId): itemId is string =>
        typeof itemId === "string" && itemId.trim().length > 0,
    )
      ? [...new Set(body.itemIds)]
      : [];
  if (!mode || (mode === "selected" && itemIds.length === 0)) {
    return NextResponse.json(
      { error: "The bulk acquisition request is invalid." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const now = new Date();
  const nowIso = now.toISOString();
  await removeExpiredTransientItems(database, now);
  const unexpiredFilter = getUnexpiredItemFilter(now);
  const [player, discountEffect, rollCountEffect] = await Promise.all([
    database.collection<PlayerRecord>("players").findOne({
      _id: auth.session.playerId,
      active: true,
    }),
    getDisplayedLegendaryEffect(
      database,
      auth.session.playerId,
      "DEALER_DISCOUNT",
    ),
    getDisplayedLegendaryEffect(
      database,
      auth.session.playerId,
      "DEALER_PURCHASE_ROLL_COUNT_SET",
    ),
  ]);
  if (!player) {
    return NextResponse.json(
      { error: "The active player could not be found." },
      { status: 409 },
    );
  }

  const candidates = await database
    .collection<GameItem>("items")
    .find({
      owner: player._id,
      status:
        mode === "all-for-sale"
          ? "for_sale"
          : { $in: ["unclaimed", "for_sale"] },
      ...(mode === "selected" ? { _id: { $in: itemIds } } : {}),
      ...unexpiredFilter,
    })
    .toArray();
  if (mode === "selected" && candidates.length !== itemIds.length) {
    return NextResponse.json(
      { error: "One or more selected offers are no longer available." },
      { status: 409 },
    );
  }
  if (candidates.length === 0) {
    return NextResponse.json(
      {
        error:
          mode === "all-for-sale"
            ? "There are no dealer offers to purchase."
            : "The selected offers are no longer available.",
      },
      { status: 409 },
    );
  }

  const consignedAuctions = await database
    .collection<{ item_id: string }>("auctions")
    .find({ seller_id: player._id })
    .project<{ item_id: string }>({ item_id: 1 })
    .toArray();
  const inventoryCount = await database
    .collection<GameItem>("items")
    .countDocuments({
      owner: player._id,
      $or: [
        { status: { $in: ["claimed", "displayed"] } },
        {
          _id: {
            $in: consignedAuctions.map((auction) => auction.item_id),
          },
          status: "auctioned",
        },
      ],
      original: { $ne: true },
      vintage: { $ne: true },
    });
  const capacity =
    player.profile.inventory_cap + (player.profile.expansion_slots ?? 0);
  const availableSlots = Math.max(0, capacity - inventoryCount);
  const costMultiplier = getLegendaryNumberParameter(
    discountEffect,
    "cost_multiplier",
    1,
  );
  const getPurchaseCost = (item: GameItem) =>
    item.status === "for_sale"
      ? Math.floor(item.values.dealer * costMultiplier)
      : 0;

  let selectedItems: GameItem[];
  let totalCost: number;
  if (mode === "all-for-sale") {
    const selection = selectBulkPurchaseItems(
      candidates,
      availableSlots,
      player.profile.bank_balance,
      getPurchaseCost,
    );
    selectedItems = selection.items;
    totalCost = selection.totalCost;
    if (selectedItems.length === 0) {
      return NextResponse.json(
        {
          error:
            availableSlots === 0 &&
            candidates.every((item) => !item.original && !item.vintage)
              ? "Your inventory is currently full."
              : "You do not have enough money to purchase any available offers.",
        },
        { status: 409 },
      );
    }
  } else {
    const requirements = getBulkAcquisitionRequirements(
      candidates,
      getPurchaseCost,
    );
    if (requirements.requiredSlots > availableSlots) {
      return NextResponse.json(
        { error: "Your inventory does not have room for every selected item." },
        { status: 409 },
      );
    }
    if (requirements.totalCost > player.profile.bank_balance) {
      return NextResponse.json(
        {
          error:
            "You do not have enough money to purchase every selected offer.",
        },
        { status: 409 },
      );
    }
    selectedItems = candidates;
    totalCost = requirements.totalCost;
  }

  const operationId = randomUUID();
  const chargedPlayer = await database
    .collection<PlayerRecord>("players")
    .findOneAndUpdate(
      {
        _id: player._id,
        active: true,
        "profile.bank_balance": { $gte: totalCost },
      },
      {
        $inc: {
          "profile.bank_balance": -totalCost,
          "profile.playthrough_stats.items_collected": selectedItems.length,
          "profile.playthrough_stats.money_spent": totalCost,
        },
        $set: { "profile.last_activity": nowIso },
      },
      { returnDocument: "after" },
    );
  if (!chargedPlayer) {
    return NextResponse.json(
      {
        error:
          totalCost > 0
            ? "You no longer have enough money for these offers."
            : "The selected items could not be added to your playthrough record.",
      },
      { status: 409 },
    );
  }

  const purchaseRollCount = rollCountEffect
    ? Math.floor(
        getLegendaryNumberParameter(rollCountEffect, "roll_count", -20),
      )
    : null;
  let acquiredCount = 0;
  try {
    const acquired = await database.collection<GameItem>("items").bulkWrite(
      selectedItems.map((item) => ({
        updateOne: {
          filter: {
            _id: item._id,
            owner: player._id,
            status: item.status,
            ...unexpiredFilter,
          },
          update: {
            $set: {
              status: "claimed",
              date_received: nowIso,
              bulk_acquisition_operation: operationId,
              ...(item.status === "for_sale" && purchaseRollCount !== null
                ? { roll_count: purchaseRollCount }
                : {}),
            },
            $unset: { expires_at: "" },
            ...(setForSale ? { $addToSet: { tags: "for sale" } } : {}),
          },
        },
      })),
      { ordered: false },
    );
    acquiredCount = acquired.modifiedCount;
  } catch (error) {
    await rollbackAcquisition(
      database,
      player,
      selectedItems,
      operationId,
      totalCost,
    );
    console.error("Unable to complete bulk acquisition", error);
    return NextResponse.json(
      { error: "The bulk acquisition could not be completed." },
      { status: 500 },
    );
  }
  if (acquiredCount !== selectedItems.length) {
    await rollbackAcquisition(
      database,
      player,
      selectedItems,
      operationId,
      totalCost,
    );
    return NextResponse.json(
      {
        error:
          "One or more offers changed before the bulk acquisition completed.",
      },
      { status: 409 },
    );
  }

  const cleanupFilter = {
    owner: player._id,
    status: "claimed" as const,
    bulk_acquisition_operation: operationId,
  };
  try {
    await database.collection<GameItem>("items").updateMany(
      cleanupFilter,
      { $unset: { bulk_acquisition_operation: "", expires_at: "" } },
    );
  } catch (error) {
    console.error(`Unable to clean up bulk acquisition ${operationId}`, error);
  }
  let remainingCleanup = await database
    .collection<GameItem>("items")
    .countDocuments(cleanupFilter);
  if (remainingCleanup > 0) {
    try {
      await database.collection<GameItem>("items").updateMany(
        cleanupFilter,
        { $unset: { bulk_acquisition_operation: "", expires_at: "" } },
      );
    } catch (error) {
      console.error(
        `Unable to retry bulk acquisition ${operationId} cleanup`,
        error,
      );
    }
    remainingCleanup = await database
      .collection<GameItem>("items")
      .countDocuments(cleanupFilter);
  }
  if (remainingCleanup > 0) {
    console.error(
      `Bulk acquisition ${operationId} left ${remainingCleanup} items pending cleanup.`,
    );
    return NextResponse.json(
      {
        error:
          "The items were acquired, but cleanup was incomplete. Refresh before trying another action.",
      },
      { status: 500 },
    );
  }

  for (const item of selectedItems) {
    await checkItemForHallOfFameStatus(
      database,
      {
        ...item,
        status: "claimed",
        date_received: nowIso,
        ...(setForSale
          ? { tags: [...new Set([...item.tags, "for sale"])] }
          : {}),
      },
      player,
    ).catch((error) => {
      console.error(
        `Unable to submit bulk-acquired item ${item._id} for Hall of Fame review`,
        error,
      );
    });
  }

  const purchasedCount = selectedItems.filter(
    (item) => item.status === "for_sale",
  ).length;
  await recordEconomyMetricsSafely(database, [
    ...(totalCost > 0
      ? [
          {
            amount: totalCost,
            currency: "money" as const,
            direction: "spent" as const,
            source: "bulk-dealer-purchase",
          },
        ]
      : []),
    {
      amount: selectedItems.reduce(
        (sum, item) => sum + item.values.actual,
        0,
      ),
      currency: "items",
      direction: "acquired",
      source: "bulk-item-acquisition",
    },
  ]);

  const skipped =
    mode === "all-for-sale"
      ? Math.max(0, candidates.length - selectedItems.length)
      : 0;
  const actionLabel = setForSale
    ? "Collected and offered"
    : purchasedCount === selectedItems.length
      ? "Purchased"
      : "Collected";
  return NextResponse.json({
    status: "ok",
    acquired: selectedItems.length,
    purchased: purchasedCount,
    amount: totalCost,
    bankBalance: chargedPlayer.profile.bank_balance,
    skipped,
    message: `${actionLabel} ${selectedItems.length} ${
      selectedItems.length === 1 ? "artwork" : "artworks"
    }${totalCost > 0 ? ` for $${totalCost.toLocaleString()}` : ""}${
      skipped > 0
        ? `; ${skipped} ${skipped === 1 ? "offer remains" : "offers remain"} because of inventory or bank limits`
        : ""
    }.`,
  });
}

async function rollbackAcquisition(
  database: Awaited<ReturnType<typeof getDatabase>>,
  player: PlayerRecord,
  items: readonly GameItem[],
  operationId: string,
  totalCost: number,
) {
  const rollbackItems: AnyBulkWriteOperation<GameItem>[] = items.map(
    (item) => {
      const setter: Partial<GameItem> = {
        status: item.status,
        date_received: item.date_received,
        roll_count: item.roll_count,
        tags: item.tags,
        ...(item.expires_at ? { expires_at: item.expires_at } : {}),
      };
      const unsetter: Record<string, "" | 1 | true> = {
        bulk_acquisition_operation: "",
        ...(!item.expires_at ? { expires_at: "" as const } : {}),
      };
      return {
        updateOne: {
          filter: {
            _id: item._id,
            owner: player._id,
            status: "claimed",
            bulk_acquisition_operation: operationId,
          },
          update: {
            $set: setter,
            $unset: unsetter,
          },
        },
      };
    },
  );
  if (rollbackItems.length > 0) {
    try {
      await database
        .collection<GameItem>("items")
        .bulkWrite(rollbackItems, { ordered: false });
    } catch (error) {
      console.error(
        `Bulk acquisition ${operationId} item rollback was incomplete.`,
        error,
      );
    }
  }
  const refunded = await database.collection<PlayerRecord>("players").updateOne(
    { _id: player._id, active: true },
    {
      $inc: {
        "profile.bank_balance": totalCost,
        "profile.playthrough_stats.items_collected": -items.length,
        "profile.playthrough_stats.money_spent": -totalCost,
      },
    },
  );
  if (refunded.modifiedCount !== 1) {
    console.error(
      `Bulk acquisition ${operationId} refund failed; manual reconciliation is required.`,
    );
  }
}
