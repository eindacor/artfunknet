import { removeExpiredTransientItems } from "./item-expiration.ts";
import { getDatabase } from "./mongodb.ts";

const ITEM_EXPIRATION_CHECK_INTERVAL_MS = 10 * 1000;

type ItemExpirationSchedulerGlobal = typeof globalThis & {
  artfunkItemExpirationCheck?: Promise<void>;
  artfunkItemExpirationTimer?: NodeJS.Timeout;
};

const schedulerGlobal = globalThis as ItemExpirationSchedulerGlobal;

async function checkItemExpirations(): Promise<void> {
  if (schedulerGlobal.artfunkItemExpirationCheck) {
    return schedulerGlobal.artfunkItemExpirationCheck;
  }
  schedulerGlobal.artfunkItemExpirationCheck = (async () => {
    await removeExpiredTransientItems(await getDatabase());
  })();
  try {
    await schedulerGlobal.artfunkItemExpirationCheck;
  } catch (error) {
    console.error("Unable to remove expired unclaimed items", error);
  } finally {
    schedulerGlobal.artfunkItemExpirationCheck = undefined;
  }
}

export function startItemExpirationScheduler(): void {
  if (schedulerGlobal.artfunkItemExpirationTimer) return;

  void checkItemExpirations();
  schedulerGlobal.artfunkItemExpirationTimer = setInterval(
    () => void checkItemExpirations(),
    ITEM_EXPIRATION_CHECK_INTERVAL_MS,
  );
  schedulerGlobal.artfunkItemExpirationTimer.unref();
}
