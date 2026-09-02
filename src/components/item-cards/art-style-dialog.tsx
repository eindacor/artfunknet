"use client";

import { useEffect, useRef, useState } from "react";

import ArtworkThumbnail from "@/components/artwork-thumbnail";
import type { GameItem } from "@/server/gameplay";
import type { HydratedGameItem } from "@/server/item-artwork";

import {
  type CardCosmetic,
  type CardStyleInventory,
  getAvailableCardStyleConsumables,
  getCardCosmetic,
  getCardStyleInventory,
} from "./catalog";
import ArtStyleRemovalDialog from "./art-style-removal-dialog";
import MintLossConfirmationDialog from "./mint-loss-confirmation-dialog";
import { CARD_RENDERERS } from "./registry";
import type { CardLegendaryAttribute, CardRendererId } from "./types";

export default function ArtStyleDialog({
  currentRendererId,
  item,
  legendaryAttributes,
  onApplied,
  onClose,
  researchTarget = false,
  styleInventory,
}: {
  currentRendererId: CardRendererId;
  item: HydratedGameItem;
  legendaryAttributes: CardLegendaryAttribute[];
  onApplied: (
    rendererId: CardRendererId | undefined,
    item: GameItem,
    styleInventory: CardStyleInventory,
  ) => void;
  onClose: () => void;
  researchTarget?: boolean;
  styleInventory?: CardStyleInventory;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [selectedRendererId, setSelectedRendererId] =
    useState(currentRendererId);
  const [previewRendererId, setPreviewRendererId] =
    useState<CardRendererId>(() =>
      getInitialPreviewRendererId(currentRendererId, styleInventory),
    );
  const [dialogItem, setDialogItem] = useState(item);
  const [availableStyles, setAvailableStyles] = useState(
    getCardStyleInventory(styleInventory),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pendingRendererId, setPendingRendererId] =
    useState<CardRendererId | null>(null);
  const [removalPending, setRemovalPending] = useState(false);
  const appliedCosmetic = getCardCosmetic(selectedRendererId);
  const availableChoices = getAvailableCardStyleConsumables(availableStyles);
  const selectedCosmetic =
    selectedRendererId === "museum"
      ? undefined
      : getCardCosmetic(selectedRendererId);
  const choices: Array<CardCosmetic & { quantity: number }> =
    selectedCosmetic?.id !== "museum" &&
    selectedCosmetic &&
    !availableChoices.some((cosmetic) => cosmetic.id === selectedRendererId)
      ? [...availableChoices, { ...selectedCosmetic, quantity: 0 }]
      : availableChoices;
  const previewCosmetic =
    getCardCosmetic(previewRendererId) ?? getCardCosmetic("museum")!;
  const PreviewRenderer = CARD_RENDERERS[previewCosmetic.id];

  useEffect(() => {
    const dialog = dialogRef.current;
    const scrollPosition = { x: window.scrollX, y: window.scrollY };
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (dialog && !dialog.open) {
      dialog.showModal();
      dialog.focus({ preventScroll: true });
      window.scrollTo(scrollPosition.x, scrollPosition.y);
    }
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  function closeDialog() {
    if (dialogRef.current?.open) dialogRef.current.close();
    returnFocusRef.current?.focus();
    onClose();
  }

  async function applyRenderer(rendererId?: CardRendererId) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/play/items/${dialogItem._id}/card-renderer`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            rendererId ? { rendererId } : { removeStyle: true },
          ),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        item?: GameItem;
        rendererId?: CardRendererId;
        styleInventory?: CardStyleInventory;
      };
      if (!response.ok || !body.item) {
        throw new Error(body.error ?? "The art style could not be applied.");
      }

      const nextInventory = getCardStyleInventory(body.styleInventory);
      const nextRendererId = body.rendererId ?? "museum";
      setSelectedRendererId(nextRendererId);
      setPreviewRendererId(nextRendererId);
      setDialogItem({
        ...dialogItem,
        ...body.item,
        artwork: dialogItem.artwork,
      });
      setAvailableStyles(nextInventory);
      onApplied(body.rendererId, body.item, nextInventory);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The art style could not be applied.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <dialog
        aria-describedby={`art-style-description-${dialogItem._id}`}
        aria-labelledby={`art-style-title-${dialogItem._id}`}
        className="reroll-dialog art-style-dialog"
        data-rarity={dialogItem.artwork.rarity}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const inside =
            event.clientX >= bounds.left &&
            event.clientX <= bounds.right &&
            event.clientY >= bounds.top &&
            event.clientY <= bounds.bottom;
          if (!inside) closeDialog();
        }}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="reroll-dialog-content">
          <header className="reroll-dialog-header">
            <div className="reroll-artwork-summary">
              <ArtworkThumbnail
                alt={`${dialogItem.artwork.title} by ${dialogItem.artwork.artist}`}
                artworkId={dialogItem.artwork_id}
                className="reroll-artwork-thumbnail"
              />
              <div>
                <p className="reroll-dialog-kicker">
                  apply art style · level {dialogItem.level}
                </p>
                <h2 id={`art-style-title-${dialogItem._id}`}>
                  {dialogItem.artwork.title}
                </h2>
                <p className="reroll-artwork-artist">
                  {dialogItem.artwork.artist}
                </p>
              </div>
            </div>
            <button
              aria-label="Close art style dialog"
              className="reroll-dialog-close"
              onClick={closeDialog}
              type="button"
            >
              <i aria-hidden="true" className="fa fa-times" />
            </button>
          </header>

          <p
            className="reroll-dialog-description"
            id={`art-style-description-${dialogItem._id}`}
          >
            Choose a presentation for this artwork. Premium styles are
            consumable and replacing a style does not return the previous one.
          </p>

          <dl className="art-style-dialog-summary">
            <div>
              <dt>applied style</dt>
              <dd>
                {appliedCosmetic
                  ? appliedCosmetic.id === "museum"
                    ? "Museum Label (default)"
                    : `#${appliedCosmetic.number.toString().padStart(2, "0")} ${appliedCosmetic.name}`
                  : "Museum Label (default)"}
              </dd>
            </div>
            <div>
              <dt>available styles</dt>
              <dd>{choices.length}</dd>
            </div>
            <div>
              <dt>condition</dt>
              <dd>{Math.floor(dialogItem.condition * 100)}%</dd>
            </div>
          </dl>

          <div className="art-style-dialog-heading">
            <h3>Available art styles</h3>
            <a href="/play/cosmetics">Art style collection</a>
          </div>
          <div className="art-style-dialog-picker">
            <fieldset className="art-style-dialog-options">
              <legend>Style inventory</legend>
              {choices.length > 0 ? (
                choices.map((cosmetic) => {
                  const applied = cosmetic.id === selectedRendererId;
                  return (
                    <label key={cosmetic.id}>
                      <input
                        checked={cosmetic.id === previewRendererId}
                        disabled={saving}
                        name={`art-style-${dialogItem._id}`}
                        onChange={() => setPreviewRendererId(cosmetic.id)}
                        type="radio"
                        value={cosmetic.id}
                      />
                      <span>
                        <strong>
                          #{cosmetic.number.toString().padStart(2, "0")}{" "}
                          {cosmetic.name}
                        </strong>
                        <small>
                          {applied
                            ? "Applied"
                            : `${cosmetic.quantity} available`}
                        </small>
                      </span>
                    </label>
                  );
                })
              ) : (
                <p className="art-style-dialog-empty">
                  No art style consumables are available.
                </p>
              )}
            </fieldset>
            <section className="art-style-dialog-preview">
              <header>
                <span>Preview</span>
                <strong>
                  #{previewCosmetic.number.toString().padStart(2, "0")}{" "}
                  {previewCosmetic.name}
                </strong>
              </header>
              <div className="art-style-consumable-preview">
                <span
                  className={`rendered-item-card rendered-item-card-${previewCosmetic.id}`}
                  data-card-renderer={previewCosmetic.id}
                  data-foil={dialogItem.foil ? "true" : undefined}
                  data-lottery={dialogItem.lottery || undefined}
                  data-mint={dialogItem.mint ? "true" : undefined}
                  data-original={dialogItem.original ? "true" : undefined}
                  data-rarity={dialogItem.artwork.rarity}
                  data-seasonal={dialogItem.seasonal ? "true" : undefined}
                  data-vintage={dialogItem.vintage ? "true" : undefined}
                >
                  <span className="rendered-item-card-trigger">
                    <PreviewRenderer
                      alreadyOwned={false}
                      item={{
                        ...dialogItem,
                        card_renderer: previewCosmetic.id,
                      }}
                      legendaryAttributes={legendaryAttributes}
                      researchTarget={researchTarget}
                    />
                  </span>
                </span>
              </div>
            </section>
          </div>
          {error ? (
            <p className="reroll-dialog-error" role="alert">
              {error}
            </p>
          ) : null}
          <footer className="art-style-dialog-actions">
            {selectedRendererId !== "museum" ? (
              <button
                className="art-style-dialog-remove"
                disabled={saving}
                onClick={() => setRemovalPending(true)}
                type="button"
              >
                Remove style
              </button>
            ) : null}
            <button
              className="art-style-dialog-apply"
              disabled={
                saving ||
                previewRendererId === "museum" ||
                previewRendererId === selectedRendererId
              }
              onClick={() => {
                if (dialogItem.mint) {
                  setPendingRendererId(previewRendererId);
                } else {
                  void applyRenderer(previewRendererId);
                }
              }}
              type="button"
            >
              {saving ? "Applying style..." : "Apply style"}
            </button>
          </footer>
        </div>
      </dialog>
      {pendingRendererId ? (
        <MintLossConfirmationDialog
          actionLabel={`Applying the ${getCardCosmetic(pendingRendererId)?.name ?? "selected"} art style`}
          onCancel={() => setPendingRendererId(null)}
          onConfirm={() => {
            const rendererId = pendingRendererId;
            setPendingRendererId(null);
            void applyRenderer(rendererId);
          }}
        />
      ) : null}
      {removalPending ? (
        <ArtStyleRemovalDialog
          breaksMint={Boolean(dialogItem.mint)}
          onCancel={() => setRemovalPending(false)}
          onConfirm={() => void applyRenderer()}
        />
      ) : null}
    </>
  );
}

function getInitialPreviewRendererId(
  currentRendererId: CardRendererId,
  styleInventory?: CardStyleInventory,
): CardRendererId {
  if (currentRendererId !== "museum") return currentRendererId;
  return (
    getAvailableCardStyleConsumables(styleInventory)[0]?.id ?? "museum"
  );
}
