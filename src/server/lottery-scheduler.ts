import { getGameplaySettings } from "./game-settings.ts";
import { getDatabase } from "./mongodb.ts";
import { settleRaffleIfDue } from "./raffle-gameplay.ts";

const LOTTERY_CHECK_INTERVAL_MS = 60 * 1000;

type LotterySchedulerGlobal = typeof globalThis & {
  artfunkLotteryCheck?: Promise<void>;
  artfunkLotteryTimer?: NodeJS.Timeout;
};

const schedulerGlobal = globalThis as LotterySchedulerGlobal;

async function checkLottery(): Promise<void> {
  if (schedulerGlobal.artfunkLotteryCheck) {
    return schedulerGlobal.artfunkLotteryCheck;
  }
  schedulerGlobal.artfunkLotteryCheck = (async () => {
    const database = await getDatabase();
    const settings = await getGameplaySettings(database);
    await settleRaffleIfDue(database, settings.active);
  })();
  try {
    await schedulerGlobal.artfunkLotteryCheck;
  } catch (error) {
    console.error("Unable to settle scheduled lottery drawing", error);
  } finally {
    schedulerGlobal.artfunkLotteryCheck = undefined;
  }
}

export function startLotteryScheduler(): void {
  if (schedulerGlobal.artfunkLotteryTimer) return;

  void checkLottery();
  schedulerGlobal.artfunkLotteryTimer = setInterval(
    () => void checkLottery(),
    LOTTERY_CHECK_INTERVAL_MS,
  );
  schedulerGlobal.artfunkLotteryTimer.unref();
}
