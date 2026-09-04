export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [{ startAuctionScheduler }, { startLotteryScheduler }] =
    await Promise.all([
      import("./server/auction-scheduler"),
      import("./server/lottery-scheduler"),
    ]);
  startAuctionScheduler();
  startLotteryScheduler();
}
