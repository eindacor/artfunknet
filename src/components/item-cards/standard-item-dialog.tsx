"use client";

import { useEffect, useRef, useState } from "react";

import ArtworkThumbnail from "@/components/artwork-thumbnail";

import {
  getOwnedCardRendererIds,
  getSelectableCardCosmetics,
} from "./catalog";
import { CompleteItemRecord } from "./shared";
import type {
  CardLegendaryAttribute,
  CardRendererId,
} from "./types";
import type { HydratedGameItem } from "@/server/item-artwork";

export default function StandardItemDialog({
  item,
  legendaryAttributes,
  currentRendererId,
  activeRendererIds,
  ownedRendererIds,
  canCustomize,
  onClose,
  onRendererSelected,
}: {
  item: HydratedGameItem;
  legendaryAttributes: CardLegendaryAttribute[];
  currentRendererId: CardRendererId;
  activeRendererIds?: string[];
  ownedRendererIds?: string[];
  canCustomize: boolean;
  onClose: () => void;
  onRendererSelected: (rendererId: CardRendererId) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [selectedRendererId, setSelectedRendererId] =
    useState<CardRendererId>(currentRendererId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const owned = new Set(getOwnedCardRendererIds(ownedRendererIds));

  useEffect(() => {
    const dialog = dialogRef.current;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  function closeDialog() {
    if (dialogRef.current?.open) dialogRef.current.close();
    returnFocusRef.current?.focus();
    onClose();
  }

  async function applyRenderer() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/play/items/${item._id}/card-renderer`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rendererId: selectedRendererId }),
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "The card style could not be applied.");
      }
      onRendererSelected(selectedRendererId);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The card style could not be applied.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      aria-labelledby={`standard-item-title-${item._id}`}
      className="standard-item-dialog"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      ref={dialogRef}
    >
      <div className="standard-item-dialog-content">
        <header>
          <div>
            <p className="standard-item-dialog-kicker">
              {item.artwork.rarity} artwork · level {item.level}
            </p>
            <h2 id={`standard-item-title-${item._id}`}>
              {item.artwork.title}
            </h2>
            <p>{item.artwork.artist}</p>
          </div>
          <button
            aria-label="Close item details"
            className="reroll-dialog-close"
            onClick={closeDialog}
            type="button"
          >
            <i aria-hidden="true" className="fa fa-times" />
          </button>
        </header>
        <div className="standard-item-dialog-layout">
          <ArtworkThumbnail
            alt={`${item.artwork.title} by ${item.artwork.artist}`}
            artworkId={item.artwork_id}
            className="standard-item-dialog-artwork"
          />
          <CompleteItemRecord
            item={item}
            legendaryAttributes={legendaryAttributes}
          />
        </div>
        {canCustomize ? (
          <section className="item-style-selector">
            <header>
              <div>
                <span>Card cosmetic</span>
                <h3>Choose this item&apos;s visual style</h3>
              </div>
              <a href="/play/cosmetics">Cosmetic store</a>
            </header>
            <div className="item-style-options">
              {getSelectableCardCosmetics(
                activeRendererIds ?? [],
                ownedRendererIds,
              ).map((cosmetic) => {
                const unlocked = owned.has(cosmetic.id);
                return (
                  <label
                    className={unlocked ? "unlocked" : "locked"}
                    key={cosmetic.id}
                  >
                    <input
                      checked={selectedRendererId === cosmetic.id}
                      disabled={!unlocked || saving}
                      name={`card-renderer-${item._id}`}
                      onChange={() => setSelectedRendererId(cosmetic.id)}
                      type="radio"
                    />
                    <span>
                      <strong>
                        #{cosmetic.number.toString().padStart(2, "0")}{" "}
                        {cosmetic.name}
                      </strong>
                      <small>
                        {unlocked
                          ? cosmetic.description
                          : `$${cosmetic.price.toLocaleString()} · locked`}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
            <button
              className="item-style-apply"
              disabled={
                saving || selectedRendererId === currentRendererId
              }
              onClick={applyRenderer}
              type="button"
            >
              <i aria-hidden="true" className="fa fa-check" />
              {saving ? "Applying..." : "Apply style"}
            </button>
            {error ? (
              <p className="reroll-dialog-error" role="alert">
                {error}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </dialog>
  );
}
