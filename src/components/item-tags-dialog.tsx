"use client";

import { useEffect, useRef, useState } from "react";

import type { HydratedGameItem } from "@/server/item-artwork";
import {
  normalizeItemTags,
  parseItemTagInput,
} from "@/server/item-tags";

export default function ItemTagsDialog({
  item,
  onClose,
  onSaved,
}: {
  item: HydratedGameItem;
  onClose: () => void;
  onSaved: (tags: string[], message: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [tags, setTags] = useState(item.tags);
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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
      ...tags,
      ...parseItemTagInput(tagInput),
    ]);
    if (!normalized.ok) {
      setError(normalized.error);
      return;
    }
    setTags(normalized.tags);
    setTagInput("");
    setError("");
    inputRef.current?.focus();
  }

  async function saveTags() {
    const normalized = normalizeItemTags([
      ...tags,
      ...parseItemTagInput(tagInput),
    ]);
    if (!normalized.ok) {
      setError(normalized.error);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/play/items/${encodeURIComponent(item._id)}/tags`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tags: normalized.tags }),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        message?: string;
        tags?: string[];
      };
      if (!response.ok || !body.tags) {
        setError(body.error ?? "The item tags could not be updated.");
        return;
      }
      onSaved(body.tags, body.message ?? "Item tags updated.");
    } catch {
      setError("The item tags could not be updated. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      aria-labelledby={`item-tags-title-${item._id}`}
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
        <h2 id={`item-tags-title-${item._id}`}>{item.artwork.title}</h2>
        <p>{item.artwork.artist}</p>
      </header>
      <div className="item-tags-list" aria-label="Current item tags">
        {tags.length > 0 ? (
          tags.map((tag) => (
            <button
              aria-label={`Remove ${tag} tag`}
              disabled={saving}
              key={tag}
              onClick={() =>
                setTags((current) =>
                  current.filter((candidate) => candidate !== tag),
                )
              }
              type="button"
            >
              <span>{tag}</span>
              <i aria-hidden="true" className="fa fa-times" />
            </button>
          ))
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
          {saving ? "Saving..." : "Save tags"}
        </button>
      </footer>
    </dialog>
  );
}
