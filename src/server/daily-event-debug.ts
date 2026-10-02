import "server-only";

import type { Db } from "mongodb";

import {
  isDailyEventDay,
  type DailyEventDayIndex,
  type DailyEventDebugMode,
} from "./daily-event-time.ts";
import { getAdminSession } from "./session.ts";

export class DailyEventDebugError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DailyEventDebugError";
    this.status = status;
  }
}

export function parseDailyEventDebugMode(
  value: unknown,
): DailyEventDebugMode | null {
  if (value === undefined || value === null || value === "") return null;
  if (value === "today" || value === "not-today") return value;
  throw new DailyEventDebugError("The Daily Events day override is invalid.", 400);
}

export async function getDailyEventRequestContext({
  database,
  day,
  mode,
  playerId,
}: {
  database: Db;
  day: DailyEventDayIndex;
  mode: DailyEventDebugMode | null;
  playerId: string;
}): Promise<{ now: Date; activeToday: boolean }> {
  const now = new Date();
  if (!mode) return { now, activeToday: isDailyEventDay(day, now) };
  const [admin, player] = await Promise.all([
    getAdminSession(),
    database.collection<{
      _id: string;
      active: boolean;
      test_account?: boolean;
    }>("players").findOne({
      _id: playerId,
      active: true,
      test_account: true,
    }),
  ]);
  if (!admin || !player) {
    throw new DailyEventDebugError(
      "Active administrator impersonation of a test account is required.",
      403,
    );
  }
  return { now, activeToday: mode === "today" };
}

export async function requireDailyEventDebugAccess(
  database: Db,
  playerId: string,
): Promise<{ adminEmail: string }> {
  const [admin, player] = await Promise.all([
    getAdminSession(),
    database.collection<{
      _id: string;
      active: boolean;
      test_account?: boolean;
    }>("players").findOne({
      _id: playerId,
      active: true,
      test_account: true,
    }),
  ]);
  if (!admin || !player) {
    throw new DailyEventDebugError(
      "Active administrator impersonation of a test account is required.",
      403,
    );
  }
  return { adminEmail: admin.email };
}
