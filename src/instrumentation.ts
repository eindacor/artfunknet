export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [
    { startAuctionScheduler },
    { startItemExpirationScheduler },
    { startLotteryScheduler },
    { startMasterpieceEffectScheduler },
  ] =
    await Promise.all([
      import("./server/auction-scheduler"),
      import("./server/item-expiration-scheduler"),
      import("./server/lottery-scheduler"),
      import("./server/masterpiece-effect-scheduler"),
    ]);
  startAuctionScheduler();
  startItemExpirationScheduler();
  startLotteryScheduler();
  startMasterpieceEffectScheduler();
}
