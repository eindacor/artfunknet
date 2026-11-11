import {
  getDailyEventDayIndex,
  getMostRecentDailyEventAt,
  getNextDailyEventAt,
} from "./daily-event-time.ts";

export type ForgeryContestPhase = "submissions" | "voting" | "results";

export function getForgeryContestSchedule(now = new Date()) {
  let phase: ForgeryContestPhase = "submissions";
  if (getDailyEventDayIndex(now) === 2) {
    const midnight = getMostRecentDailyEventAt(2, 0, now);
    const noon = getMostRecentDailyEventAt(2, 12, now);
    phase = noon >= midnight ? "results" : "voting";
  }
  const nextPhaseAt = phase === "submissions"
    ? getNextDailyEventAt(2, 0, now)
    : phase === "voting"
      ? getNextDailyEventAt(2, 12, now)
      : getNextDailyEventAt(3, 0, now);
  return {
    phase,
    submissionsOpen: phase === "submissions",
    votingOpen: phase === "voting",
    nextPhaseAt: nextPhaseAt.toISOString(),
  };
}
