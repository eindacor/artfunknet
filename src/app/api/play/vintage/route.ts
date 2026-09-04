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
import { refreshGalleryMetadata } from "@/server/gallery-metadata";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";
import {
  getVintagePlaythroughPermission,
  partitionVintageItems,
  VINTAGE_STARTING_BALANCE,
} from "@/server/vintage-gameplay";

type VintageRequest = {
  itemId?: unknown;
};

type VintagePlayer = {
  _id: string;
  active: boolean;
  profile: {
    level: number;
    lottery_tickets: number;
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

  const body = (await request.json()) as VintageRequest;
  if (typeof body.itemId !== "string" || body.itemId.length === 0) {
    return NextResponse.json(
      { error: "Choose an inventory item to make vintage." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
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
        error: `Reach level ${MAX_PLAYER_LEVEL} before beginning a new playthrough.`,
      },
      { status: 409 },
    );
  }

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
      { error: "Another new-playthrough operation is already in progress." },
      { status: 409 },
    );
  }

  let ownedItems: GameItem[];
  let selectedItem: GameItem | null;
  let activeAuctionCount: number;
  let artwork: Artwork | null;
  let lootMetadata: { _id: string; loot_data: LootData } | null;
  let quests: VintageQuest[];
  try {
    ownedItems = await database.collection<GameItem>("items").find({
      owner: player._id,
    }).toArray();
    selectedItem =
      ownedItems.find((item) => item._id === body.itemId) ?? null;
    [activeAuctionCount, artwork, lootMetadata, quests] = await Promise.all([
      database.collection<Auction>("auctions").countDocuments({
        $or: [
          { seller_id: player._id },
          { current_winner_id: player._id },
        ],
      }),
      selectedItem
        ? database
            .collection<Artwork>("artworks")
            .findOne({ _id: selectedItem.artwork_id })
        : null,
      database
        .collection<{ _id: string; loot_data: LootData }>("metadata")
        .findOne({ _id: "loot-data" }),
      database.collection<VintageQuest>("quests").find({
        owner_id: player._id,
      }).toArray(),
    ]);
  } catch (error) {
    await releaseVintageLock(database, player._id, operationToken);
    console.error("Unable to prepare vintage playthrough", error);
    return NextResponse.json(
      { error: "The new playthrough could not be prepared." },
      { status: 500 },
    );
  }
  const permission = getVintagePlaythroughPermission({
    level: player.profile.level,
    activeAuctionCount,
    selectedItem,
  });
  if (!permission.allowed || !selectedItem || !artwork || !lootMetadata) {
    await releaseVintageLock(database, player._id, operationToken);
    return NextResponse.json(
      {
        error:
          !permission.allowed
            ? permission.reason
            : "The selected artwork data is unavailable.",
      },
      { status: 409 },
    );
  }

  const { keptItems, removedItems } = partitionVintageItems(
    ownedItems,
    selectedItem._id,
  );
  const selectedValues = calculateItemValues(
    { ...selectedItem, vintage: true },
    { ...artwork, ...selectedItem.artwork_overrides },
    lootMetadata.loot_data,
  );

  try {
    if (removedItems.length > 0) {
      const removed = await database.collection<GameItem>("items").deleteMany({
        _id: { $in: removedItems.map((item) => item._id) },
        owner: player._id,
      });
      if (removed.deletedCount !== removedItems.length) {
        throw new Error("Not every non-vintage item could be removed.");
      }
    }

    const retainedExistingItems = keptItems.filter(
      (item) => item._id !== selectedItem._id,
    );
    if (retainedExistingItems.length > 0) {
      const restored = await database.collection<GameItem>("items").updateMany(
        {
          _id: { $in: retainedExistingItems.map((item) => item._id) },
          owner: player._id,
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
      if (restored.matchedCount !== retainedExistingItems.length) {
        throw new Error(
          "Not every existing vintage or original item could be retained.",
        );
      }
    }

    const converted = await database.collection<GameItem>("items").updateOne(
      {
        _id: selectedItem._id,
        owner: player._id,
        status: "claimed",
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
      throw new Error("The selected item could not be made vintage.");
    }

    if (quests.length > 0) {
      const removedQuests = await database
        .collection("quests")
        .deleteMany({ owner_id: player._id });
      if (removedQuests.deletedCount !== quests.length) {
        throw new Error("Current quests could not be reset.");
      }
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
      throw new Error("The player profile could not be reset.");
    }
  } catch (error) {
    await restoreVintageOperation(
      database,
      player._id,
      operationToken,
      ownedItems,
      quests,
    );
    console.error("Unable to begin vintage playthrough", error);
    return NextResponse.json(
      { error: "The new playthrough could not be completed." },
      { status: 500 },
    );
  }
  await deleteCommunityReactions(
    database,
    "item",
    removedItems.map((item) => item._id),
  );
  await refreshGalleryMetadata(database, player._id);

  return NextResponse.json({
    status: "ok",
    message: `${artwork.title} is now vintage. Your new playthrough has begun, and vintage and original items were retained.`,
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
) {
  try {
    await Promise.all(
      items.map((item) =>
        database
          .collection<GameItem>("items")
          .replaceOne({ _id: item._id }, item, { upsert: true }),
      ),
    );
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
