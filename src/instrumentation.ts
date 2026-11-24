export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDailyResyncJob } = await import("@/lib/dailyResync");
    startDailyResyncJob();
  }
}
