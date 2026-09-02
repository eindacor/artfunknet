import type { Db } from "mongodb";

import {
  ARTWORK_RARITIES,
  type ArtworkRarity,
  type GameItem,
} from "./gameplay.ts";
import { applyXp, getCapsForLevel, getXpChunk } from "./collection-gameplay.ts";
import type { ArchiveCategory, PlayerArtworkArchive } from "./archive-gameplay.ts";

export const BASE_FORGERY_QUALITY = 0.5;
export const FORGERY_LIABILITY_DELAY_MS = 6 * 60 * 60 * 1000;
export const FORGERY_HEAT_RANGES = {
  quest: [0.3, 0.95],
  sell: [0, 0.98],
  donate: [0.1, 0.95],
  collector: [0.3, 0.99],
  display: [0.02, 0.08],
} as const;

export type ForgeryHeatContext = keyof typeof FORGERY_HEAT_RANGES;

type HeatItem = Pick<
  GameItem,
  | "mint"
  | "foil"
  | "unlocked"
  | "seasonal"
  | "vintage"
  | "lottery"
  | "level"
> & {
  authenticity: Pick<GameItem["authenticity"], "forgery_quality" | "identified"> & {
    forgery?: boolean;
  };
  artwork: { rarity: ArtworkRarity };
};

export function calculateForgeryHeat(
  item: HeatItem,
  context: ForgeryHeatContext,
  collectorLegendaryReduction = false,
): number {
  let coefficient =
    0.85 *
    ((ARTWORK_RARITIES.indexOf(item.artwork.rarity) + 1) /
      ARTWORK_RARITIES.length);
  if (item.mint) coefficient += 0.4;
  if (item.foil) coefficient += 0.4;
  if (item.unlocked) coefficient += 0.1;
  if (item.seasonal) coefficient += 0.4;
  if (item.vintage) coefficient += 0.3;
  if (item.lottery > 0) {
    coefficient += 0.6 * (0.75 + 0.25 * (item.lottery / 10));
  }
  if (item.level > 1) coefficient += 0.2 * (item.level / 10);
  coefficient *= 1 - 0.4 * item.authenticity.forgery_quality;

  const [minimum, maximum] = FORGERY_HEAT_RANGES[context];
  let heat = minimum + (maximum - minimum) * Math.min(coefficient, 1);
  if (!item.authenticity.identified) heat *= 0.3;
  if (context === "collector" && collectorLegendaryReduction) heat *= 0.8;
  return Number(heat.toFixed(3));
}

export function rollForgeryDetected(
  item: HeatItem,
  context: ForgeryHeatContext,
  random = Math.random,
  collectorLegendaryReduction = false,
): boolean {
  return (
    Boolean(item.authenticity.forgery) &&
    random() <
      calculateForgeryHeat(item, context, collectorLegendaryReduction)
  );
}

export function calculateForgeCost(actualValue: number): number {
  return Math.floor(
    actualValue * (0.54 + 0.36 * BASE_FORGERY_QUALITY),
  );
}

export function calculateAuthenticationCost(fee: number): number {
  return Math.floor(fee * 0.2);
}

export function getForgedDisplayRewardMultiplier(quality: number): number {
  return 0.5 + 0.4 * quality;
}

export function punishForgeryQuality(quality: number): number {
  return Number(Math.max(quality - 0.1, 0.1).toFixed(2));
}

export function getAuthenticationPermission(
  item: Pick<GameItem, "owner" | "status" | "authenticity">,
  playerId: string,
) {
  if (item.owner !== playerId || item.status !== "claimed") {
    return {
      allowed: false as const,
      reason: "Only owned inventory artwork can be authenticated.",
    };
  }
  if (item.authenticity.identified) {
    return {
      allowed: false as const,
      reason: "This artwork has already been authenticated.",
    };
  }
  return {
    allowed: true as const,
    cost: calculateAuthenticationCost(item.authenticity.fee),
  };
}

export function getRedemptionPermission(
  item: Pick<GameItem, "owner" | "status" | "authenticity">,
  playerId: string,
) {
  if (item.owner !== playerId || item.status !== "claimed") {
    return { allowed: false as const, reason: "Only owned inventory artwork can be reported." };
  }
  if (item.authenticity.identified && !item.authenticity.forgery) {
    return { allowed: false as const, reason: "Identified legitimate artwork cannot be reported." };
  }
  if (item.authenticity.liable === playerId) {
    return { allowed: false as const, reason: "You are liable for this artwork." };
  }
  if (item.authenticity.original_owner === playerId) {
    return { allowed: false as const, reason: "You cannot report artwork you originally introduced." };
  }
  return { allowed: true as const };
}

export function getPlayerFacingRedemptionPermission(
  item: Pick<GameItem, "owner" | "status" | "authenticity">,
  playerId: string,
) {
  if (!item.authenticity.identified) {
    if (item.owner !== playerId || item.status !== "claimed") {
      return {
        allowed: false as const,
        reason: "Only owned inventory artwork can be reported.",
      };
    }
    return { allowed: true as const };
  }
  return getRedemptionPermission(item, playerId);
}

export function validateForgerySelection(
  archive: Pick<PlayerArtworkArchive, "entries">,
  modifiers: unknown,
  artStyle: unknown,
): { modifiers: Exclude<ArchiveCategory, "standard">[]; artStyle: string } {
  if (!Array.isArray(modifiers) || !modifiers.every((value) => typeof value === "string")) {
    throw new Error("Modifiers must be an array of archived modifier names.");
  }
  const selectable = ["mint", "foil", "unlocked", "seasonal", "vintage", "lottery"] as const;
  const unique = new Set(modifiers);
  if (unique.size !== modifiers.length) throw new Error("Duplicate modifiers are not allowed.");
  const archived = new Set(archive.entries.flatMap((entry) => entry.modifiers));
  for (const modifier of unique) {
    if (!selectable.includes(modifier as (typeof selectable)[number]) || !archived.has(modifier as ArchiveCategory)) {
      throw new Error(`The ${modifier} modifier is not represented in this archive.`);
    }
  }
  if (typeof artStyle !== "string" || artStyle.length === 0) {
    throw new Error("Choose a valid art style.");
  }
  const archivedStyles = new Set(archive.entries.map((entry) => entry.art_style));
  if (artStyle !== "museum" && !archivedStyles.has(artStyle)) {
    throw new Error("That art style is not represented in this archive.");
  }
  return {
    modifiers: [...unique] as Exclude<ArchiveCategory, "standard">[],
    artStyle,
  };
}

export function sanitizePlayerFacingAuthenticity<T extends GameItem>(
  item: T,
  maskAll = false,
): T {
  return {
    ...item,
    authenticity: (
      !maskAll && item.authenticity.identified
        ? {
            identified: true,
            forgery: item.authenticity.forgery,
          }
        : { identified: false }
    ) as GameItem["authenticity"],
  };
}

export async function settlePendingForgeryLiability(
  database: Db,
  playerId: string,
  now = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - FORGERY_LIABILITY_DELAY_MS).toISOString();
  const filter = {
      owner: playerId,
      "authenticity.forgery": true,
      "authenticity.identified": false,
      "authenticity.liability_pending": true,
      date_received: { $lte: cutoff },
    } as const;
  const pending = await database.collection<GameItem>("items").find(filter).toArray();
  let settled = 0;
  for (const item of pending) {
    const result = await database.collection<GameItem>("items").updateOne(
      {
        _id: item._id,
        owner: playerId,
        "authenticity.forgery": true,
        "authenticity.identified": false,
        "authenticity.liability_pending": true,
        "authenticity.liable": item.authenticity.liable,
        date_received: { $lte: cutoff },
      },
      {
        $set: {
          "authenticity.liable": playerId,
          "authenticity.liability_pending": false,
        },
      },
    );
    if (result.modifiedCount !== 1) continue;
    settled += 1;
    const formerLiable = item.authenticity.liable;
    if (
      formerLiable &&
      formerLiable !== playerId &&
      !formerLiable.startsWith("system:") &&
      !formerLiable.startsWith("bot:")
    ) {
      await awardForgeryXpChunk(database, formerLiable, 0.8);
    }
  }
  return settled;
}

export async function transferForgeryLiability(
  database: Db,
  item: Pick<GameItem, "_id" | "owner" | "authenticity">,
  playerId: string,
): Promise<boolean> {
  if (
    !item.authenticity.forgery ||
    item.authenticity.liable === playerId
  ) {
    return false;
  }

  const formerLiable = item.authenticity.liable;
  const updated = await database.collection<GameItem>("items").updateOne(
    {
      _id: item._id,
      owner: playerId,
      "authenticity.forgery": true,
      "authenticity.liable": formerLiable,
    },
    {
      $set: {
        "authenticity.liable": playerId,
        "authenticity.liability_pending": false,
      },
    },
  );
  if (updated.modifiedCount !== 1) return false;

  if (
    formerLiable &&
    formerLiable !== playerId &&
    !formerLiable.startsWith("system:") &&
    !formerLiable.startsWith("bot:")
  ) {
    await awardForgeryXpChunk(database, formerLiable, 0.8);
  }
  return true;
}

export async function awardForgeryXpChunk(
  database: Db,
  playerId: string,
  multiplier = 0.8,
): Promise<number> {
  const player = await database.collection<{
    _id: string;
    active: boolean;
    profile: { level: number; xp: number; lottery_tickets: number };
  }>("players").findOne({ _id: playerId, active: true });
  if (!player) return 0;
  const amount = Math.floor(getXpChunk(player.profile.level) * multiplier);
  return awardForgeryXpAmount(database, playerId, amount);
}

export async function awardForgeryXpAmount(
  database: Db,
  playerId: string,
  amount: number,
): Promise<number> {
  amount = Math.max(0, Math.floor(amount));
  const player = await database.collection<{
    _id: string;
    active: boolean;
    profile: { level: number; xp: number; lottery_tickets: number };
  }>("players").findOne({ _id: playerId, active: true });
  if (!player || amount === 0) return 0;
  const progress = applyXp(player.profile.level, player.profile.xp, amount);
  const updated = await database.collection<{
    _id: string;
    active: boolean;
    profile: { level: number; xp: number; lottery_tickets: number };
  }>("players").updateOne(
    { _id: playerId, active: true, "profile.level": player.profile.level, "profile.xp": player.profile.xp },
    {
      $set: {
        "profile.level": progress.level,
        "profile.xp": progress.xp,
        ...Object.fromEntries(Object.entries(getCapsForLevel(progress.level)).map(([key, value]) => [`profile.${key}`, value])),
      },
      $inc: { "profile.lottery_tickets": progress.lotteryTickets },
    },
  );
  return updated.modifiedCount === 1 ? amount : 0;
}
