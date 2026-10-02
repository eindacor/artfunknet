"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import ItemCard from "@/components/item-cards/item-card";
import type { ForgeryContestPlace } from "@/server/forgery-contest";
import type { HydratedGameItem } from "@/server/item-artwork";

const PLACE_NAMES: Record<ForgeryContestPlace, string> = {
  1: "First place",
  2: "Second place",
  3: "Third place",
};

export default function ForgeryContestAdmin({
  nextSettlementAt,
  prizes,
}: {
  nextSettlementAt: string;
  prizes: Array<{
    place: ForgeryContestPlace;
    item: HydratedGameItem;
  }>;
}) {
  const router = useRouter();
  const [pendingPlace, setPendingPlace] =
    useState<ForgeryContestPlace | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function replacePrize(place: ForgeryContestPlace) {
    setPendingPlace(place);
    setMessage("");
    setError("");
    try {
      const response = await fetch(
        "/api/admin/daily-events/forgery-contest",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ place }),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(
          body.error ?? "The Forgery Contest prize could not be replaced.",
        );
      }
      setMessage(body.message ?? "Forgery Contest prize replaced.");
      router.refresh();
    } catch (replacementError) {
      setError(
        replacementError instanceof Error
          ? replacementError.message
          : "The Forgery Contest prize could not be replaced.",
      );
    } finally {
      setPendingPlace(null);
    }
  }

  return (
    <div className="daily-event-admin">
      <p>
        Next settlement:{" "}
        <time dateTime={nextSettlementAt} suppressHydrationWarning>
          {new Date(nextSettlementAt).toLocaleString()}
        </time>
      </p>
      <p>
        Prizes are mint items generated with elevated foil and unlocked odds,
        using a random active non-museum art style.
      </p>
      {message ? <p>{message}</p> : null}
      {error ? <p className="admin-error">{error}</p> : null}
      <div className="admin-raffle-live-grid">
        {prizes.map(({ place, item }) => (
          <article className="admin-raffle-live-prize" key={place}>
            <h2>{PLACE_NAMES[place]}</h2>
            <ItemCard
              item={item}
              legendaryAttributes={[]}
              permissions={{
                canManageItem: false,
                canCustomizeCosmetic: false,
              }}
            />
            <button
              disabled={pendingPlace !== null}
              onClick={() => replacePrize(place)}
              type="button"
            >
              {pendingPlace === place
                ? "Generating..."
                : `Replace ${PLACE_NAMES[place].toLowerCase()} prize`}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
