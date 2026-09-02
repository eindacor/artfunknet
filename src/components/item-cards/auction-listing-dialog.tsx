"use client";

import { useEffect, useRef, useState } from "react";

import type { HydratedGameItem } from "@/server/item-artwork";

export default function AuctionListingDialog({
  item,
  onClose,
  onListed,
}: {
  item: HydratedGameItem;
  onClose: () => void;
  onListed: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [startingBid, setStartingBid] = useState(
    item.values.auction_min.toString(),
  );
  const [buyNow, setBuyNow] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/play/items/${item._id}/auction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startingBid: Number(startingBid),
          buyNow: buyNow.trim() ? Number(buyNow) : null,
          durationMinutes: Number(durationMinutes),
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "Auction failed.");
      onListed(body.message ?? "Auction created.");
      onClose();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "The auction could not be created.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      aria-labelledby={`auction-listing-title-${item._id}`}
      className="auction-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <form
        className="auction-dialog-content"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <header>
          <div>
            <p>Auction House consignment</p>
            <h2 id={`auction-listing-title-${item._id}`}>
              {item.artwork.title}
            </h2>
            <span>{item.artwork.artist}</span>
          </div>
          <i aria-hidden="true" className="fa fa-gavel" />
        </header>
        <p>
          Set a starting price and optional buy-now price. Auctioning does not
          affect Mint condition.
        </p>
        <label>
          Starting price
          <span>
            <i aria-hidden="true" className="fa fa-usd" />
            <input
              min={item.values.auction_min}
              onChange={(event) => setStartingBid(event.target.value)}
              required
              step="1"
              type="number"
              value={startingBid}
            />
          </span>
          <small>
            Minimum ${item.values.auction_min.toLocaleString()}
          </small>
        </label>
        <label>
          Buy-now price <small>optional</small>
          <span>
            <i aria-hidden="true" className="fa fa-usd" />
            <input
              min={Math.max(Number(startingBid) || 0, item.values.auction_min)}
              onChange={(event) => setBuyNow(event.target.value)}
              step="1"
              type="number"
              value={buyNow}
            />
          </span>
        </label>
        <label>
          Duration
          <select
            onChange={(event) => setDurationMinutes(event.target.value)}
            value={durationMinutes}
          >
            <option value="60">1 hour</option>
            <option value="360">6 hours</option>
            <option value="720">12 hours</option>
            <option value="1440">1 day</option>
          </select>
        </label>
        {error ? <p className="auction-dialog-error">{error}</p> : null}
        <footer>
          <button onClick={onClose} type="button">Cancel</button>
          <button disabled={submitting} type="submit">
            <i aria-hidden="true" className="fa fa-gavel" />{" "}
            {submitting ? "Listing..." : "Start auction"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
