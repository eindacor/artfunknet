import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  createArchiveEntry,
  getArchiveArtStyle,
  getArchiveCategories,
  getArchiveRecordArtStyles,
  getArchiveRecordModifiers,
  type PlayerArtworkArchive,
} from "@/server/archive-gameplay";
import {
  addItemToArchiveRecord,
  ensureArchiveStorage,
  removeItemFromArchiveRecord,
} from "@/server/archive-storage";
import type { GameItem } from "@/server/gameplay";
import { getArchivePermission } from "@/server/item-permissions";
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
  let archiveRecordAdded = false;
  let archiveCompleted = false;
  let item: GameItem | null = null;
  try {
    item = await database.collection<GameItem>("items").findOne({
      _id: id,
      owner: lockedPlayer._id,
      status: { $in: ["claimed", "unclaimed", "for_sale"] },
    });
    if (!item) {
      return NextResponse.json(
        { error: "This item is not eligible for the archive." },
        { status: 409 },
      );
    }
    const archive = await database
      .collection<PlayerArtworkArchive>("player_artwork_archives")
      .findOne({
        owner: lockedPlayer._id,
        artwork_id: item.artwork_id,
      });
    const archivePermission = getArchivePermission(
      item,
      archive ? getArchiveRecordModifiers(archive) : [],
      archive ? getArchiveRecordArtStyles(archive) : [],
    );
    if (!archivePermission.allowed) {
      return NextResponse.json(
        { error: archivePermission.reason },
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

    archiveRecordAdded = await addItemToArchiveRecord(
      database,
      item,
      nowString,
    );
    const cardRendererFilter =
      item.card_renderer === undefined
        ? { card_renderer: { $exists: false } }
        : { card_renderer: item.card_renderer };
    const removed = await database.collection<GameItem>("items").deleteOne({
      _id: item._id,
      owner: lockedPlayer._id,
      status: item.status,
      ...cardRendererFilter,
      condition: item.condition,
      mint: item.mint,
      foil: item.foil,
      unlocked: item.unlocked,
      seasonal: item.seasonal,
      lottery: item.lottery,
      vintage: item.vintage,
      repairing: item.repairing,
      "authenticity.forgery": item.authenticity.forgery,
      "authenticity.identified": item.authenticity.identified,
      "values.actual": item.values.actual,
      "values.dealer": item.values.dealer,
    });
    if (removed.deletedCount !== 1) {
      if (archiveRecordAdded) {
        await removeItemFromArchiveRecord(
          database,
          item.owner,
          item.artwork_id,
          createArchiveEntry(item, nowString),
        );
        archiveRecordAdded = false;
      }
      await refundArchivePurchase(
        database,
        lockedPlayer._id,
        chargedAmount,
      );
      chargedAmount = 0;
      return NextResponse.json(
        { error: "This item changed before it could be archived." },
        { status: 409 },
      );
    }

    archiveCompleted = true;
    const archiveLabel = getArchiveCategories(item).join(" + ");
    const artStyle = getArchiveArtStyle(item);
    return NextResponse.json({
      status: "ok",
      message: `Archived this artwork's ${archiveLabel} modifiers${
        artStyle === "museum" ? "" : ` and ${artStyle} art style`
      }${
        purchaseAmount > 0 ? ` for $${purchaseAmount.toLocaleString()}` : ""
      }. Its $${item.values.actual.toLocaleString()} value was added to the archive record.`,
    });
  } catch (error) {
    if (archiveRecordAdded && !archiveCompleted && item) {
      await removeItemFromArchiveRecord(
        database,
        item.owner,
        item.artwork_id,
        createArchiveEntry(item, nowString),
      ).catch((rollbackError) => {
        console.error("Unable to roll back archive record", rollbackError);
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
