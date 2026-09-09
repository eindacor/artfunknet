export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [
    { startAuctionScheduler },
    { startItemExpirationScheduler },
    { startLotteryScheduler },
  ] =
    await Promise.all([
      import("./server/auction-scheduler"),
      import("./server/item-expiration-scheduler"),
      import("./server/lottery-scheduler"),
    ]);
  startAuctionScheduler();
  startItemExpirationScheduler();
  startLotteryScheduler();
}
