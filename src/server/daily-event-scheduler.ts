import { settleForgeryContestIfDue } from "./forgery-contest.ts";
import { getGameplaySettings } from "./game-settings.ts";
import { withDatabase } from "./mongodb.ts";
import { settleRaffleIfDue } from "./raffle-gameplay.ts";
import { settleSeasonalRotationIfDue } from "./seasonal-daily-events.ts";

const DAILY_EVENT_CHECK_INTERVAL_MS = 60 * 1000;

type DailyEventSchedulerGlobal = typeof globalThis & {
  artfunkDailyEventCheck?: Promise<void>;
  artfunkDailyEventTimer?: NodeJS.Timeout;
};

const schedulerGlobal = globalThis as DailyEventSchedulerGlobal;

async function checkDailyEvents(): Promise<void> {
  if (schedulerGlobal.artfunkDailyEventCheck) {
    return schedulerGlobal.artfunkDailyEventCheck;
  }
  schedulerGlobal.artfunkDailyEventCheck = withDatabase(async (database) => {
    const settings = await getGameplaySettings(database);
    const results = await Promise.allSettled([
      settleForgeryContestIfDue(database),
      settleRaffleIfDue(database, settings.active),
      settleSeasonalRotationIfDue(database),
    ]);
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  });
  try {
    await schedulerGlobal.artfunkDailyEventCheck;
  } catch (error) {
    console.error("Unable to settle scheduled daily events", error);
  } finally {
    schedulerGlobal.artfunkDailyEventCheck = undefined;
  }
}

export function startDailyEventScheduler(): void {
  if (schedulerGlobal.artfunkDailyEventTimer) return;
  void checkDailyEvents();
  schedulerGlobal.artfunkDailyEventTimer = setInterval(
    () => void checkDailyEvents(),
    DAILY_EVENT_CHECK_INTERVAL_MS,
  );
  schedulerGlobal.artfunkDailyEventTimer.unref();
}
