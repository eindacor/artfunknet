"use client";

import { useEffect, useRef, useState } from "react";

import ItemThumbnail from "@/components/item-thumbnail";
import type { HydratedGameItem } from "@/server/item-artwork";

export default function EnterEraDialog({
  items,
  requiredCount = 10,
  activeAuctionCount = 0,
  onClose,
  onComplete,
}: {
  items: HydratedGameItem[];
  requiredCount?: number;
  activeAuctionCount?: number;
  onClose: () => void;
  onComplete: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const targetCount = requiredCount;
  const hasEnoughItems = items.length >= targetCount;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  function toggleItemSelection(id: string) {
    setSelectedItemIds((current) => {
      if (current.includes(id)) {
        return current.filter((item) => item !== id);
      }
      if (current.length >= targetCount) {
        return current;
      }
      return [...current, id];
    });
  }

  async function beginNewEra() {
    if (activeAuctionCount > 0) {
      setError("Resolve all active auctions before entering a new era.");
      return;
    }
    if (selectedItemIds.length !== targetCount) {
      setError(`Select exactly ${targetCount} items for vintage consideration.`);
      return;
    }

    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/play/vintage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemIds: selectedItemIds }),
      });
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(
          body.error ?? "The new era could not be started.",
        );
      }
      onComplete(body.message ?? "Your new era has begun!");
    } catch (playthroughError) {
      setError(
        playthroughError instanceof Error
          ? playthroughError.message
          : "The new era could not be started.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      aria-describedby="enter-era-description"
      aria-labelledby="enter-era-title"
      className="vintage-playthrough-dialog max-w-3xl"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <div className="vintage-playthrough-content space-y-4 p-6 bg-[#18181b] text-white rounded-xl border border-white/20">
        <header className="flex justify-between items-start border-b border-white/10 pb-3">
          <div>
            <p className="text-xs font-bold text-[var(--accent)] uppercase tracking-wider">Level 50 Prestige</p>
            <h2 id="enter-era-title" className="text-2xl font-black">Enter a New Era</h2>
          </div>
          <button
            aria-label="Close modal"
            className="reroll-dialog-close text-neutral-400 hover:text-white"
            disabled={pending}
            onClick={onClose}
            type="button"
          >
            <i aria-hidden="true" className="fa fa-times" />
          </button>
        </header>

        <p id="enter-era-description" className="text-sm text-neutral-300">
          You are about to begin a new playthrough era! All of your items will be removed except for <strong>one</strong>, which will be randomly chosen from your <strong>{targetCount} items selected for vintage consideration</strong> below. All existing vintage items and original artworks will also be retained.
        </p>

        {activeAuctionCount > 0 && (
          <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
            ⚠️ You currently have <strong>{activeAuctionCount}</strong> active auction(s) (selling or winning). You must resolve all active auctions before starting a new era.
          </div>
        )}
        {!hasEnoughItems && (
          <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            You need {targetCount} eligible items before entering a new era. You currently have {items.length}.
          </div>
        )}

        <div className="flex justify-between items-center text-xs bg-black/40 px-4 py-2 rounded">
          <span>Select items for vintage consideration:</span>
          <span className="font-bold text-[var(--accent)]">
            {selectedItemIds.length} / {targetCount} selected
          </span>
        </div>

        {error && (
          <p className="text-xs font-bold text-red-400 bg-red-500/10 p-2 rounded border border-red-500/20">{error}</p>
        )}

        <fieldset className="vintage-item-options max-h-72 overflow-y-auto space-y-2 pr-2">
          <legend className="sr-only">Items for vintage consideration</legend>
          {items.map((item) => {
            const isSelected = selectedItemIds.includes(item._id);
            return (
              <label
                key={item._id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  isSelected
                    ? "border-[var(--accent)] bg-[var(--accent)]/10"
                    : "border-white/10 bg-black/20 hover:border-white/30"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleItemSelection(item._id)}
                  disabled={pending || (!isSelected && selectedItemIds.length >= targetCount)}
                  className="accent-[var(--accent)] h-4 w-4"
                />
                <ItemThumbnail item={item} />
                <div className="flex-1 text-xs">
                  <p className="font-bold text-white">{item.artwork.title}</p>
                  <p className="text-neutral-400">{item.artwork.artist} ({item.artwork.rarity})</p>
                  <p className="text-emerald-400 font-mono">${item.values?.actual?.toLocaleString() || 0}</p>
                </div>
              </label>
            );
          })}
        </fieldset>

        <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
          <button
            className="px-4 py-2 text-xs rounded border border-white/20 text-neutral-300 hover:bg-white/10"
            onClick={onClose}
            disabled={pending}
            type="button"
          >
            Cancel
          </button>
          <button
            className="px-6 py-2 text-xs font-bold rounded bg-[var(--accent)] text-black hover:opacity-90 disabled:opacity-50"
            onClick={beginNewEra}
            disabled={
              pending ||
              !hasEnoughItems ||
              selectedItemIds.length !== targetCount ||
              activeAuctionCount > 0
            }
            type="button"
          >
            {pending ? "Transitioning..." : "Enter New Era"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
