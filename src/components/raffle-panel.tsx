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
  const [inputs, setInputs] = useState(
    Object.fromEntries(
      initialPrizes.map((prize) => [
        prize.item._id,
        prize.allocatedTickets,
      ]),
    ),
  );
  const [pendingItemId, setPendingItemId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function allocate(prize: RafflePrizeView) {
    const tickets = inputs[prize.item._id] ?? 0;
    setPendingItemId(prize.item._id);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/play/raffle/entries", {
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
        throw new Error(body.error ?? "The raffle entry could not be saved.");
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
      setMessage(body.message ?? "Raffle allocation saved.");
    } catch (allocationError) {
      setError(
        allocationError instanceof Error
          ? allocationError.message
          : "The raffle entry could not be saved.",
      );
    } finally {
      setPendingItemId("");
    }
  }

  return (
    <section className="raffle-panel">
      <header className="raffle-heading">
        <div>
          <p>Weekly collection drawing</p>
          <h2>Raffle</h2>
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
        Allocate tickets only to the prizes you want. Allocated tickets are
        committed to that prize until the drawing, but you may change or remove
        an allocation beforehand.
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
                Potency tier {prize.potency}/10
              </span>
              <ItemCard
                interactive={false}
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
                <label>
                  Tickets
                  <input
                    disabled={pendingItemId.length > 0}
                    max={availableTickets + prize.allocatedTickets}
                    min={0}
                    onChange={(event) =>
                      setInputs((current) => ({
                        ...current,
                        [prize.item._id]: Number(event.target.value),
                      }))
                    }
                    type="number"
                    value={inputs[prize.item._id] ?? 0}
                  />
                </label>
                <button
                  disabled={pendingItemId.length > 0}
                  onClick={() => allocate(prize)}
                  type="button"
                >
                  {pendingItemId === prize.item._id
                    ? "Saving..."
                    : "Set allocation"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <div className="raffle-rules">
        <p>
          Each prize has a 20% chance to draw a winner every week and is
          guaranteed to draw at potency tier 10. A rollover increases that
          prize&apos;s potency and value.
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
