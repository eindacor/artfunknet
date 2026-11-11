"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import ItemCard from "@/components/item-cards/item-card";
import { PrizeEditor } from "../raffle-reward-form";
import type { ForgeryContestPlace } from "@/server/forgery-contest";
import type { Artwork } from "@/server/gameplay";
import type { HydratedGameItem } from "@/server/item-artwork";

const PLACE_NAMES: Record<ForgeryContestPlace, string> = {
  1: "First place",
  2: "Second place",
  3: "Third place",
};

export default function ForgeryContestAdmin({
  artworks,
  bufferPrizes,
  minimumBufferCount,
  nextSettlementAt,
  prizes,
}: {
  artworks: Artwork[];
  bufferPrizes: Array<{ place: ForgeryContestPlace; item: HydratedGameItem }>;
  minimumBufferCount: number;
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

  async function changePrize(place: ForgeryContestPlace) {
    setPendingPlace(place);
    setMessage("");
    setError("");
    try {
      const response = await fetch(
        "/api/admin/daily-events/forgery-contest",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ place, action: "replace" }),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(
          body.error ?? "The Duper Tuesday prizes could not be updated.",
        );
      }
      setMessage(body.message ?? "Duper Tuesday prizes updated.");
      router.refresh();
    } catch (replacementError) {
      setError(
        replacementError instanceof Error
          ? replacementError.message
          : "The Duper Tuesday prizes could not be updated.",
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
        Each place has its own two-prize replacement queue. Buffered prizes become active
        in order after the drawing, and the buffer automatically replenishes.
        Newly generated prizes are Mint, with elevated foil and unlocked odds
        and a random active non-museum art style. Edit buffered prizes below;
        active prizes cannot be edited.
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
              onClick={() => changePrize(place)}
              type="button"
            >
              {pendingPlace === place
                ? "Generating..."
                : "Use next buffered prize"}
            </button>
          </article>
        ))}
      </div>
      {([1, 2, 3] as const).map((place) => {
        const buffer = bufferPrizes.filter((prize) => prize.place === place);
        return (
          <section className="admin-raffle-generation" key={place}>
            <h2>{PLACE_NAMES[place]} replacement buffer ({buffer.length}/{minimumBufferCount})</h2>
            <div className="admin-raffle-grid">
              {buffer.map(({ item }, index) => (
                <PrizeEditor
                  artworks={artworks}
                  canRemove={false}
                  contestPlace={place}
                  index={index}
                  key={`${item._id}:${JSON.stringify(item)}`}
                  prize={{ item, potency: item.lottery }}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
