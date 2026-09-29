import type { Db } from "mongodb";

import type { NpcQuality } from "./npc-gameplay.ts";

export const SOCIAL_BATTERY_MAX = 6_000;
export const SOCIAL_BATTERY_RESET_HOUR = 7;
export const SOCIAL_BATTERY_TIME_ZONE = "America/New_York";

export const SOCIAL_BATTERY_VISITOR_COSTS: Record<NpcQuality, number> = {
  bronze: 12,
  silver: 16,
  gold: 20,
  platinum: 24,
};

type SocialBatteryPlayer = {
  _id: string;
  profile?: {
    social_battery?: unknown;
    social_battery_reset_at?: unknown;
  };
};

export function getVisitorSocialBatteryCost(
  quality: NpcQuality,
  ownGallery: boolean,
): number {
  const cost = SOCIAL_BATTERY_VISITOR_COSTS[quality];
  return ownGallery ? cost / 2 : cost;
}

export function getNextSocialBatteryResetAt(now: Date): Date {
  const localNow = getTimeZoneParts(now, SOCIAL_BATTERY_TIME_ZONE);
  const targetDate = new Date(
    Date.UTC(localNow.year, localNow.month - 1, localNow.day),
  );
  if (localNow.hour >= SOCIAL_BATTERY_RESET_HOUR) {
    targetDate.setUTCDate(targetDate.getUTCDate() + 1);
  }
  return getUtcDateForTimeZone(
    {
      year: targetDate.getUTCFullYear(),
      month: targetDate.getUTCMonth() + 1,
      day: targetDate.getUTCDate(),
      hour: SOCIAL_BATTERY_RESET_HOUR,
      minute: 0,
      second: 0,
    },
    SOCIAL_BATTERY_TIME_ZONE,
  );
}

export async function refreshPlayerSocialBattery(
  database: Db,
  playerId: string,
  now = new Date(),
): Promise<{ value: number; resetAt: string }> {
  const players = database.collection<SocialBatteryPlayer>("players");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const player = await players.findOne(
      { _id: playerId },
      {
        projection: {
          "profile.social_battery": 1,
          "profile.social_battery_reset_at": 1,
        },
      },
    );
    if (!player) {
      throw new Error(`Player ${playerId} could not be found.`);
    }

    const currentValue = player.profile?.social_battery;
    const currentResetAt = player.profile?.social_battery_reset_at;
    const parsedResetAt =
      typeof currentResetAt === "string" ? new Date(currentResetAt) : null;
    if (
      typeof currentValue === "number" &&
      Number.isSafeInteger(currentValue) &&
      currentValue >= 0 &&
      currentValue <= SOCIAL_BATTERY_MAX &&
      typeof currentResetAt === "string" &&
      parsedResetAt &&
      Number.isFinite(parsedResetAt.getTime()) &&
      parsedResetAt.getTime() > now.getTime()
    ) {
      return {
        value: currentValue,
        resetAt: currentResetAt,
      };
    }

    const resetAt = getNextSocialBatteryResetAt(now).toISOString();
    const updateResult = await players.updateOne(
      {
        _id: playerId,
        $and: [
          typeof currentValue === "undefined"
            ? { "profile.social_battery": { $exists: false } }
            : { "profile.social_battery": currentValue },
          typeof currentResetAt === "undefined"
            ? { "profile.social_battery_reset_at": { $exists: false } }
            : { "profile.social_battery_reset_at": currentResetAt },
        ],
      },
      {
        $set: {
          "profile.social_battery": SOCIAL_BATTERY_MAX,
          "profile.social_battery_reset_at": resetAt,
        },
      },
    );
    if (updateResult.modifiedCount === 1) {
      return { value: SOCIAL_BATTERY_MAX, resetAt };
    }
  }

  throw new Error(`Player ${playerId} social battery could not be refreshed.`);
}

type TimeZoneParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getTimeZoneParts(date: Date, timeZone: string): TimeZoneParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function getUtcDateForTimeZone(
  target: TimeZoneParts,
  timeZone: string,
): Date {
  const targetWallClock = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second,
  );
  let candidate = targetWallClock;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const actual = getTimeZoneParts(new Date(candidate), timeZone);
    const actualWallClock = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    candidate += targetWallClock - actualWallClock;
  }
  return new Date(candidate);
}
