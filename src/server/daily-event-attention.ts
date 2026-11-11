import type { Db } from "mongodb";

import {
  getDailyEventDayIndex,
  getNextDailyEventAt,
  type DailyEventDayIndex,
} from "./daily-event-time.ts";
import {
  FORGERY_CONTEST_STATE_ID,
  getForgeryContestNextSettlementAt,
  type ForgeryContestEntry,
  type ForgeryContestState,
  type ForgeryContestVote,
} from "./forgery-contest.ts";
import { getForgeryContestSchedule } from "./forgery-contest-schedule.ts";
import {
  LIVE_AUCTION_STATE_ID,
  type LiveAuctionState,
} from "./live-auction-event.ts";
import { getFridayCrateView } from "./seasonal-daily-events.ts";

export type DailyEventCallToAction = {
  day: 2 | 3 | 5;
  label: "Enter" | "Vote" | "Claim" | "Live";
  description: string;
  expiresAt: string | null;
};

export type DailyEventAttentionView = {
  currentDay: DailyEventDayIndex;
  nextRefreshAt: string;
  callsToAction: DailyEventCallToAction[];
};

export async function getDailyEventAttention(
  database: Db,
  playerId: string,
  now = new Date(),
): Promise<DailyEventAttentionView> {
  const currentDay = getDailyEventDayIndex(now);
  const schedule = getForgeryContestSchedule(now);
  const midnight = getNextDailyEventAt(
    ((currentDay + 1) % 7) as DailyEventDayIndex,
    0,
    now,
  ).toISOString();
  const [contest, crate, auction] = await Promise.all([
    schedule.phase !== "results"
      ? database.collection<ForgeryContestState>("metadata").findOne(
        { _id: FORGERY_CONTEST_STATE_ID },
        { projection: { cycle_id: 1, next_settlement_at: 1, settlement_lock: 1 } },
      )
      : null,
    currentDay === 5 ? getFridayCrateView(database, playerId, now) : null,
    database.collection<LiveAuctionState>("metadata").findOne(
      { _id: LIVE_AUCTION_STATE_ID },
      { projection: { live: 1 } },
    ),
  ]);
  const callsToAction: DailyEventCallToAction[] = [];
  const settling = contest?.settlement_lock &&
    new Date(contest.settlement_lock.expires_at).getTime() > now.getTime();
  if (schedule.phase !== "results" && !settling) {
    // A missed draw must not make last round's entry suppress the new round.
    const cycleId = contest && contest.next_settlement_at > now.toISOString()
      ? contest.cycle_id
      : getForgeryContestNextSettlementAt(now).toISOString();
    const actionTaken = schedule.submissionsOpen
      ? await database.collection<ForgeryContestEntry>("forgery_contest_entries").findOne(
        { cycle_id: cycleId, player_id: playerId, pending: false },
        { projection: { _id: 1 } },
      )
      : await database.collection<ForgeryContestVote>("forgery_contest_votes").findOne(
        { cycle_id: cycleId, player_id: playerId },
        { projection: { _id: 1 } },
      );
    if (!actionTaken) {
      callsToAction.push({
        day: 2,
        label: schedule.submissionsOpen ? "Enter" : "Vote",
        description: schedule.submissionsOpen
          ? "Submit a forgery to Duper Tuesday"
          : "Cast your Duper Tuesday vote",
        expiresAt: schedule.nextPhaseAt,
      });
    }
  }
  if (auction?.live) {
    callsToAction.push({
      day: 3,
      label: "Live",
      description: "Join the live auction",
      expiresAt: null,
    });
  }
  if (crate?.availableToday && !crate.claimed) {
    callsToAction.push({
      day: 5,
      label: "Claim",
      description: "Claim your free Ultimate crate",
      expiresAt: midnight,
    });
  }
  return {
    currentDay,
    nextRefreshAt: schedule.nextPhaseAt < midnight ? schedule.nextPhaseAt : midnight,
    callsToAction,
  };
}
