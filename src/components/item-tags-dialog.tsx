"use client";

import { useEffect, useRef, useState } from "react";

import type { HydratedGameItem } from "@/server/item-artwork";
import {
  normalizeItemTags,
  parseItemTagInput,
} from "@/server/item-tags";

export default function ItemTagsDialog({
  items,
  onClose,
  onSaved,
}: {
  items: HydratedGameItem[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const primaryItem = items[0];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [addedTags, setAddedTags] = useState<string[]>([]);
  const [removedTags, setRemovedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const originalTagCounts = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.tags) {
      originalTagCounts.set(tag, (originalTagCounts.get(tag) ?? 0) + 1);
    }
  }
  const visibleTags = [
    ...new Set([
      ...originalTagCounts.keys(),
      ...addedTags,
    ]),
  ]
    .filter((tag) => !removedTags.includes(tag))
    .sort((left, right) => left.localeCompare(right));

  useEffect(() => {
    const dialog = dialogRef.current;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (dialog && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    }
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  function closeDialog() {
    if (saving) return;
    if (dialogRef.current?.open) dialogRef.current.close();
    returnFocusRef.current?.focus();
    onClose();
  }

  function addTags() {
    const normalized = normalizeItemTags([
      ...addedTags,
      ...parseItemTagInput(tagInput),
    ]);
    if (!normalized.ok) {
      setError(normalized.error);
      return;
    }
    setAddedTags(normalized.tags);
    setRemovedTags((current) =>
      current.filter((tag) => !normalized.tags.includes(tag)),
    );
    setTagInput("");
    setError("");
    inputRef.current?.focus();
  }

  async function saveTags() {
    const pendingInput = parseItemTagInput(tagInput);
    const normalizedAdditions = normalizeItemTags([
      ...addedTags,
      ...pendingInput,
    ]);
    if (!normalizedAdditions.ok) {
      setError(normalizedAdditions.error);
      return;
    }
    const updates = items.map((item) => {
      const normalized = normalizeItemTags([
        ...item.tags.filter((tag) => !removedTags.includes(tag)),
        ...normalizedAdditions.tags,
      ]);
      return { item, normalized };
    });
    const invalidUpdate = updates.find((update) => !update.normalized.ok);
    if (invalidUpdate && !invalidUpdate.normalized.ok) {
      setError(
        `${invalidUpdate.item.artwork.title}: ${invalidUpdate.normalized.error}`,
      );
      return;
    }

    setSaving(true);
    setError("");
    let savedCount = 0;
    try {
      for (const update of updates) {
        if (!update.normalized.ok) continue;
        const response = await fetch(
          `/api/play/items/${encodeURIComponent(update.item._id)}/tags`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ tags: update.normalized.tags }),
          },
        );
        const body = (await response.json()) as {
          error?: string;
          tags?: string[];
        };
        if (!response.ok || !body.tags) {
          throw new Error(
            body.error ??
              `The tags for ${update.item.artwork.title} could not be updated.`,
          );
        }
        savedCount += 1;
      }
      onSaved(
        `Tags updated for ${savedCount} ${
          savedCount === 1 ? "item" : "items"
        }.`,
      );
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "The item tags could not be updated.";
      setError(
        savedCount > 0
          ? `${savedCount} of ${items.length} items were updated. ${message}`
          : message,
      );
    } finally {
      setSaving(false);
    }
  }

  function removeTag(tag: string) {
    setRemovedTags((current) =>
      current.includes(tag) ? current : [...current, tag],
    );
    setAddedTags((current) =>
      current.filter((candidate) => candidate !== tag),
    );
  }

  const titleId = `item-tags-title-${primaryItem._id}`;

  return (
    <dialog
      aria-labelledby={titleId}
      className="item-tags-dialog"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      ref={dialogRef}
    >
      <button
        aria-label="Close item tags"
        className="reroll-dialog-close item-tags-dialog-close"
        disabled={saving}
        onClick={closeDialog}
        type="button"
      >
        <i aria-hidden="true" className="fa fa-times" />
      </button>
      <header>
        <span className="collection-kicker">item tags</span>
        <h2 id={titleId}>
          {items.length === 1
            ? primaryItem.artwork.title
            : `${items.length} selected items`}
        </h2>
        <p>
          {items.length === 1
            ? primaryItem.artwork.artist
            : "Added tags apply to every item; removed tags are removed from every item."}
        </p>
      </header>
      <div className="item-tags-list" aria-label="Current item tags">
        {visibleTags.length > 0 ? (
          visibleTags.map((tag) => {
            const count = addedTags.includes(tag)
              ? items.length
              : (originalTagCounts.get(tag) ?? 0);
            return (
              <button
                aria-label={`Remove ${tag} tag from selected items`}
                disabled={saving}
                key={tag}
                onClick={() => removeTag(tag)}
                type="button"
              >
                <span>{tag}</span>
                {items.length > 1 ? (
                  <small>
                    {count}/{items.length}
                  </small>
                ) : null}
                <i aria-hidden="true" className="fa fa-times" />
              </button>
            );
          })
        ) : (
          <p>No tags have been added.</p>
        )}
      </div>
      <label className="item-tags-entry">
        <span>Add tags separated by commas</span>
        <span>
          <input
            disabled={saving}
            onChange={(event) => setTagInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTags();
              }
            }}
            placeholder="primary, favorites, for sale"
            ref={inputRef}
            value={tagInput}
          />
          <button
            disabled={saving || tagInput.trim().length === 0}
            onClick={addTags}
            type="button"
          >
            Add
          </button>
        </span>
      </label>
      <p className="item-tags-help">
        Tags are saved in lowercase. The <strong>for sale</strong> tag makes
        eligible inventory available to visiting Art Collectors.
      </p>
      {error ? (
        <p className="item-tags-error" role="alert">
          {error}
        </p>
      ) : null}
      <footer>
        <button disabled={saving} onClick={closeDialog} type="button">
          Cancel
        </button>
        <button disabled={saving} onClick={() => void saveTags()} type="button">
          {saving ? "Saving..." : `Save tags to ${items.length} ${
            items.length === 1 ? "item" : "items"
          }`}
        </button>
      </footer>
    </dialog>
  );
}
