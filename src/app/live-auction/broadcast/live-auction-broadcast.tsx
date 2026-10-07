"use client";

import { useEffect, useState } from "react";

import { resolveCardRendererId } from "@/components/item-cards/selection";
import {
  ExpandedArtworkDialog,
  StandardItemDetails,
} from "@/components/item-cards/standard-item-dialog";
import type { ArtworkDetailImageAdjustment } from "@/server/gameplay";
import type { LiveAuctionBroadcastView } from "@/server/live-auction-broadcast";

const POLL_INTERVAL_MS = 1_500;

export default function LiveAuctionBroadcast({
  initialView,
}: {
  initialView: LiveAuctionBroadcastView;
}) {
  const [view, setView] = useState(initialView);
  const [expandedArtwork, setExpandedArtwork] = useState<
    "full" | ArtworkDetailImageAdjustment | null
  >(null);

  useEffect(() => {
    let active = true;

    async function refresh() {
      try {
        const response = await fetch("/api/live-auction/broadcast", {
          cache: "no-store",
        });
        const nextView = (await response.json()) as
          | LiveAuctionBroadcastView
          | { error?: string };
        if (!response.ok || !("live" in nextView)) {
          throw new Error(
            "error" in nextView
              ? nextView.error
              : "The live auction could not be refreshed.",
          );
        }
        if (active) setView(nextView);
      } catch (error) {
        console.error(error);
      }
    }

    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  if (view.hidden) {
    return (
      <BroadcastSlate
        eyebrow="Artfunkel Live Auction"
        message="We’ll continue shortly"
      />
    );
  }

  if (view.thankYou) {
    return (
      <BroadcastSlate
        eyebrow="Artfunkel Live Auction"
        message="Thank you for joining us"
      />
    );
  }

  if (
    !view.live ||
    !view.currentItem ||
    view.currentBid === null ||
    view.minimumBid === null ||
    view.increment === null
  ) {
    return (
      <BroadcastSlate
        eyebrow="Artfunkel Live Auction"
        message="The auction will begin shortly"
      />
    );
  }

  const item = view.currentItem;
  const currentBid = view.currentBid;
  const minimumBid = view.minimumBid;
  const increment = view.increment;
  const currentRendererId = resolveCardRendererId({
    itemRendererId: item.card_renderer,
  });

  return (
    <main className="live-auction-broadcast">
      <div className="live-auction-broadcast-backdrop" />
      <header className="live-auction-broadcast-masthead">
        <div>
          <p>Artfunkel presents</p>
          <h1>Live Auction</h1>
        </div>
        <span className="live-auction-broadcast-live">
          <i aria-hidden="true" />
          Live
        </span>
      </header>

      <div className="live-auction-broadcast-layout">
        <section className="live-auction-broadcast-item">
          <div
            className="standard-item-dialog live-auction-broadcast-dialog"
            data-mint={item.mint ? "true" : undefined}
            data-rarity={item.artwork.rarity}
            data-seasonal={item.seasonal ? "true" : undefined}
          >
            <StandardItemDetails
              currentRendererId={currentRendererId}
              item={item}
              key={item._id}
              legendaryAttributes={view.legendaryAttributes}
              onExpandArtwork={(adjustment) =>
                setExpandedArtwork(adjustment ?? "full")
              }
              permissions={{
                canCustomizeCosmetic: false,
                canManageItem: false,
              }}
              viewerId={null}
            />
          </div>
        </section>

        <aside className="live-auction-broadcast-bids">
          <p className="live-auction-broadcast-lot">Now accepting bids</p>
          <dl className="live-auction-bid-summary">
            <div>
              <dt>Current bid</dt>
              <dd>
                {currentBid > 0
                  ? `$${currentBid.toLocaleString()}`
                  : "No bids yet"}
              </dd>
            </div>
            <div>
              <dt>Next minimum</dt>
              <dd>${minimumBid.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Increment</dt>
              <dd>${increment.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Leading bidder</dt>
              <dd>{view.winnerName ?? "No bids yet"}</dd>
            </div>
          </dl>
        </aside>
      </div>
      {expandedArtwork ? (
        <ExpandedArtworkDialog
          adjustment={
            expandedArtwork === "full" ? undefined : expandedArtwork
          }
          alt={`${item.artwork.title} by ${item.artwork.artist}${
            expandedArtwork === "full"
              ? ""
              : ` detail ${expandedArtwork.slot + 1}`
          }`}
          artworkId={item.artwork_id}
          onClose={() => setExpandedArtwork(null)}
        />
      ) : null}
    </main>
  );
}

function BroadcastSlate({
  eyebrow,
  message,
}: {
  eyebrow: string;
  message: string;
}) {
  return (
    <main className="live-auction-broadcast live-auction-broadcast-slate">
      <div className="live-auction-broadcast-backdrop" />
      <div className="live-auction-broadcast-slate-content">
        <p>{eyebrow}</p>
        <h1>{message}</h1>
        <span>Stay tuned</span>
      </div>
    </main>
  );
}
