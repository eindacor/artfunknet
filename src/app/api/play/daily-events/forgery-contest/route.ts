import { NextResponse } from "next/server";

import {
  ForgeryContestError,
  getForgeryContestPlayerView,
  setForgeryContestVote,
  submitForgeryContestEntry,
} from "@/server/forgery-contest";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

export async function GET() {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  try {
    const database = await getDatabase();
    const contest = await getForgeryContestPlayerView(
      database,
      auth.session.playerId,
    );
    return NextResponse.json({
      submissionsOpen: contest.submissionsOpen,
      votingOpen: contest.votingOpen,
      nextSettlementAt: contest.nextSettlementAt,
      currentEntryId: contest.currentEntry?.id ?? null,
      eligibleItems: contest.eligibleForgeries,
      entries: contest.entries.map((entry) => ({
        id: entry.id,
        playerId: entry.playerId,
        playerName: entry.playerScreenName,
        item: entry.item,
        votes: entry.voteCount,
      })),
      votedEntryId: contest.viewerVoteEntryId,
      lastWinners: contest.lastWinners.map((winner) => ({
        place: winner.place,
        playerId: winner.player_id,
        playerName: winner.player_screen_name,
        votes: winner.votes,
        item: winner.entry_item_snapshot,
      })),
    });
  } catch (error) {
    return contestErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as {
    itemId?: unknown;
  } | null;
  if (typeof body?.itemId !== "string" || !body.itemId.trim()) {
    return NextResponse.json(
      { error: "Choose a forgery to submit." },
      { status: 400 },
    );
  }

  try {
    const database = await getDatabase();
    await submitForgeryContestEntry(
      database,
      auth.session.playerId,
      body.itemId.trim(),
    );
    return NextResponse.json({
      status: "ok",
      message:
        "Your forgery was submitted and permanently removed from your inventory.",
    });
  } catch (error) {
    return contestErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as {
    entryId?: unknown;
  } | null;
  if (typeof body?.entryId !== "string" || !body.entryId.trim()) {
    return NextResponse.json(
      { error: "Choose a contest entry." },
      { status: 400 },
    );
  }

  try {
    const database = await getDatabase();
    await setForgeryContestVote(
      database,
      auth.session.playerId,
      body.entryId.trim(),
    );
    return NextResponse.json({
      status: "ok",
      message: "Your Forgery Contest vote was saved.",
    });
  } catch (error) {
    return contestErrorResponse(error);
  }
}

function contestErrorResponse(error: unknown) {
  if (error instanceof ForgeryContestError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  console.error("Forgery Contest request failed", error);
  return NextResponse.json(
    { error: "The Forgery Contest is temporarily unavailable." },
    { status: 500 },
  );
}
