"use client";

import { useState } from "react";

import ItemCard from "@/components/item-cards/item-card";
import type { HydratedGameItem } from "@/server/item-artwork";
import type { RaffleWinner } from "@/server/raffle-gameplay";

export type RafflePrizeView = {
  item: HydratedGameItem;
  potency: number;
  allocatedTickets: number;
  totalTickets: number;
};

export default function RafflePanel({
  availableTickets: initialAvailableTickets,
  nextDrawAt,
  prizes: initialPrizes,
  previousWinners,
}: {
  availableTickets: number;
  nextDrawAt: string;
  prizes: RafflePrizeView[];
  previousWinners: RaffleWinner[];
}) {
  const [availableTickets, setAvailableTickets] = useState(
    initialAvailableTickets,
  );
  const [prizes, setPrizes] = useState(initialPrizes);
  const [pendingItemId, setPendingItemId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function allocate(prize: RafflePrizeView) {
    const tickets = prize.allocatedTickets + 1;
    setPendingItemId(prize.item._id);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/play/lottery/entries", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: prize.item._id, tickets }),
      });
      const body = (await response.json()) as {
        allocatedTickets?: number;
        availableTickets?: number;
        error?: string;
        itemId?: string;
        message?: string;
      };
      if (
        !response.ok ||
        body.itemId === undefined ||
        body.allocatedTickets === undefined ||
        body.availableTickets === undefined
      ) {
        throw new Error(body.error ?? "The lottery entry could not be saved.");
      }
      const difference = body.allocatedTickets - prize.allocatedTickets;
      setAvailableTickets(body.availableTickets);
      setPrizes((current) =>
        current.map((candidate) =>
          candidate.item._id === body.itemId
            ? {
                ...candidate,
                allocatedTickets: body.allocatedTickets ?? 0,
                totalTickets: Math.max(
                  0,
                  candidate.totalTickets + difference,
                ),
              }
            : candidate,
        ),
      );
      setMessage(body.message ?? "Lottery allocation saved.");
    } catch (allocationError) {
      setError(
        allocationError instanceof Error
          ? allocationError.message
          : "The lottery entry could not be saved.",
      );
    } finally {
      setPendingItemId("");
    }
  }

  return (
    <section className="raffle-panel">
      <header className="raffle-heading">
        <div>
          <p>Daily collection drawing</p>
          <h2>Lottery</h2>
        </div>
        <dl>
          <div>
            <dt>Available tickets</dt>
            <dd>{availableTickets.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Drawing</dt>
            <dd>{new Date(nextDrawAt).toLocaleString()}</dd>
          </div>
        </dl>
      </header>
      <p className="raffle-introduction">
        Spend tickets only on the items you want. Each press commits one ticket
        to that item until the next daily drawing.
      </p>
      <div className="raffle-prize-grid">
        {prizes.map((prize) => {
          const chance =
            prize.totalTickets > 0
              ? (prize.allocatedTickets / prize.totalTickets) * 100
              : 0;
          return (
            <article className="raffle-prize" key={prize.item._id}>
              <span className="raffle-potency">
                Lottery level {prize.potency}/10
              </span>
              <ItemCard
                item={prize.item}
                legendaryAttributes={[]}
                permissions={{
                  canManageItem: false,
                  canCustomizeCosmetic: false,
                }}
              />
              <div className="raffle-prize-entry">
                <div>
                  <strong>
                    ${prize.item.values.actual.toLocaleString()} value
                  </strong>
                  <span>
                    {prize.allocatedTickets.toLocaleString()} allocated ·{" "}
                    {chance.toFixed(chance > 0 && chance < 1 ? 2 : 1)}% of
                    current entries
                  </span>
                </div>
                <button
                  aria-label="Spend lottery ticket"
                  className="lottery-ticket-action"
                  disabled={
                    pendingItemId.length > 0 || availableTickets <= 0
                  }
                  onClick={() => allocate(prize)}
                  title="Spend lottery ticket"
                  type="button"
                >
                  <i aria-hidden="true" className="fa fa-ticket" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <div className="raffle-rules">
        <p>
          Each item with tickets has a 20% chance to draw a weighted winner
          each day and is guaranteed to hit at lottery level 10. A miss
          increases its lottery level and value. An unticketed level-10 item
          expires and is replaced.
        </p>
        {previousWinners.length > 0 ? (
          <p>
            Latest winner:{" "}
            <strong>{previousWinners.at(-1)?.screen_name}</strong>
          </p>
        ) : null}
      </div>
      {message ? <p className="action-notice success">{message}</p> : null}
      {error ? <p className="action-notice error">{error}</p> : null}
    </section>
  );
}
