import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import type { Auction } from "@/server/auction-gameplay";
import {
  getCapsForLevel,
  MAX_PLAYER_LEVEL,
} from "@/server/collection-gameplay";
import { deleteCommunityReactions } from "@/server/community-reaction-cleanup";
import {
  calculateItemValues,
  type Artwork,
  type GameItem,
  type LootData,
} from "@/server/gameplay";
import { getGameplaySettings } from "@/server/game-settings";
import { refreshGalleryMetadata } from "@/server/gallery-metadata";
import { transferIfHallOfFameItem } from "@/server/hall-of-fame";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import { savePlaythroughSnapshot } from "@/server/playthrough-snapshots";
import {
  partitionVintageItems,
  VINTAGE_STARTING_BALANCE,
} from "@/server/vintage-gameplay";

type EraRequest = {
  itemIds?: string[];
  itemId?: string; // Fallback for single item if sent
};

type VintagePlayer = {
  _id: string;
  active: boolean;
  profile: {
    level: number;
    lottery_tickets: number;
    playthrough_stats?: {
      visitors_met: number;
      items_collected: number;
      money_spent: number;
      playthrough_count: number;
    };
    vintage_operation?: {
      token: string;
      expires_at: string;
    };
  };
};

type VintageQuest = {
  _id: string;
  owner_id: string;
  [key: string]: unknown;
};

export async function POST(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as EraRequest | null;
  const submittedItemIds = Array.isArray(body?.itemIds)
    ? body.itemIds.filter((itemId): itemId is string => typeof itemId === "string")
    : typeof body?.itemId === "string"
      ? [body.itemId]
      : [];

  const database = await getDatabase();
  const settings = await getGameplaySettings(database);
  const requiredCount = settings.active.vintageConsiderationCount;

  const player = await database.collection<VintagePlayer>("players").findOne({
    _id: auth.session.playerId,
    active: true,
  });
  if (!player) {
    return NextResponse.json(
      { error: "The active player could not be found." },
      { status: 404 },
    );
  }
  if (player.profile.level < MAX_PLAYER_LEVEL) {
    return NextResponse.json(
      {
        error: `Reach level ${MAX_PLAYER_LEVEL} before entering a new era.`,
      },
      { status: 409 },
    );
  }

  const activeAuctionCount = await database
    .collection<Auction>("auctions")
    .countDocuments({
      $or: [{ seller_id: player._id }, { current_winner_id: player._id }],
    });

  if (activeAuctionCount > 0) {
    return NextResponse.json(
      {
        error:
          "Resolve every auction you are selling or currently winning before entering a new era.",
      },
      { status: 409 },
    );
  }

  const ownedItems = await database
    .collection<GameItem>("items")
    .find({ owner: player._id })
    .toArray();

  const eligibleItems = ownedItems.filter(
    (item) =>
      (item.status === "claimed" || item.status === "displayed") &&
      !item.vintage &&
      !item.original &&
      !item.repairing,
  );

  if (eligibleItems.length < requiredCount) {
    return NextResponse.json(
      {
        error: `Collect at least ${requiredCount} eligible items before entering a new era.`,
      },
      { status: 409 },
    );
  }
  const uniqueSubmittedItemIds = [...new Set(submittedItemIds)];
  if (uniqueSubmittedItemIds.length !== requiredCount) {
    return NextResponse.json(
      {
        error: `Select exactly ${requiredCount} different items for vintage consideration.`,
      },
      { status: 400 },
    );
  }

  const candidateItems = eligibleItems.filter((item) =>
    uniqueSubmittedItemIds.includes(item._id),
  );
  if (candidateItems.length !== requiredCount) {
    return NextResponse.json(
      { error: "Some submitted items are ineligible for vintage consideration." },
      { status: 400 },
    );
  }

  // Pick 1 item randomly from submitted candidates to become Vintage
  const randomIndex = Math.floor(Math.random() * candidateItems.length);
  const selectedItem = candidateItems[randomIndex];

  const now = new Date();
  const operationToken = randomUUID();
  const operationExpiration = new Date(
    now.getTime() + 5 * 60 * 1000,
  ).toISOString();

  const lockedPlayer = await database
    .collection<VintagePlayer>("players")
    .findOneAndUpdate(
      {
        _id: player._id,
        active: true,
        "profile.level": player.profile.level,
        $or: [
          { "profile.vintage_operation": { $exists: false } },
          {
            "profile.vintage_operation.expires_at": {
              $lte: now.toISOString(),
            },
          },
        ],
      },
      {
        $set: {
          "profile.vintage_operation": {
            token: operationToken,
            expires_at: operationExpiration,
          },
        },
      },
      { returnDocument: "after" },
    );
  if (!lockedPlayer) {
    return NextResponse.json(
      { error: "Another new-era operation is already in progress." },
      { status: 409 },
    );
  }

  let artwork: Artwork | null;
  let lootMetadata: { _id: string; loot_data: LootData } | null;
  let quests: VintageQuest[];
  try {
    [artwork, lootMetadata, quests] = await Promise.all([
      database
        .collection<Artwork>("artworks")
        .findOne({ _id: selectedItem.artwork_id }),
      database
        .collection<{ _id: string; loot_data: LootData }>("metadata")
        .findOne({ _id: "loot-data" }),
      database
        .collection<VintageQuest>("quests")
        .find({ owner_id: player._id })
        .toArray(),
    ]);
  } catch (error) {
    await releaseVintageLock(database, player._id, operationToken);
    console.error("Unable to prepare era transition", error);
    return NextResponse.json(
      { error: "The new era could not be prepared." },
      { status: 500 },
    );
  }

  if (!artwork || !lootMetadata) {
    await releaseVintageLock(database, player._id, operationToken);
    return NextResponse.json(
      { error: "Selected artwork metadata is unavailable." },
      { status: 409 },
    );
  }

  // Hydrate gallery items for snapshot
  const galleryItems = ownedItems.filter((item) => item.status === "displayed");
  const artworkIds = Array.from(
    new Set(galleryItems.map((item) => item.artwork_id)),
  );
  const artworks = await database
    .collection<Artwork>("artworks")
    .find({ _id: { $in: artworkIds } })
    .toArray();
  const artworkMap = new Map(artworks.map((a) => [a._id, a]));
  if (artworkMap.size !== artworkIds.length) {
    await releaseVintageLock(database, player._id, operationToken);
    return NextResponse.json(
      { error: "Some displayed artwork metadata is unavailable." },
      { status: 409 },
    );
  }

  const gallerySnapshot = galleryItems.map((item) => {
    const itemArtwork = artworkMap.get(item.artwork_id)!;
    return {
      ...item,
      artwork: { ...itemArtwork, ...item.artwork_overrides },
      artwork_title: itemArtwork.title,
      artist_name: itemArtwork.artist,
    };
  });

  const playthroughNumber =
    (player.profile.playthrough_stats?.playthrough_count || 0) + 1;

  const { keptItems, removedItems } = partitionVintageItems(
    ownedItems,
    selectedItem._id,
  );
  const selectedValues = calculateItemValues(
    { ...selectedItem, vintage: true },
    { ...artwork, ...selectedItem.artwork_overrides },
    lootMetadata.loot_data,
  );
  const selectedItemSnapshot = {
    ...selectedItem,
    vintage: true,
    status: "claimed" as const,
    values: selectedValues,
    artwork: { ...artwork, ...selectedItem.artwork_overrides },
    artwork_title: artwork.title,
    artist_name: artwork.artist,
  };

  let snapshotId: string | null = null;
  const deletedItemIds: string[] = [];
  try {
    const reserved = await database.collection<GameItem>("items").bulkWrite(
      ownedItems.map((item) => ({
        updateOne: {
          filter: {
            _id: item._id,
            owner: item.owner,
            status: item.status,
            vintage_operation_token: { $exists: false },
          },
          update: {
            $set: { vintage_operation_token: operationToken },
          },
        },
      })),
    );
    if (reserved.matchedCount !== ownedItems.length) {
      throw new Error("The player's collection changed during preparation.");
    }

    const snapshot = await savePlaythroughSnapshot(database, {
      player_id: player._id,
      playthrough_number: playthroughNumber,
      created_at: now.toISOString(),
      selected_vintage_item: selectedItemSnapshot,
      gallery_snapshot: gallerySnapshot,
      stats: {
        visitors_met: player.profile.playthrough_stats?.visitors_met || 0,
        items_collected: player.profile.playthrough_stats?.items_collected || 0,
        money_spent: player.profile.playthrough_stats?.money_spent || 0,
      },
    });
    snapshotId = snapshot._id;

    for (const removedItem of removedItems) {
      const isHoF = await transferIfHallOfFameItem(database, removedItem);
      if (!isHoF) {
        const removed = await database.collection<GameItem>("items").deleteOne({
          _id: removedItem._id,
          owner: player._id,
          status: removedItem.status,
          vintage_operation_token: operationToken,
        });
        if (removed.deletedCount !== 1) {
          throw new Error(
            `Item ${removedItem._id} changed before the era transition.`,
          );
        }
        deletedItemIds.push(removedItem._id);
      }
    }

    const retainedExistingItems = keptItems.filter(
      (item) => item._id !== selectedItem._id,
    );
    if (retainedExistingItems.length > 0) {
      const retained = await database.collection<GameItem>("items").updateMany(
        {
          _id: { $in: retainedExistingItems.map((item) => item._id) },
          owner: player._id,
          vintage_operation_token: operationToken,
          $or: [{ vintage: true }, { original: true }],
        },
        {
          $set: {
            status: "claimed",
            repairing: false,
          },
          $unset: {
            repair_tick_at: "",
          },
        },
      );
      if (retained.matchedCount !== retainedExistingItems.length) {
        throw new Error(
          "Not every existing vintage or original item could be retained.",
        );
      }
    }

    const converted = await database.collection<GameItem>("items").updateOne(
      {
        _id: selectedItem._id,
        owner: player._id,
        status: selectedItem.status,
        vintage_operation_token: operationToken,
        vintage: { $ne: true },
        repairing: { $ne: true },
      },
      {
        $set: {
          vintage: true,
          status: "claimed",
          repairing: false,
          values: selectedValues,
          "authenticity.liable": player._id,
          "authenticity.liability_pending": false,
        },
        $unset: {
          repair_tick_at: "",
        },
      },
    );
    if (converted.modifiedCount !== 1) {
      throw new Error("The selected item could not be converted to vintage.");
    }

    if (quests.length > 0) {
      const removedQuests = await database
        .collection("quests")
        .deleteMany({ owner_id: player._id });
      if (removedQuests.deletedCount !== quests.length) {
        throw new Error("Current quests could not be reset.");
      }
    }

    const retainedAfterTransition = await database
      .collection<GameItem>("items")
      .countDocuments({
        _id: { $in: keptItems.map((item) => item._id) },
        owner: player._id,
        vintage_operation_token: operationToken,
      });
    if (retainedAfterTransition !== keptItems.length) {
      throw new Error("The retained collection changed during the transition.");
    }

    const caps = getCapsForLevel(0);
    const reset = await database.collection<VintagePlayer>("players").updateOne(
      {
        _id: player._id,
        active: true,
        "profile.vintage_operation.token": operationToken,
      },
      {
        $set: {
          "profile.level": 0,
          "profile.xp": 0,
          "profile.bank_balance": VINTAGE_STARTING_BALANCE,
          "profile.expansion_slots": 0,
          "profile.last_drop": new Date(
            now.getTime() - 24 * 60 * 60 * 1000,
          ).toISOString(),
          "profile.last_activity": now.toISOString(),
          "profile.last_gallery_payout": now.toISOString(),
          "profile.gallery_money_remainder": 0,
          "profile.gallery_xp_remainder": 0,
          "profile.lottery_tickets": 0,
          "profile.playthrough_stats": {
            visitors_met: 0,
            items_collected: 0,
            money_spent: 0,
            playthrough_count: playthroughNumber,
          },
          ...Object.fromEntries(
            Object.entries(caps).map(([key, value]) => [
              `profile.${key}`,
              value,
            ]),
          ),
        },
        $unset: {
          "profile.vintage_count": "",
          "profile.vintage_operation": "",
        },
      },
    );
    if (reset.modifiedCount !== 1) {
      throw new Error("The player profile could not be reset for the new era.");
    }
  } catch (error) {
    if (snapshotId) {
      await database
        .collection<{ _id: string }>("playthrough_snapshots")
        .deleteOne({ _id: snapshotId })
        .catch((cleanupError) => {
          console.error("Unable to remove failed playthrough snapshot", cleanupError);
        });
    }
    await restoreVintageOperation(
      database,
      player._id,
      operationToken,
      ownedItems,
      quests,
      deletedItemIds,
    );
    console.error("Unable to start new era", error);
    return NextResponse.json(
      { error: "The new era could not be started." },
      { status: 500 },
    );
  }

  await database.collection<GameItem>("items").updateMany(
    { vintage_operation_token: operationToken },
    { $unset: { vintage_operation_token: "" } },
  ).catch((cleanupError) => {
    console.error("Unable to clear completed vintage item reservations", cleanupError);
  });
  await deleteCommunityReactions(
    database,
    "item",
    deletedItemIds,
  );
  await refreshGalleryMetadata(database, player._id);

  return NextResponse.json({
    status: "ok",
    message: `Era #${playthroughNumber} has begun! ${artwork.title} was selected as your new Vintage artwork.`,
  });
}

async function releaseVintageLock(
  database: Awaited<ReturnType<typeof getDatabase>>,
  playerId: string,
  operationToken: string,
) {
  await database.collection<VintagePlayer>("players").updateOne(
    {
      _id: playerId,
      "profile.vintage_operation.token": operationToken,
    },
    { $unset: { "profile.vintage_operation": "" } },
  );
}

async function restoreVintageOperation(
  database: Awaited<ReturnType<typeof getDatabase>>,
  playerId: string,
  operationToken: string,
  items: GameItem[],
  quests: VintageQuest[],
  deletedItemIds: string[],
) {
  try {
    for (const item of items) {
      if (deletedItemIds.includes(item._id)) {
        await database
          .collection<GameItem>("items")
          .replaceOne({ _id: item._id }, item, { upsert: true });
        continue;
      }
      await database.collection<GameItem>("items").replaceOne(
        {
          _id: item._id,
          vintage_operation_token: operationToken,
        },
        item,
      );
    }
    if (quests.length > 0) {
      await Promise.all(
        quests.map((quest) =>
          database
            .collection<VintageQuest>("quests")
            .replaceOne({ _id: quest._id }, quest, { upsert: true }),
        ),
      );
    }
  } finally {
    await releaseVintageLock(database, playerId, operationToken);
  }
}
