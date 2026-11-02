import type { Db } from "mongodb";

export type DailyCrateMetadata = {
  time_zone?: string | null;
  last_claimed_at?: string | null;
};

export type DailyCrateState = {
  timeZone: string | null;
  lastClaimedAt: string | null;
};

type DailyCratePlayer = {
  _id: string;
  active: boolean;
  profile: {
    level: number;
    daily_crate?: DailyCrateMetadata;
  };
};

export type DailyCrateClaim = {
  playerId: string;
  playerLevel: number;
  state: DailyCrateState;
  previousClaimedAt: string | null;
};

export function normalizeDailyCrateTimeZone(value: unknown): string | null {
  if (typeof value !== "string" || !value || /^[+-]/.test(value)) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value })
      .resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function getDailyCrateState(value: DailyCrateMetadata | undefined): DailyCrateState {
  const claimed = value?.last_claimed_at ? new Date(value.last_claimed_at) : null;
  return {
    timeZone: normalizeDailyCrateTimeZone(value?.time_zone),
    lastClaimedAt: claimed && Number.isFinite(claimed.getTime())
      ? claimed.toISOString()
      : null,
  };
}

export function getDailyCratePeriod(now: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const date = new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day - (parts.hour < 12 ? 1 : 0),
  ));
  return date.toISOString().slice(0, 10);
}

export function isDailyCrateReady(state: DailyCrateState, now = new Date()): boolean {
  const timeZone = normalizeDailyCrateTimeZone(state.timeZone);
  if (!timeZone || !Number.isFinite(now.getTime())) return false;
  if (!state.lastClaimedAt) return true;
  return getDailyCratePeriod(new Date(state.lastClaimedAt), timeZone)
    < getDailyCratePeriod(now, timeZone);
}

export async function getPlayerDailyCrateState(
  database: Db,
  playerId: string,
): Promise<DailyCrateState | null> {
  const player = await getDailyCratePlayer(database, playerId);
  return player ? getDailyCrateState(player.profile.daily_crate) : null;
}

export async function initializeDailyCrateTimeZone(
  database: Db,
  playerId: string,
  timeZone: string,
): Promise<DailyCrateState | null> {
  const normalized = normalizeDailyCrateTimeZone(timeZone);
  if (!normalized) return null;
  const player = await getDailyCratePlayer(database, playerId);
  if (!player) return null;
  const state = getDailyCrateState(player.profile.daily_crate);
  if (state.timeZone) return state;
  await database.collection<DailyCratePlayer>("players").updateOne(
    {
      _id: playerId,
      active: true,
      "profile.daily_crate.time_zone": player.profile.daily_crate?.time_zone ?? null,
    },
    { $set: { "profile.daily_crate.time_zone": normalized } },
  );
  return getPlayerDailyCrateState(database, playerId);
}

export async function reserveDailyCrateClaim(
  database: Db,
  playerId: string,
  now = new Date(),
): Promise<DailyCrateClaim | null> {
  const player = await getDailyCratePlayer(database, playerId);
  if (!player) return null;
  const state = getDailyCrateState(player.profile.daily_crate);
  if (!isDailyCrateReady(state, now)) return null;
  const previousClaimedAt = player.profile.daily_crate?.last_claimed_at ?? null;
  const claimedAt = now.toISOString();
  const reserved = await database.collection<DailyCratePlayer>("players").findOneAndUpdate(
    {
      _id: playerId,
      active: true,
      "profile.daily_crate.time_zone": player.profile.daily_crate?.time_zone,
      "profile.daily_crate.last_claimed_at": previousClaimedAt,
    },
    { $set: { "profile.daily_crate.last_claimed_at": claimedAt } },
    { returnDocument: "before" },
  );
  return reserved ? {
    playerId,
    playerLevel: reserved.profile.level,
    previousClaimedAt,
    state: { timeZone: state.timeZone, lastClaimedAt: claimedAt },
  } : null;
}

export async function releaseDailyCrateClaim(database: Db, claim: DailyCrateClaim): Promise<void> {
  await database.collection<DailyCratePlayer>("players").updateOne(
    { _id: claim.playerId, "profile.daily_crate.last_claimed_at": claim.state.lastClaimedAt },
    { $set: { "profile.daily_crate.last_claimed_at": claim.previousClaimedAt } },
  );
}

export async function backfillDailyCrateMetadata(database: Db) {
  const playersUpdated = await migrateDailyCratePlayers(database);
  const settings = await database.collection<{ _id: string }>("metadata").updateOne(
    { _id: "gameplay-settings" },
    { $unset: {
      "gameplay.daily_drop_cooldown_minutes": "",
      "gameplay.configs.actual.daily_drop_cooldown_minutes": "",
      "gameplay.configs.debug.daily_drop_cooldown_minutes": "",
    } },
  );
  return { playersUpdated, settingsUpdated: settings.modifiedCount };
}

async function migrateDailyCratePlayers(database: Db, playerId?: string): Promise<number> {
  const filter = playerId ? { _id: playerId } : {};
  const players = database.collection<DailyCratePlayer>("players");
  const renamed = await players.updateMany(
    { ...filter, "profile.last_drop": { $exists: true }, "profile.daily_crate.last_claimed_at": null },
    { $rename: { "profile.last_drop": "profile.daily_crate.last_claimed_at" } },
  );
  const removed = await players.updateMany(
    { ...filter, "profile.last_drop": { $exists: true } },
    { $unset: { "profile.last_drop": "" } },
  );
  return renamed.modifiedCount + removed.modifiedCount;
}

async function getDailyCratePlayer(database: Db, playerId: string): Promise<DailyCratePlayer | null> {
  await migrateDailyCratePlayers(database, playerId);
  return database.collection<DailyCratePlayer>("players").findOne({ _id: playerId, active: true });
}
