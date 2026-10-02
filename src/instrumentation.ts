export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [
    { startAuctionScheduler },
    { startDailyEventScheduler },
    { startItemExpirationScheduler },
    { startLotteryScheduler },
    { startMasterpieceEffectScheduler },
  ] =
    await Promise.all([
      import("./server/auction-scheduler"),
      import("./server/daily-event-scheduler"),
      import("./server/item-expiration-scheduler"),
      import("./server/lottery-scheduler"),
      import("./server/masterpiece-effect-scheduler"),
    ]);
  startAuctionScheduler();
  startDailyEventScheduler();
  startItemExpirationScheduler();
  startLotteryScheduler();
  startMasterpieceEffectScheduler();
}
