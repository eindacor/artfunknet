export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startLotteryScheduler } = await import(
    "./server/lottery-scheduler"
  );
  startLotteryScheduler();
}
