import type { Db } from "mongodb";

import {
  getItemKarmaValue,
} from "./art-expert-gameplay.ts";
import {
  calculateItemValues,
  type Artwork,
  type GameItem,
  type LootData,
} from "./gameplay.ts";
import { getDisplayedLegendaryEffect } from "./legendary-attributes.ts";
import { ensurePlayerKarma } from "./karma.ts";
import type { GalleryNpc, NpcQuality } from "./npc-gameplay.ts";

export const PRESERVATIONIST_REPAIR_INTERVAL_MINUTES = 60;
export const MANUAL_REPAIR_AMOUNT = 0.1;

const OWN_GALLERY_MULTIPLIER = 1.75;
const REPAIR_AMOUNTS: Record<NpcQuality, number> = {
  bronze: 0.08,
  silver: 0.1,
  gold: 0.12,
  platinum: 0.14,
};
const DISPLAY_TARGET_CHANCES: Record<NpcQuality, number> = {
  bronze: 0.2,
  silver: 0.25,
  gold: 0.3,
  platinum: 0.35,
};

export type PreservationistInteraction = {
  type: "preservationist-result";
  npcName: string;
  quality: NpcQuality;
  itemTitle: string;
  condition: number;
  previousCondition: number;
  repairedAmount: number;
};

export type RepairSettlementResult = {
  karma: number;
  completedItems: number;
};

type RepairPlayer = {
  _id: string;
  active: boolean;
  profile: {
    karma?: number;
  };
};

export function calculatePreservationistRepair({
  condition,
  quality,
  ownGallery,
}: {
  condition: number;
  quality: NpcQuality;
  ownGallery: boolean;
}): { condition: number; repairedAmount: number } {
  const requestedAmount =
    REPAIR_AMOUNTS[quality] * (ownGallery ? OWN_GALLERY_MULTIPLIER : 1);
  const nextCondition = Number(
    Math.min(Math.max(condition, 0) + requestedAmount, 1).toFixed(2),
  );
  return {
    condition: nextCondition,
    repairedAmount: Number(
      Math.max(0, nextCondition - condition).toFixed(2),
    ),
  };
}

export function getCompletedRepairIntervals(
  repairTickAt: string,
  now: Date,
): number {
  const previous = new Date(repairTickAt).getTime();
  if (!Number.isFinite(previous)) return 0;
  return Math.max(
    0,
    Math.floor(
      (now.getTime() - previous) /
        (PRESERVATIONIST_REPAIR_INTERVAL_MINUTES * 60_000),
    ),
  );
}

export async function grantPreservationistRepair(
  database: Db,
  playerId: string,
  npc: GalleryNpc,
  randomRoll = Math.random(),
): Promise<PreservationistInteraction | null> {
  const targetDisplayed =
    randomRoll < DISPLAY_TARGET_CHANCES[npc.quality];
  const statuses = targetDisplayed
    ? (["displayed", "claimed"] as const)
    : (["claimed", "displayed"] as const);
  let item: GameItem | null = null;
  for (const status of statuses) {
    item = await database.collection<GameItem>("items").findOne(
      {
        owner: playerId,
        status,
        condition: { $lt: 1 },
      },
      { sort: { condition: 1 } },
    );
    if (item) break;
  }
  if (!item) return null;

  const [artwork, metadata] = await Promise.all([
    database.collection<Artwork>("artworks").findOne({
      _id: item.artwork_id,
    }),
    database
      .collection<{ _id: string; loot_data: LootData }>("metadata")
      .findOne({ _id: "loot-data" }),
  ]);
  if (!artwork || !metadata) {
    throw new Error("The selected artwork's value data is unavailable.");
  }

  const repair = calculatePreservationistRepair({
    condition: item.condition,
    quality: npc.quality,
    ownGallery: npc.owner_id === playerId,
  });
  const values = calculateItemValues(
    { ...item, condition: repair.condition },
    { ...artwork, ...item.artwork_overrides },
    metadata.loot_data,
  );
  const updated = await database.collection<GameItem>("items").findOneAndUpdate(
    {
      _id: item._id,
      owner: playerId,
      status: item.status,
      condition: item.condition,
    },
    { $set: { condition: repair.condition, values } },
    { returnDocument: "after" },
  );
  if (!updated) {
    throw new Error(
      "The artwork changed before the Preservationist could refurbish it.",
    );
  }
  return {
    type: "preservationist-result",
    npcName: npc.npc_name,
    quality: npc.quality,
    itemTitle: artwork.title,
    condition: updated.condition,
    previousCondition: item.condition,
    repairedAmount: repair.repairedAmount,
  };
}

export async function settlePlayerItemRepairs(
  database: Db,
  playerId: string,
  now = new Date(),
): Promise<RepairSettlementResult> {
  await ensurePlayerKarma(database, playerId);
  let karma = 0;
  let completedItems = 0;
  const repairingItems = await database.collection<GameItem>("items").find({
    owner: playerId,
    repairing: true,
    status: { $in: ["claimed", "displayed"] },
    condition: { $lt: 1 },
  }).toArray();
  if (repairingItems.length === 0) {
    return { karma, completedItems };
  }

  const missingTickIds = repairingItems
    .filter((item) => !item.repair_tick_at)
    .map((item) => item._id);
  if (missingTickIds.length > 0) {
    await database.collection<GameItem>("items").updateMany(
      {
        _id: { $in: missingTickIds },
        owner: playerId,
        repairing: true,
        repair_tick_at: { $exists: false },
      },
      { $set: { repair_tick_at: now.toISOString() } },
    );
  }

  const dueItems = repairingItems.flatMap((item) => {
    if (!item.repair_tick_at) return [];
    const intervals = getCompletedRepairIntervals(item.repair_tick_at, now);
    return intervals > 0 ? [{ item, intervals }] : [];
  });
  if (dueItems.length === 0) {
    return { karma, completedItems };
  }

  const [metadata, karmaEffect, artworks] = await Promise.all([
    database
      .collection<{ _id: string; loot_data: LootData }>("metadata")
      .findOne({ _id: "loot-data" }),
    getDisplayedLegendaryEffect(
      database,
      playerId,
      "KNOWLEDGE_FOR_REPAIR",
    ),
    database.collection<Artwork>("artworks").find({
      _id: { $in: [...new Set(dueItems.map(({ item }) => item.artwork_id))] },
    }).toArray(),
  ]);
  if (!metadata) throw new Error("Loot metadata is not configured.");
  const artworkMap = new Map(artworks.map((artwork) => [artwork._id, artwork]));

  for (const { item, intervals } of dueItems) {
    try {
      const artwork = artworkMap.get(item.artwork_id);
      if (!artwork) {
        console.error(
          `Unable to settle repair for item ${item._id}: artwork ${item.artwork_id} is unavailable.`,
        );
        continue;
      }
      const nextCondition = Number(
        Math.min(item.condition + intervals * MANUAL_REPAIR_AMOUNT, 1).toFixed(
          2,
        ),
      );
      const nextTickAt = new Date(
        new Date(item.repair_tick_at!).getTime() +
          intervals * PRESERVATIONIST_REPAIR_INTERVAL_MINUTES * 60_000,
      ).toISOString();
      const values = calculateItemValues(
        { ...item, condition: nextCondition },
        { ...artwork, ...item.artwork_overrides },
        metadata.loot_data,
      );
      const updated = await database.collection<GameItem>("items").updateOne(
        {
          _id: item._id,
          owner: playerId,
          repairing: true,
          status: { $in: ["claimed", "displayed"] },
          condition: item.condition,
          repair_tick_at: item.repair_tick_at,
        },
        {
          $set: {
            condition: nextCondition,
            values,
            repair_tick_at: nextTickAt,
          },
        },
      );
      if (updated.modifiedCount !== 1) continue;
      if (nextCondition === 1) completedItems += 1;

      if (nextCondition === 1 && karmaEffect) {
        const itemKarma = getItemKarmaValue(artwork.rarity, item.level);
        const playerUpdate = await database.collection<RepairPlayer>("players").updateOne(
          { _id: playerId, active: true },
          { $inc: { "profile.karma": itemKarma } },
        );
        if (playerUpdate.modifiedCount !== 1) {
          const rollback = await database.collection<GameItem>("items").updateOne(
            {
              _id: item._id,
              owner: playerId,
              condition: nextCondition,
              repair_tick_at: nextTickAt,
            },
            {
              $set: {
                condition: item.condition,
                values: item.values,
                repair_tick_at: item.repair_tick_at,
              },
            },
          );
          if (rollback.modifiedCount !== 1) {
            console.error(
              `Unable to roll back completed repair for item ${item._id}.`,
            );
          } else {
            completedItems -= 1;
          }
          console.error(
            `Repair Karma could not be added for player ${playerId}, item ${item._id}.`,
          );
          continue;
        }
        karma += itemKarma;
      }
    } catch (error) {
      console.error(`Unable to settle repair for item ${item._id}`, error);
    }
  }

  return { karma, completedItems };
}
