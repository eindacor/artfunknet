import { NextResponse } from "next/server";

import { getGameplaySettings } from "@/server/game-settings";
import {
  ensureRaffleState,
  type RaffleEntry,
} from "@/server/raffle-gameplay";
import { getDatabase } from "@/server/mongodb";
import { requirePlayerApi } from "@/server/player-api";

type EntryRequest = {
  itemId?: unknown;
  tickets?: unknown;
};

type Player = {
  _id: string;
  active: boolean;
  profile: { lottery_tickets: number };
};

export async function PATCH(request: Request) {
  const auth = await requirePlayerApi();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as EntryRequest;
  if (
    typeof body.itemId !== "string" ||
    typeof body.tickets !== "number" ||
    !Number.isSafeInteger(body.tickets) ||
    body.tickets < 0
  ) {
    return NextResponse.json(
      { error: "Choose a nonnegative whole number of raffle tickets." },
      { status: 400 },
    );
  }

  const database = await getDatabase();
  const settings = await getGameplaySettings(database);
  const state = await ensureRaffleState(database, settings.active);
  if (
    state.draw_lock &&
    new Date(state.draw_lock.expires_at).getTime() > Date.now()
  ) {
    return NextResponse.json(
      { error: "The raffle drawing is in progress. Try again shortly." },
      { status: 409 },
    );
  }
  if (!state.prizes.some((prize) => prize.item_id === body.itemId)) {
    return NextResponse.json(
      { error: "That raffle prize is no longer available." },
      { status: 409 },
    );
  }

  const entryId = `${auth.session.playerId}:${body.itemId}`;
  const entry = await database
    .collection<RaffleEntry>("raffle_entries")
    .findOne({ _id: entryId });
  const previousTickets = entry?.tickets ?? 0;
  const difference = body.tickets - previousTickets;

  if (difference > 0) {
    const charged = await database.collection<Player>("players").updateOne(
      {
        _id: auth.session.playerId,
        active: true,
        "profile.lottery_tickets": { $gte: difference },
      },
      { $inc: { "profile.lottery_tickets": -difference } },
    );
    if (charged.modifiedCount !== 1) {
      return NextResponse.json(
        { error: "You do not have enough raffle tickets." },
        { status: 409 },
      );
    }
  }

  const now = new Date().toISOString();
  let updated;
  try {
    updated =
      body.tickets === 0
        ? await database.collection<RaffleEntry>("raffle_entries").deleteOne({
            _id: entryId,
            tickets: previousTickets,
          })
        : await database.collection<RaffleEntry>("raffle_entries").updateOne(
            { _id: entryId, ...(entry ? { tickets: previousTickets } : {}) },
            {
              $set: {
                player_id: auth.session.playerId,
                item_id: body.itemId,
                tickets: body.tickets,
                updated_at: now,
              },
            },
            { upsert: !entry },
          );
  } catch {
    if (difference > 0) {
      const refunded = await database.collection<Player>("players").updateOne(
        { _id: auth.session.playerId },
        { $inc: { "profile.lottery_tickets": difference } },
      );
      if (refunded.modifiedCount !== 1) {
        throw new Error("Raffle allocation failed and its ticket refund failed.");
      }
    }
    return NextResponse.json(
      { error: "The raffle allocation could not be saved." },
      { status: 409 },
    );
  }
  const changed =
    "deletedCount" in updated
      ? previousTickets === 0 || updated.deletedCount === 1
      : updated.matchedCount === 1 || updated.upsertedCount === 1;
  if (!changed) {
    if (difference > 0) {
      await database.collection<Player>("players").updateOne(
        { _id: auth.session.playerId },
        { $inc: { "profile.lottery_tickets": difference } },
      );
    }
    return NextResponse.json(
      { error: "Your raffle allocation changed before it could be saved." },
      { status: 409 },
    );
  }
  if (difference < 0) {
    const refunded = await database.collection<Player>("players").updateOne(
      { _id: auth.session.playerId },
      { $inc: { "profile.lottery_tickets": -difference } },
    );
    if (refunded.modifiedCount !== 1) {
      const restored = await database
        .collection<RaffleEntry>("raffle_entries")
        .updateOne(
          { _id: entryId, ...(body.tickets > 0 ? { tickets: body.tickets } : {}) },
          {
            $set: {
              player_id: auth.session.playerId,
              item_id: body.itemId,
              tickets: previousTickets,
              updated_at: now,
            },
          },
          { upsert: body.tickets === 0 },
        );
      if (restored.matchedCount !== 1 && restored.upsertedCount !== 1) {
        throw new Error(
          "Raffle ticket refund and allocation restoration both failed.",
        );
      }
      return NextResponse.json(
        { error: "The raffle tickets could not be returned." },
        { status: 500 },
      );
    }
  }

  const player = await database.collection<Player>("players").findOne({
    _id: auth.session.playerId,
    active: true,
  });
  return NextResponse.json({
    status: "ok",
    itemId: body.itemId,
    allocatedTickets: body.tickets,
    availableTickets: player?.profile.lottery_tickets ?? 0,
    message:
      body.tickets > 0
        ? `${body.tickets} raffle ${body.tickets === 1 ? "ticket" : "tickets"} allocated.`
        : "Raffle allocation removed and tickets returned.",
  });
}
