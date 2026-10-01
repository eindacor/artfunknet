import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { selectBulkClaimItems } from "@/server/bulk-claim";
import { recordEconomyMetricsSafely } from "@/server/economy-metrics";
import type { GameItem } from "@/server/gameplay";
import { checkItemForHallOfFameStatus } from "@/server/hall-of-fame";
import {
  getUnexpiredItemFilter,
  removeExpiredTransientItems,
} from "@/server/item-expiration";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type PlayerRecord = {
  _id: string;
  screen_name: string;
  test_account?: boolean;
  profile: {
    expansion_slots?: number;
    inventory_cap: number;
  };
};

export async function POST() {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const database = await getDatabase();
  const now = new Date();
  const nowIso = now.toISOString();
  await removeExpiredTransientItems(database, now);
  const unexpiredFilter = getUnexpiredItemFilter(now);

  const player = await database
    .collection<PlayerRecord>("players")
    .findOne({ _id: auth.session.playerId });
  if (!player) {
    return NextResponse.json({ error: "Player was not found." }, { status: 404 });
  }

  const items = await database
    .collection<GameItem>("items")
    .find({
      owner: player._id,
      status: "unclaimed",
      ...unexpiredFilter,
    })
    .toArray();
  if (items.length === 0) {
    return NextResponse.json(
      { error: "There is no unclaimed loot to collect." },
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
          _id: { $in: consignedAuctions.map((auction) => auction.item_id) },
          status: "auctioned",
        },
      ],
      original: { $ne: true },
      vintage: { $ne: true },
    });
  const capacity =
    player.profile.inventory_cap + (player.profile.expansion_slots ?? 0);
  const selectedItems = selectBulkClaimItems(
    items,
    Math.max(0, capacity - inventoryCount),
  );
  if (selectedItems.length === 0) {
    return NextResponse.json(
      { error: "Your inventory is currently full." },
      { status: 409 },
    );
  }

  const operationId = randomUUID();
  await database.collection<GameItem>("items").updateMany(
    {
      _id: { $in: selectedItems.map((item) => item._id) },
      owner: player._id,
      status: "unclaimed",
      ...unexpiredFilter,
    },
    {
      $set: {
        status: "claimed",
        date_received: nowIso,
        bulk_claim_operation: operationId,
      },
    },
  );

  const claimedItems = await database
    .collection<GameItem>("items")
    .find({
      owner: player._id,
      status: "claimed",
      bulk_claim_operation: operationId,
    })
    .toArray();
  if (claimedItems.length === 0) {
    return NextResponse.json(
      { error: "The loot changed before it could be collected." },
      { status: 409 },
    );
  }

  const tracked = await database.collection<PlayerRecord>("players").updateOne(
    { _id: player._id },
    {
      $inc: {
        "profile.playthrough_stats.items_collected": claimedItems.length,
      },
    },
  );
  if (tracked.modifiedCount !== 1) {
    await database.collection<GameItem>("items").updateMany(
      {
        owner: player._id,
        status: "claimed",
        bulk_claim_operation: operationId,
      },
      {
        $set: { status: "unclaimed" },
        $unset: {
          bulk_claim_operation: "",
          date_received: "",
        },
      },
    );
    return NextResponse.json(
      { error: "The collected items could not be added to your playthrough record." },
      { status: 500 },
    );
  }

  const firstCleanup = await database.collection<GameItem>("items").updateMany(
    {
      owner: player._id,
      status: "claimed",
      bulk_claim_operation: operationId,
    },
    {
      $unset: {
        bulk_claim_operation: "",
        expires_at: "",
      },
    },
  );
  let cleanedCount = firstCleanup.modifiedCount;
  if (cleanedCount !== claimedItems.length) {
    const secondCleanup = await database.collection<GameItem>("items").updateMany(
      {
        owner: player._id,
        status: "claimed",
        bulk_claim_operation: operationId,
      },
      {
        $unset: {
          bulk_claim_operation: "",
          expires_at: "",
        },
      },
    );
    cleanedCount += secondCleanup.modifiedCount;
    if (secondCleanup.modifiedCount > 0) {
      console.error(
        `Bulk claim ${operationId} required a second cleanup pass for ${secondCleanup.modifiedCount} items.`,
      );
    }
  }
  if (cleanedCount !== claimedItems.length) {
    console.error(
      `Bulk claim ${operationId} left ${claimedItems.length - cleanedCount} items pending cleanup.`,
    );
    return NextResponse.json(
      {
        error:
          "The items were collected, but their cleanup was incomplete. Refresh before trying another action.",
      },
      { status: 500 },
    );
  }

  for (const item of claimedItems) {
    await checkItemForHallOfFameStatus(database, item, player).catch((error) => {
      console.error(
        `Unable to submit bulk-claimed item ${item._id} for Hall of Fame review`,
        error,
      );
    });
  }

  await recordEconomyMetricsSafely(database, {
    amount: claimedItems.reduce((sum, item) => sum + item.values.actual, 0),
    currency: "items",
    direction: "acquired",
    source: "bulk-item-claim",
  });

  const skipped = Math.max(0, items.length - claimedItems.length);
  const collectedLabel =
    claimedItems.length === 1 ? "artwork" : "artworks";
  const message =
    skipped > 0
      ? `Collected the ${claimedItems.length} most valuable ${collectedLabel} that fit. ${skipped} ${skipped === 1 ? "artwork remains" : "artworks remain"} unclaimed because your inventory is full.`
      : `Collected ${claimedItems.length} ${collectedLabel}.`;

  return NextResponse.json({
    status: "ok",
    claimed: claimedItems.length,
    skipped,
    message,
  });
}
