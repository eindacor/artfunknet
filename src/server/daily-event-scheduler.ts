import { settleForgeryContestIfDue } from "./forgery-contest.ts";
import { getDatabase } from "./mongodb.ts";
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
  schedulerGlobal.artfunkDailyEventCheck = (async () => {
    const database = await getDatabase();
    await Promise.all([
      settleForgeryContestIfDue(database),
      settleSeasonalRotationIfDue(database),
    ]);
  })();
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
