import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getCardCosmetic } from "@/components/item-cards/catalog";
import { calculateDonationKarma } from "@/server/art-expert-gameplay";
import {
  getBulkForgeryDialog,
  getBulkForgeryMessage,
  getFilteredBulkLootCandidates,
  parseBulkSaleProtections,
  processBulkForgeries,
  recoverPendingBulkOperations,
} from "@/server/bulk-sale";
import { deleteCommunityReactions } from "@/server/community-reaction-cleanup";
import { rewardUndetectedForgeryExit } from "@/server/forgery-gameplay";
import type { GameItem } from "@/server/gameplay";
import { removeExpiredTransientItems } from "@/server/item-expiration";
import { ensurePlayerKarma } from "@/server/karma";
import { getDisplayedLegendaryEffect } from "@/server/legendary-attributes";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

export async function POST(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const rawBody = await request.text().catch(() => "");
  const parseResult = parseBulkSaleProtections(rawBody);
  if (!parseResult.ok) {
    return NextResponse.json(
      { error: "The donate-all request is invalid." },
      { status: 400 },
    );
  }
  const protections = parseResult.protections;

  const database = await getDatabase();
  await removeExpiredTransientItems(database);
  await ensurePlayerKarma(database, auth.session.playerId);
  await recoverPendingBulkOperations(database, auth.session.playerId, {
    status: "bulk_donate_pending",
    operationField: "bulk_donation_operation",
    profileOperationsField: "bulk_donation_operations",
  });

  const { candidates, hydratedCandidates, items } =
    await getFilteredBulkLootCandidates(database, auth.session.playerId, protections);

  if (candidates.length === 0) {
    return NextResponse.json(
      { error: "There is no donatable unclaimed loot." },
      { status: 409 },
    );
  }
  if (items.length === 0) {
    return NextResponse.json(
      { error: "No unclaimed loot matches the selected donate-all options." },
      { status: 409 },
    );
  }

  const { validItems: donatableItems, destroyedIds, identifiedIds, caughtIds, hydrated } =
    await processBulkForgeries(database, auth.session.playerId, items, hydratedCandidates, "donate");

  if (donatableItems.length === 0) {
    const message = getBulkForgeryMessage(
      destroyedIds.length,
      identifiedIds.size,
      true,
      "donation",
    );
    return NextResponse.json({
      status: "ok",
      karma: 0,
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

  const bonus = await getDisplayedLegendaryEffect(
    database,
    auth.session.playerId,
    "DONATE_FORGERY_BONUS",
  );

  const hydratedById = new Map(hydrated.map((item) => [item._id, item]));
  let totalKarma = 0;
  const styleIncrements: Record<string, number> = {};

  for (const item of donatableItems) {
    const hydratedItem = hydratedById.get(item._id);
    if (!hydratedItem) continue;

    const style = getCardCosmetic(item.card_renderer ?? "");
    const recoveredStyle =
      style && style.id !== "museum" && !item.authenticity?.forgery
        ? style
        : undefined;

    let itemKarma = calculateDonationKarma({
      rarity: hydratedItem.artwork.rarity,
      level: item.level,
      valueProperties: item,
      hasArtStyle: Boolean(recoveredStyle),
      randomRoll: Math.random(),
    });

    if (item.authenticity.forgery) {
      const multiplier = bonus
        ? item.authenticity.identified ? 2 : 4
        : 1;
      itemKarma = Math.floor(itemKarma * multiplier);
    }

    totalKarma += itemKarma;

    if (recoveredStyle) {
      const key = `profile.card_style_consumables.${recoveredStyle.id}`;
      styleIncrements[key] = (styleIncrements[key] ?? 0) + 1;
    }
  }

  const ids = donatableItems.map((item) => item._id);
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
        status: "bulk_donate_pending",
        bulk_donation_operation: operationId,
      },
    },
  );
  if (reserved.modifiedCount !== donatableItems.length) {
    await database.collection<GameItem>("items").updateMany(
      {
        _id: { $in: ids },
        owner: auth.session.playerId,
        status: "bulk_donate_pending",
      },
      {
        $set: { status: "unclaimed" },
        $unset: { bulk_donation_operation: "" },
      },
    );
    return NextResponse.json(
      { error: "The loot changed before it could all be donated." },
      { status: 409 },
    );
  }

  try {
    const credit = await database.collection<{
      _id: string;
      active: boolean;
      profile: {
        karma?: number;
        card_style_consumables?: Record<string, number>;
        last_activity: string;
        bulk_donation_operations?: string[];
      };
    }>("players").updateOne(
      {
        _id: auth.session.playerId,
        active: true,
        "profile.bulk_donation_operations": { $ne: operationId },
      },
      {
        $inc: {
          "profile.karma": totalKarma,
          ...styleIncrements,
        },
        $set: { "profile.last_activity": new Date().toISOString() },
        $addToSet: { "profile.bulk_donation_operations": operationId },
      },
    );
    if (credit.modifiedCount !== 1) {
      throw new Error("The bulk donation could not be credited.");
    }
    credited = true;

    const removed = await database.collection<GameItem>("items").deleteMany({
      _id: { $in: ids },
      owner: auth.session.playerId,
      status: "bulk_donate_pending",
      bulk_donation_operation: operationId,
    });
    if (removed.deletedCount !== donatableItems.length) {
      throw new Error("The bulk donation cleanup was incomplete.");
    }
    await deleteCommunityReactions(database, "item", ids);
  } catch (error) {
    if (!credited) {
      const player = await database.collection<{
        _id: string;
        profile: { bulk_donation_operations?: string[] };
      }>("players").findOne({ _id: auth.session.playerId });
      credited =
        player?.profile.bulk_donation_operations?.includes(operationId) ?? false;
    }
    if (credited) {
      await database.collection<GameItem>("items").deleteMany({
        owner: auth.session.playerId,
        status: "bulk_donate_pending",
        bulk_donation_operation: operationId,
      });
      await deleteCommunityReactions(database, "item", ids);
    } else {
      await database.collection<GameItem>("items").updateMany(
        {
          owner: auth.session.playerId,
          status: "bulk_donate_pending",
          bulk_donation_operation: operationId,
        },
        {
          $set: { status: "unclaimed" },
          $unset: { bulk_donation_operation: "" },
        },
      );
    }
    console.error("Unable to complete bulk loot donation", error);
    return NextResponse.json(
      {
        error: credited
          ? "The donation was credited, but cleanup had to be recovered."
          : "The bulk donation could not be completed.",
      },
      { status: 500 },
    );
  }

  for (const item of donatableItems) {
    const hydratedItem = hydratedById.get(item._id);
    if (!hydratedItem) continue;
    await rewardUndetectedForgeryExit(database, hydratedItem, {
      artworkTitle: hydratedItem.artwork.title,
      method: "donation",
      removedByPlayerId: auth.session.playerId,
    });
  }

  const totalRecoveredStyles = Object.values(styleIncrements).reduce((a, b) => a + b, 0);
  const styleMsg = totalRecoveredStyles > 0
    ? `, and ${totalRecoveredStyles} art ${totalRecoveredStyles === 1 ? "style was" : "styles were"} recovered`
    : "";
  const message = `Donated ${donatableItems.length} unclaimed ${donatableItems.length === 1 ? "artwork" : "artworks"} for ${totalKarma.toLocaleString()} Karma${styleMsg}${caughtIds.size > 0 ? `; ${getBulkForgeryMessage(destroyedIds.length, identifiedIds.size, false, "donation")}` : ""}.`;

  return NextResponse.json({
    status: "ok",
    karma: totalKarma,
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
