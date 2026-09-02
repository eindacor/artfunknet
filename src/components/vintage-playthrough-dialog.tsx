"use client";

import { useEffect, useRef, useState } from "react";

import ArtworkThumbnail from "@/components/artwork-thumbnail";
import type { HydratedGameItem } from "@/server/item-artwork";

export default function VintagePlaythroughDialog({
  items,
  onClose,
  onComplete,
}: {
  items: HydratedGameItem[];
  onClose: () => void;
  onComplete: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  async function beginPlaythrough() {
    if (!selectedItemId) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/play/vintage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: selectedItemId }),
      });
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(
          body.error ?? "The new playthrough could not be started.",
        );
      }
      onComplete(body.message ?? "Your new playthrough has begun.");
    } catch (playthroughError) {
      setError(
        playthroughError instanceof Error
          ? playthroughError.message
          : "The new playthrough could not be started.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      aria-describedby="vintage-playthrough-description"
      aria-labelledby="vintage-playthrough-title"
      className="vintage-playthrough-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <div className="vintage-playthrough-content">
        <header>
          <div>
            <p>New playthrough</p>
            <h2 id="vintage-playthrough-title">Choose a vintage artwork</h2>
          </div>
          <button
            aria-label="Close vintage selection"
            className="reroll-dialog-close"
            disabled={pending}
            onClick={onClose}
            type="button"
          >
            <i aria-hidden="true" className="fa fa-times" />
          </button>
        </header>
        <p id="vintage-playthrough-description">
          Choose one inventory item to carry into the next playthrough. It will
          become vintage. Every item you already own that is marked vintage
          will also be retained, including vintage artwork acquired at auction.
        </p>
        <p className="vintage-playthrough-warning">
          All non-vintage items will be permanently removed. Your level, XP,
          bank balance, and inventory expansions will reset.
        </p>
        <fieldset className="vintage-item-options">
          <legend>Item to make vintage</legend>
          {items.map((item) => (
            <label
              className={selectedItemId === item._id ? "selected" : ""}
              key={item._id}
            >
              <input
                checked={selectedItemId === item._id}
                disabled={pending}
                name="vintage-item"
                onChange={() => setSelectedItemId(item._id)}
                type="radio"
              />
              <ArtworkThumbnail
                alt=""
                artworkId={item.artwork_id}
                className="vintage-item-thumbnail"
              />
              <span>
                <strong>{item.artwork.title}</strong>
                <small>{item.artwork.artist}</small>
                <small>
                  {item.artwork.rarity} · level {item.level} · $
                  {item.values.actual.toLocaleString()}
                </small>
                {item.authenticity.identified &&
                item.authenticity.forgery ? (
                  <small className="vintage-known-forgery">
                    <i aria-hidden="true" className="fa fa-user-secret" /> Known
                    forgery
                  </small>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>
        {error ? (
          <p className="reroll-dialog-error" role="alert">
            {error}
          </p>
        ) : null}
        <footer>
          <button disabled={pending} onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="confirm"
            disabled={pending || !selectedItemId}
            onClick={beginPlaythrough}
            type="button"
          >
            {pending ? "Starting..." : "Begin new playthrough"}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
