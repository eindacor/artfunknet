import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  getArchiveRecordArtStyles,
  getArchiveRecordModifiers,
  type PlayerArtworkArchive,
} from "@/server/archive-gameplay";
import type { ArtHistorianQuest } from "@/server/art-historian-gameplay";
import {
  type BulkSaleProtections,
  shouldPreserveBulkSaleItem,
} from "@/server/bulk-sale";
import type { GameItem } from "@/server/gameplay";
import { deleteCommunityReactions } from "@/server/community-reaction-cleanup";
import {
  getDisplayedLegendaryEffect,
  getLegendaryNumberParameter,
} from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import { removeExpiredTransientItems } from "@/server/item-expiration";
import { requirePlayerApi } from "@/server/player-api";
import { hydrateGameItems } from "@/server/item-artwork";
import { getPlayerFacingArchivePermission } from "@/server/item-permissions";
import {
  punishForgeryQuality,
  rewardUndetectedForgeryExit,
  rollForgeryDetected,
  shouldDestroyDetectedForgery,
  transferForgeryLiability,
} from "@/server/forgery-gameplay";

export async function POST(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;
  let body: Partial<BulkSaleProtections> = {};
  try {
    const rawBody = await request.text();
    body = rawBody
      ? (JSON.parse(rawBody) as Partial<BulkSaleProtections>)
      : {};
  } catch {
    return NextResponse.json(
      { error: "The sell-all request is invalid." },
      { status: 400 },
    );
  }
  const protections: BulkSaleProtections = {
    keepArtStyles: body.keepArtStyles === true,
    keepLegendaries: body.keepLegendaries === true,
    keepMasterpieces: body.keepMasterpieces === true,
    keepUnfoundQuestTargets: body.keepUnfoundQuestTargets === true,
    keepUnarchived: body.keepUnarchived === true,
  };
  const database = await getDatabase();
  await removeExpiredTransientItems(database);
  await recoverPendingSales(database, auth.session.playerId);
  const candidates = await database.collection<GameItem>("items").find({
    owner: auth.session.playerId,
    status: "unclaimed",
    permanent: { $ne: true },
    original: { $ne: true },
  }).toArray();
  if (candidates.length === 0) {
    return NextResponse.json(
      { error: "There is no sellable unclaimed loot." },
      { status: 409 },
    );
  }
  const hydratedCandidates = await hydrateGameItems(database, candidates);
  let archiveRecords: PlayerArtworkArchive[] = [];
  let quests: Pick<ArtHistorianQuest, "target">[] = [];
  try {
    [archiveRecords, quests] = await Promise.all([
      protections.keepUnarchived
        ? database
            .collection<PlayerArtworkArchive>("player_artwork_archives")
            .find({
              owner: auth.session.playerId,
              artwork_id: {
                $in: hydratedCandidates.map((item) => item.artwork_id),
              },
            })
            .toArray()
        : Promise.resolve([]),
      protections.keepUnfoundQuestTargets
        ? database
            .collection<ArtHistorianQuest>("quests")
            .find({ owner_id: auth.session.playerId })
            .project<Pick<ArtHistorianQuest, "target">>({ target: 1 })
            .toArray()
        : Promise.resolve([]),
    ]);
  } catch (error) {
    console.error("Unable to resolve bulk sale protections", error);
    return NextResponse.json(
      { error: "The bulk sale protections could not be checked." },
      { status: 500 },
    );
  }
  const archiveByArtwork = new Map(
    archiveRecords.map((archive) => [archive.artwork_id, archive]),
  );
  const questTargetIds = new Set(
    quests.flatMap((quest) =>
      Array.isArray(quest.target)
        ? quest.target.filter(
            (artworkId): artworkId is string => typeof artworkId === "string",
          )
        : [],
    ),
  );
  let foundQuestTargetIds = new Set<string>();
  if (questTargetIds.size > 0) {
    try {
      const foundTargets = await database
        .collection<GameItem>("items")
        .find({
          owner: auth.session.playerId,
          status: { $in: ["claimed", "displayed"] },
          artwork_id: { $in: [...questTargetIds] },
        })
        .project<Pick<GameItem, "artwork_id">>({ artwork_id: 1 })
        .toArray();
      foundQuestTargetIds = new Set(
        foundTargets
          .map((item) => item.artwork_id)
          .filter((artworkId): artworkId is string => typeof artworkId === "string"),
      );
    } catch (error) {
      console.error("Unable to resolve found quest targets", error);
      return NextResponse.json(
        { error: "The quest target protection could not be checked." },
        { status: 500 },
      );
    }
  }
  const protectedIds = new Set(
    hydratedCandidates
      .map((item) => {
        const archive = archiveByArtwork.get(item.artwork_id);
        return {
          ...item,
          archivePermission: getPlayerFacingArchivePermission(
            item,
            archive ? getArchiveRecordModifiers(archive) : [],
            archive ? getArchiveRecordArtStyles(archive) : [],
          ),
          unfoundQuestTarget:
            questTargetIds.has(item.artwork_id) &&
            !foundQuestTargetIds.has(item.artwork_id),
        };
      })
      .filter((item) => shouldPreserveBulkSaleItem(item, protections))
      .map((item) => item._id),
  );
  const items = candidates.filter((item) => !protectedIds.has(item._id));
  if (items.length === 0) {
    return NextResponse.json(
      { error: "No unclaimed loot matches the selected sell-all options." },
      { status: 409 },
    );
  }
  await Promise.all(
    items.map((item) =>
      transferForgeryLiability(database, item, auth.session.playerId),
    ),
  );
  const hydrated = hydratedCandidates.filter((item) =>
    items.some((candidate) => candidate._id === item._id),
  );
  const caughtItems = hydrated.filter((item) =>
    rollForgeryDetected(item, "sell"),
  );
  const caughtIds = new Set(caughtItems.map((item) => item._id));
  const destroyedIds = caughtItems
    .filter(shouldDestroyDetectedForgery)
    .map((item) => item._id);
  if (destroyedIds.length > 0) {
    const destroyed = await database.collection<GameItem>("items").deleteMany({
      _id: { $in: destroyedIds },
      owner: auth.session.playerId,
      status: "unclaimed",
      "authenticity.forgery": true,
      "authenticity.identified": true,
    });
    if (destroyed.deletedCount !== destroyedIds.length) {
      return NextResponse.json(
        { error: "Some detected known forgeries could not be destroyed." },
        { status: 409 },
      );
    }
    await deleteCommunityReactions(database, "item", destroyedIds);
  }
  const identifiedIds = new Set(
    caughtItems
      .filter((item) => !shouldDestroyDetectedForgery(item))
      .map((item) => item._id),
  );
  for (const item of items.filter((candidate) =>
    identifiedIds.has(candidate._id),
  )) {
    await database.collection<GameItem>("items").updateOne(
      { _id: item._id, owner: auth.session.playerId, status: "unclaimed" },
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
  }
  const sellableItems = items.filter((item) => !caughtIds.has(item._id));
  if (sellableItems.length === 0) {
    const message = getBulkForgeryMessage(
      destroyedIds.length,
      identifiedIds.size,
      true,
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
  const saleBonus = await getDisplayedLegendaryEffect(
    database,
    auth.session.playerId,
    "UNCLAIMED_ITEM_SELL_BONUS",
  );
  const multiplier = getLegendaryNumberParameter(
    saleBonus,
    "sell_multiplier",
    1,
  );
  const amount = sellableItems.reduce(
    (sum, item) => sum + Math.floor(item.values.sell * multiplier),
    0,
  );
  const ids = sellableItems.map((item) => item._id);
  const operationId = randomUUID();
  let credited = false;
  const reserved = await database.collection<GameItem>("items").updateMany(
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
  if (reserved.modifiedCount !== sellableItems.length) {
    await database.collection<GameItem>("items").updateMany(
      {
        _id: { $in: ids },
        owner: auth.session.playerId,
        status: "bulk_sale_pending",
      },
      {
        $set: { status: "unclaimed" },
        $unset: { bulk_sale_operation: "" },
      },
    );
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
        bulk_sale_operations?: string[];
      };
    }>("players").updateOne(
      {
        _id: auth.session.playerId,
        active: true,
        "profile.bulk_sale_operations": { $ne: operationId },
      },
      {
        $inc: { "profile.bank_balance": amount },
        $set: { "profile.last_activity": new Date().toISOString() },
        $addToSet: { "profile.bulk_sale_operations": operationId },
      },
    );
    if (credit.modifiedCount !== 1) {
      throw new Error("The bulk sale could not be credited.");
    }
    credited = true;
    const removed = await database.collection<GameItem>("items").deleteMany({
      _id: { $in: ids },
      owner: auth.session.playerId,
      status: "bulk_sale_pending",
      bulk_sale_operation: operationId,
    });
    if (removed.deletedCount !== sellableItems.length) {
      throw new Error("The bulk sale cleanup was incomplete.");
    }
    await deleteCommunityReactions(database, "item", ids);
  } catch (error) {
    if (!credited) {
      const player = await database.collection<{
        _id: string;
        profile: { bulk_sale_operations?: string[] };
      }>("players").findOne({ _id: auth.session.playerId });
      credited =
        player?.profile.bulk_sale_operations?.includes(operationId) ?? false;
    }
    if (credited) {
      await database.collection<GameItem>("items").deleteMany({
        owner: auth.session.playerId,
        status: "bulk_sale_pending",
        bulk_sale_operation: operationId,
      });
      await deleteCommunityReactions(database, "item", ids);
    } else {
      await database.collection<GameItem>("items").updateMany(
        {
          owner: auth.session.playerId,
          status: "bulk_sale_pending",
          bulk_sale_operation: operationId,
        },
        {
          $set: { status: "unclaimed" },
          $unset: { bulk_sale_operation: "" },
        },
      );
    }
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
  const message = `Sold ${sellableItems.length} unclaimed ${sellableItems.length === 1 ? "artwork" : "artworks"} for $${amount.toLocaleString()}${caughtIds.size > 0 ? `; ${getBulkForgeryMessage(destroyedIds.length, identifiedIds.size, false)}` : ""}.`;
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

function getBulkForgeryMessage(
  destroyedCount: number,
  identifiedCount: number,
  allDetected: boolean,
): string {
  const outcomes = [
    destroyedCount > 0
      ? `${destroyedCount} known ${destroyedCount === 1 ? "forgery was" : "forgeries were"} detected and destroyed`
      : null,
    identifiedCount > 0
      ? `${identifiedCount} previously unknown ${identifiedCount === 1 ? "forgery was" : "forgeries were"} detected and returned to inventory`
      : null,
  ].filter((outcome): outcome is string => Boolean(outcome));
  const message = outcomes.join("; ");
  return allDetected ? `The sale failed. ${message}.` : message;
}

function getBulkForgeryDialog(
  destroyedCount: number,
  identifiedCount: number,
  message: string,
) {
  return {
    variant:
      destroyedCount > 0 && identifiedCount > 0
        ? "mixed"
        : destroyedCount > 0
          ? "destroyed"
          : "returned",
    title:
      destroyedCount > 0 && identifiedCount > 0
        ? "Forgeries detected"
        : destroyedCount > 0
          ? "Forgery detected"
          : "Forgery identified",
    message,
  };
}

async function recoverPendingSales(
  database: Awaited<ReturnType<typeof getDatabase>>,
  playerId: string,
) {
  const pending = await database.collection<GameItem>("items").find({
    owner: playerId,
    status: "bulk_sale_pending",
    bulk_sale_operation: { $type: "string" },
  }).toArray();
  if (pending.length === 0) return;
  const player = await database.collection<{
    _id: string;
    profile: { bulk_sale_operations?: string[] };
  }>("players").findOne({ _id: playerId });
  const credited = new Set(player?.profile.bulk_sale_operations ?? []);
  for (const operationId of new Set(
    pending
      .map((item) => item.bulk_sale_operation)
      .filter((id): id is string => Boolean(id)),
  )) {
    if (credited.has(operationId)) {
      const operationItemIds = pending
        .filter((item) => item.bulk_sale_operation === operationId)
        .map((item) => item._id);
      await database.collection<GameItem>("items").deleteMany({
        owner: playerId,
        status: "bulk_sale_pending",
        bulk_sale_operation: operationId,
      });
      await deleteCommunityReactions(database, "item", operationItemIds);
    } else {
      await database.collection<GameItem>("items").updateMany(
        {
          owner: playerId,
          status: "bulk_sale_pending",
          bulk_sale_operation: operationId,
        },
        {
          $set: { status: "unclaimed" },
          $unset: { bulk_sale_operation: "" },
        },
      );
    }
  }
}
