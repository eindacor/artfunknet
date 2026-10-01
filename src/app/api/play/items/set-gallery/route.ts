import { NextResponse } from "next/server";

import { refreshGalleryMetadata } from "@/server/gallery-metadata";
import { planGallerySelection } from "@/server/gallery-selection";
import type { GameItem } from "@/server/gameplay";
import { getDemintUpdate } from "@/server/item-mint";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type SetGalleryRequest = {
  itemIds?: unknown;
};

type PlayerRecord = {
  _id: string;
  active: boolean;
  profile: {
    display_cap: number;
    last_activity: string;
    last_gallery_payout?: string;
  };
};

export async function POST(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as
    | SetGalleryRequest
    | null;
  const itemIds = Array.isArray(body?.itemIds)
    ? [
        ...new Set(
          body.itemIds.filter(
            (itemId): itemId is string =>
              typeof itemId === "string" && itemId.length > 0,
          ),
        ),
      ]
    : [];
  if (itemIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one artwork for the gallery." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const player = await database.collection<PlayerRecord>("players").findOne({
    _id: auth.session.playerId,
    active: true,
  });
  if (!player) {
    return NextResponse.json({ error: "Player was not found." }, { status: 404 });
  }

  const [selectedItems, ownedItems] = await Promise.all([
    database
      .collection<GameItem>("items")
      .find({ _id: { $in: itemIds }, owner: player._id })
      .toArray(),
    database
      .collection<GameItem>("items")
      .find({
        owner: player._id,
        $or: [
          { status: { $in: ["claimed", "displayed", "auctioned"] } },
          { permanent: true },
        ],
      })
      .toArray(),
  ]);
  if (selectedItems.length !== itemIds.length) {
    return NextResponse.json(
      { error: "One or more selected artworks are no longer available." },
      { status: 409 },
    );
  }

  const plan = planGallerySelection(
    selectedItems,
    ownedItems,
    player.profile.display_cap,
  );
  if (!plan.ok) {
    return NextResponse.json({ error: plan.reason }, { status: 409 });
  }

  const selectedById = new Map(selectedItems.map((item) => [item._id, item]));
  const displayedById = new Map(
    ownedItems
      .filter((item) => item.status === "displayed")
      .map((item) => [item._id, item]),
  );
  const displayUpdates = new Map<string, Awaited<ReturnType<typeof getDemintUpdate>>>();
  try {
    for (const itemId of plan.displayIds) {
      const item = selectedById.get(itemId);
      if (!item) continue;
      displayUpdates.set(itemId, await getDemintUpdate(database, item));
    }
  } catch (error) {
    console.error("Unable to prepare Set Gallery value updates", error);
    return NextResponse.json(
      { error: "The value data for a selected artwork is unavailable." },
      { status: 500 },
    );
  }

  const takenDownItems = plan.takeDownIds
    .map((itemId) => displayedById.get(itemId))
    .filter((item): item is GameItem => Boolean(item));
  const newlyDisplayedItems = plan.displayIds
    .map((itemId) => selectedById.get(itemId))
    .filter((item): item is GameItem => Boolean(item));
  const now = new Date().toISOString();

  try {
    if (plan.takeDownIds.length > 0) {
      const takenDown = await database.collection<GameItem>("items").updateMany(
        {
          _id: { $in: plan.takeDownIds },
          owner: player._id,
          status: "displayed",
        },
        {
          $set: { status: "claimed" },
          $unset: { time_displayed: "" },
        },
      );
      if (takenDown.modifiedCount !== plan.takeDownIds.length) {
        throw new Error("Displayed artworks changed before replacement.");
      }
    }

    for (const itemId of plan.displayIds) {
      const demintUpdate = displayUpdates.get(itemId) ?? {};
      const displayed = await database.collection<GameItem>("items").updateOne(
        {
          _id: itemId,
          owner: player._id,
          status: "claimed",
          repairing: { $ne: true },
        },
        {
          $set: {
            ...demintUpdate,
            status: "displayed",
            time_displayed: now,
          },
          $pull: { tags: "for sale" },
        },
      );
      if (displayed.modifiedCount !== 1) {
        throw new Error("A selected artwork changed before it was displayed.");
      }
    }

    const playerUpdated = await database
      .collection<PlayerRecord>("players")
      .updateOne(
        { _id: player._id, active: true },
        {
          $set: {
            "profile.last_activity": now,
            ...(player.profile.last_gallery_payout
              ? {}
              : { "profile.last_gallery_payout": now }),
          },
        },
      );
    if (playerUpdated.matchedCount !== 1) {
      throw new Error("The gallery change could not be applied to the player.");
    }
    await refreshGalleryMetadata(database, player._id);
  } catch (error) {
    console.error("Unable to set gallery; restoring previous display", error);
    await restoreGalleryItems(
      database,
      player._id,
      takenDownItems,
      newlyDisplayedItems,
      now,
    ).catch((restoreError) => {
      console.error(
        "Unable to restore gallery after Set Gallery failure",
        restoreError,
      );
    });
    await refreshGalleryMetadata(database, player._id).catch(
      (metadataError) => {
        console.error("Unable to refresh restored gallery metadata", metadataError);
      },
    );
    return NextResponse.json(
      { error: "The gallery changed before the selection could be applied." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    status: "ok",
    displayed: selectedItems.length,
    added: plan.displayIds.length,
    removed: plan.takeDownIds.length,
    message: `Gallery set to ${selectedItems.length} selected ${selectedItems.length === 1 ? "artwork" : "artworks"}.`,
  });
}

async function restoreGalleryItems(
  database: Awaited<ReturnType<typeof getDatabase>>,
  playerId: string,
  takenDownItems: readonly GameItem[],
  newlyDisplayedItems: readonly GameItem[],
  operationTime: string,
) {
  for (const item of takenDownItems) {
    await database.collection<GameItem>("items").updateOne(
      { _id: item._id, owner: playerId, status: "claimed" },
      {
        $set: {
          status: "displayed",
          ...(item.time_displayed
            ? { time_displayed: item.time_displayed }
            : {}),
        },
        ...(item.time_displayed
          ? {}
          : { $unset: { time_displayed: "" } }),
      },
    );
  }
  for (const item of newlyDisplayedItems) {
    const restoreUpdate = {
      $set: {
        status: "claimed" as const,
        condition: item.condition,
        mint: item.mint,
        mint_value_multiplier: item.mint_value_multiplier,
        values: item.values,
      },
      $unset: { time_displayed: "" as const },
    };
    const filter = {
      _id: item._id,
      owner: playerId,
      status: "displayed" as const,
      time_displayed: operationTime,
    };
    if (item.tags.includes("for sale")) {
      await database.collection<GameItem>("items").updateOne(filter, {
        ...restoreUpdate,
        $addToSet: { tags: "for sale" },
      });
    } else {
      await database
        .collection<GameItem>("items")
        .updateOne(filter, restoreUpdate);
    }
  }
}
