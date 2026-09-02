import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import type { UpdateFilter } from "mongodb";

import {
  getArchiveCategories,
  getArchiveSignature,
} from "@/server/archive-gameplay";
import { ensureArchiveStorage } from "@/server/archive-storage";
import type { GameItem } from "@/server/gameplay";
import {
  getDisplayedLegendaryEffect,
  getLegendaryNumberParameter,
} from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type ArchivePlayer = {
  _id: string;
  active: boolean;
  profile: {
    bank_balance: number;
    archive_operation?: {
      token: string;
      expires_at: string;
    };
  };
};

const ARCHIVE_LOCK_SECONDS = 30;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const database = await getDatabase();
  await ensureArchiveStorage(database);
  const now = new Date();
  const nowString = now.toISOString();
  const operationToken = randomUUID();
  const lockedPlayer = await database
    .collection<ArchivePlayer>("players")
    .findOneAndUpdate(
      {
        _id: auth.session.playerId,
        active: true,
        $or: [
          { "profile.archive_operation": { $exists: false } },
          { "profile.archive_operation.expires_at": { $lte: nowString } },
        ],
      },
      {
        $set: {
          "profile.archive_operation": {
            token: operationToken,
            expires_at: new Date(
              now.getTime() + ARCHIVE_LOCK_SECONDS * 1_000,
            ).toISOString(),
          },
        },
      },
      { returnDocument: "after" },
    );
  if (!lockedPlayer) {
    return NextResponse.json(
      { error: "Another archive action is already being processed." },
      { status: 409 },
    );
  }

  let chargedAmount = 0;
  let reservedDisplacedItem: GameItem | null = null;
  let archiveCompleted = false;
  try {
    const item = await database.collection<GameItem>("items").findOne({
      _id: id,
      owner: lockedPlayer._id,
      status: { $in: ["claimed", "unclaimed", "for_sale", "archived"] },
    });
    if (!item) {
      return NextResponse.json(
        { error: "This item is not eligible for the archive." },
        { status: 409 },
      );
    }
    if (item.status === "archived" && item.displaced !== true) {
      return NextResponse.json(
        { error: "This item already occupies its archive slot." },
        { status: 409 },
      );
    }
    if (item.original) {
      return NextResponse.json(
        { error: "Original artwork cannot be archived." },
        { status: 409 },
      );
    }
    if (item.repairing) {
      return NextResponse.json(
        { error: "Stop repairing this item before archiving it." },
        { status: 409 },
      );
    }
    if (item.authenticity.forgery && item.authenticity.identified) {
      return NextResponse.json(
        { error: "An identified forgery cannot be archived." },
        { status: 409 },
      );
    }
    if (item.authenticity.forgery) {
      const identifiedForgery = await database
        .collection<GameItem>("items")
        .updateOne(
        {
          _id: item._id,
          owner: lockedPlayer._id,
          status: item.status,
          "authenticity.forgery": true,
          "authenticity.identified": { $ne: true },
        },
        {
          $set: {
            status: "claimed",
            "authenticity.liability_pending": false,
            "authenticity.liable": lockedPlayer._id,
            "authenticity.identified": true,
            "authenticity.forgery_quality": Math.max(
              0.1,
              item.authenticity.forgery_quality - 0.1,
            ),
          },
          $unset: {
            archive_signature: "",
            archive_slot_key: "",
            time_archived: "",
            displaced: "",
          },
          $pull: { tags: "displaced" },
        },
      );
      if (identifiedForgery.modifiedCount !== 1) {
        return NextResponse.json(
          {
            error:
              "This item changed before the archive inspection completed.",
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          error:
            "The archive inspection identified this item as a forgery. It was returned to your inventory.",
        },
        { status: 409 },
      );
    }

    const signature = getArchiveSignature(item);
    const displacedItem = await database.collection<GameItem>("items").findOne({
      _id: { $ne: item._id },
      owner: lockedPlayer._id,
      artwork_id: item.artwork_id,
      status: "archived",
      displaced: { $ne: true },
      archive_signature: signature,
    });
    const discountEffect =
      item.status === "for_sale"
        ? await getDisplayedLegendaryEffect(
            database,
            lockedPlayer._id,
            "DEALER_DISCOUNT",
          )
        : null;
    const purchaseAmount =
      item.status === "for_sale"
        ? Math.floor(
            item.values.dealer *
              getLegendaryNumberParameter(
                discountEffect,
                "cost_multiplier",
                1,
              ),
          )
        : 0;
    if (purchaseAmount > 0) {
      const charged = await database
        .collection<ArchivePlayer>("players")
        .updateOne(
          {
            _id: lockedPlayer._id,
            active: true,
            "profile.archive_operation.token": operationToken,
            "profile.bank_balance": { $gte: purchaseAmount },
          },
          {
            $inc: { "profile.bank_balance": -purchaseAmount },
          },
        );
      if (charged.modifiedCount !== 1) {
        return NextResponse.json(
          { error: "You do not have enough money to archive this offer." },
          { status: 409 },
        );
      }
      chargedAmount = purchaseAmount;
    }

    const archiveSlotKey = `${item.artwork_id}:${signature}`;
    if (displacedItem) {
      const displaced = await database.collection<GameItem>("items").updateOne(
        {
          _id: displacedItem._id,
          owner: lockedPlayer._id,
          status: "archived",
          displaced: { $ne: true },
          archive_signature: signature,
        },
        {
          $set: {
            displaced: true,
            time_archived: nowString,
          },
          $unset: { archive_slot_key: "" },
          $addToSet: { tags: "displaced" },
        },
      );
      if (displaced.modifiedCount !== 1) {
        await refundArchivePurchase(
          database,
          lockedPlayer._id,
          purchaseAmount,
        );
        return NextResponse.json(
          {
            error:
              "The previous archive copy changed before it could be displaced.",
          },
          { status: 409 },
        );
      }
      reservedDisplacedItem = displacedItem;
    }

    const itemDisplacedFilter =
      item.displaced === undefined
        ? { displaced: { $exists: false } }
        : { displaced: item.displaced };
    const archived = await database.collection<GameItem>("items").updateOne(
      {
        _id: item._id,
        owner: lockedPlayer._id,
        status: item.status,
        ...itemDisplacedFilter,
      },
      {
        $set: {
          status: "archived",
          displaced: false,
          archive_signature: signature,
          archive_slot_key: archiveSlotKey,
          time_archived: nowString,
        },
        $pull: { tags: { $in: ["displaced", "for sale"] } },
      },
    );
    if (archived.modifiedCount !== 1) {
      if (reservedDisplacedItem) {
        await restoreDisplacedArchiveItem(
          database,
          reservedDisplacedItem,
        );
        reservedDisplacedItem = null;
      }
      await refundArchivePurchase(
        database,
        lockedPlayer._id,
        purchaseAmount,
      );
      return NextResponse.json(
        { error: "This item changed before it could be archived." },
        { status: 409 },
      );
    }

    archiveCompleted = true;
    reservedDisplacedItem = null;
    const archiveLabel = getArchiveCategories(item).join(" + ");
    return NextResponse.json({
      status: "ok",
      message: `${item.status === "archived" ? "Restored" : "Archived"} this artwork as the active ${archiveLabel} variant${
        displacedItem ? " and displaced the previous copy" : ""
      }${purchaseAmount > 0 ? ` for $${purchaseAmount.toLocaleString()}` : ""}.`,
    });
  } catch (error) {
    if (reservedDisplacedItem && !archiveCompleted) {
      await restoreDisplacedArchiveItem(
        database,
        reservedDisplacedItem,
      ).catch((rollbackError) => {
        console.error("Unable to restore displaced archive item", rollbackError);
      });
    }
    if (chargedAmount > 0 && !archiveCompleted) {
      await refundArchivePurchase(
        database,
        lockedPlayer._id,
        chargedAmount,
      ).catch((refundError) => {
        console.error("Unable to refund failed archive action", refundError);
      });
    }
    console.error("Unable to archive item", error);
    return NextResponse.json(
      { error: "The item could not be archived." },
      { status: 500 },
    );
  } finally {
    await database
      .collection<ArchivePlayer>("players")
      .updateOne(
        {
          _id: lockedPlayer._id,
          "profile.archive_operation.token": operationToken,
        },
        { $unset: { "profile.archive_operation": "" } },
      )
      .catch((error) => {
        console.error("Unable to release archive operation lock", error);
      });
  }
}

async function refundArchivePurchase(
  database: Awaited<ReturnType<typeof getDatabase>>,
  playerId: string,
  amount: number,
) {
  if (amount <= 0) return;
  const refund = await database.collection<ArchivePlayer>("players").updateOne(
    { _id: playerId, active: true },
    { $inc: { "profile.bank_balance": amount } },
  );
  if (refund.modifiedCount !== 1) {
    throw new Error(
      `Unable to refund $${amount} after failed archive purchase for player ${playerId}.`,
    );
  }
}

async function restoreDisplacedArchiveItem(
  database: Awaited<ReturnType<typeof getDatabase>>,
  item: GameItem,
) {
  const archiveSignature = item.archive_signature ?? getArchiveSignature(item);
  const update: UpdateFilter<GameItem> = {
    $set: {
      displaced: false,
      archive_signature: archiveSignature,
      archive_slot_key: `${item.artwork_id}:${archiveSignature}`,
      tags: item.tags,
      ...(item.time_archived
        ? { time_archived: item.time_archived }
        : {}),
    },
    ...(!item.time_archived
      ? { $unset: { time_archived: "" as const } }
      : {}),
  };
  const rollback = await database.collection<GameItem>("items").updateOne(
    {
      _id: item._id,
      owner: item.owner,
      status: "archived",
      displaced: true,
      archive_signature: archiveSignature,
    },
    update,
  );
  if (rollback.modifiedCount !== 1) {
    throw new Error(
      `Unable to restore displaced archive item ${item._id}.`,
    );
  }
}
