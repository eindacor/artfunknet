import { maintainPublicAuctions } from "./auction-gameplay.ts";
import { getDatabase } from "./mongodb.ts";

const AUCTION_CHECK_INTERVAL_MS = 60 * 1000;

type AuctionSchedulerGlobal = typeof globalThis & {
  artfunkAuctionCheck?: Promise<void>;
  artfunkAuctionTimer?: NodeJS.Timeout;
};

const schedulerGlobal = globalThis as AuctionSchedulerGlobal;

async function checkAuctions(): Promise<void> {
  if (schedulerGlobal.artfunkAuctionCheck) {
    return schedulerGlobal.artfunkAuctionCheck;
  }
  schedulerGlobal.artfunkAuctionCheck = (async () => {
    const database = await getDatabase();
    await maintainPublicAuctions(database);
  })();
  try {
    await schedulerGlobal.artfunkAuctionCheck;
  } catch (error) {
    console.error("Unable to maintain scheduled Auction House lots", error);
  } finally {
    schedulerGlobal.artfunkAuctionCheck = undefined;
  }
}

export function startAuctionScheduler(): void {
  if (schedulerGlobal.artfunkAuctionTimer) return;

  void checkAuctions();
  schedulerGlobal.artfunkAuctionTimer = setInterval(
    () => void checkAuctions(),
    AUCTION_CHECK_INTERVAL_MS,
  );
  schedulerGlobal.artfunkAuctionTimer.unref();
}
