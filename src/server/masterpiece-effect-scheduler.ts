import { getDatabase } from "./mongodb.ts";
import { settleDailyMasterpieceInterest } from "./masterpiece-effects.ts";

const INTERVAL_MS = 5 * 60 * 1000;
type SchedulerGlobal = typeof globalThis & {
  artfunkMasterpieceEffectTimer?: NodeJS.Timeout;
  artfunkMasterpieceEffectCheck?: Promise<void>;
};
const schedulerGlobal = globalThis as SchedulerGlobal;

async function check() {
  if (schedulerGlobal.artfunkMasterpieceEffectCheck) {
    return schedulerGlobal.artfunkMasterpieceEffectCheck;
  }
  schedulerGlobal.artfunkMasterpieceEffectCheck = (async () => {
    const database = await getDatabase();
    await settleDailyMasterpieceInterest(database);
  })();
  try {
    await schedulerGlobal.artfunkMasterpieceEffectCheck;
  } finally {
    schedulerGlobal.artfunkMasterpieceEffectCheck = undefined;
  }
}

export function startMasterpieceEffectScheduler() {
  if (schedulerGlobal.artfunkMasterpieceEffectTimer) return;
  void check().catch((error) =>
    console.error("Unable to settle daily masterpiece effects", error),
  );
  schedulerGlobal.artfunkMasterpieceEffectTimer = setInterval(() => {
    void check().catch((error) =>
      console.error("Unable to settle daily masterpiece effects", error),
    );
  }, INTERVAL_MS);
  schedulerGlobal.artfunkMasterpieceEffectTimer.unref();
}
