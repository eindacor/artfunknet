"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import ItemThumbnail from "@/components/item-thumbnail";
import type { HydratedGameItem } from "@/server/item-artwork";

export default function CommemorateEraDialog({
  items,
  maxCount = 10,
  onClose,
  onContinue,
  onPreviewItem,
}: {
  items: HydratedGameItem[];
  maxCount?: number;
  onClose: () => void;
  onContinue: (selectedItemIds: string[]) => void;
  onPreviewItem?: (item: HydratedGameItem) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const sortedItems = useMemo(
    () =>
      [...items].sort(
        (a, b) => (b.values?.actual ?? 0) - (a.values?.actual ?? 0),
      ),
    [items],
  );

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
      if (current.length >= maxCount) {
        return current;
      }
      return [...current, id];
    });
  }

  return (
    <dialog
      aria-describedby="commemorate-era-description"
      aria-labelledby="commemorate-era-title"
      className="vintage-playthrough-dialog max-w-5xl"
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
            <h2 id="commemorate-era-title" className="text-2xl font-black">Commemorate This Era</h2>
          </div>
          <button
            aria-label="Close modal"
            className="reroll-dialog-close text-neutral-400 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <i aria-hidden="true" className="fa fa-times" />
          </button>
        </header>

        <p id="commemorate-era-description" className="text-sm text-neutral-300">
          Before entering a new era, choose up to <strong>{maxCount} claimed or on-display works</strong> to commemorate.
          These items will be preserved as this era&apos;s gallery snapshot on your legacy page.
        </p>

        <div className="flex justify-between items-center text-xs bg-black/40 px-4 py-2 rounded">
          <span>Select items to commemorate:</span>
          <span className="font-bold text-[var(--accent)]">
            {selectedItemIds.length} / {maxCount} selected
          </span>
        </div>

        <fieldset className="vintage-item-options max-h-[65vh] min-h-[28rem] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pr-2 border-0">
          <legend className="sr-only">Items to commemorate for this era</legend>
          {sortedItems.map((item) => {
            const isSelected = selectedItemIds.includes(item._id);
            return (
              <div
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  isSelected
                    ? "border-[var(--accent)] bg-[var(--accent)]/10"
                    : "border-white/10 bg-black/20 hover:border-white/30"
                }`}
                key={item._id}
                onClick={() => onPreviewItem?.(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onPreviewItem?.(item);
                  }
                }}
              >
                <input
                  aria-label={`Select ${item.artwork.title} to commemorate`}
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleItemSelection(item._id)}
                  onClick={(event) => event.stopPropagation()}
                  disabled={!isSelected && selectedItemIds.length >= maxCount}
                  className="accent-[var(--accent)] h-4 w-4"
                />
                <ItemThumbnail item={item} />
                <div className="flex-1 text-xs">
                  <p className="font-bold text-white">{item.artwork.title}</p>
                  <p className="text-neutral-400">
                    {item.artwork.artist} (
                    <span className={`rarity-text ${item.artwork.rarity}`}>
                      {item.artwork.rarity}
                    </span>
                    )
                  </p>
                  <p className="text-emerald-400 font-mono">${item.values?.actual?.toLocaleString() || 0}</p>
                </div>
              </div>
            );
          })}
        </fieldset>

        <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
          <button
            className="px-4 py-2 text-xs rounded border border-white/20 text-neutral-300 hover:bg-white/10"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="px-6 py-2 text-xs font-bold rounded bg-[var(--accent)] text-black hover:opacity-90 disabled:opacity-50"
            onClick={() => onContinue(selectedItemIds)}
            type="button"
          >
            Continue
          </button>
        </div>
      </div>
    </dialog>
  );
}
