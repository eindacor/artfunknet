"use client";

import { useEffect, useRef, useState } from "react";

import ArtworkThumbnail from "@/components/artwork-thumbnail";

import {
  type CardRendererPriceMap,
  getCardCosmetic,
  getOwnedCardRendererIds,
  getSelectableCardCosmetics,
} from "./catalog";
import MintLossConfirmationDialog from "./mint-loss-confirmation-dialog";
import {
  AttributeIcons,
  CompleteItemRecord,
  ItemPropertyBadges,
} from "./shared";
import type {
  CardLegendaryAttribute,
  CardRendererId,
  ItemDialogPermissions,
} from "./types";
import type { HydratedGameItem } from "@/server/item-artwork";
import type { GameItem } from "@/server/gameplay";

export default function StandardItemDialog({
  item,
  legendaryAttributes,
  currentRendererId,
  activeRendererIds,
  actions,
  ownedRendererIds,
  permissions,
  rendererPrices,
  onClose,
  onRendererSelected,
}: {
  item: HydratedGameItem;
  legendaryAttributes: CardLegendaryAttribute[];
  currentRendererId: CardRendererId;
  activeRendererIds?: string[];
  actions?: React.ReactNode;
  ownedRendererIds?: string[];
  permissions: ItemDialogPermissions;
  rendererPrices?: CardRendererPriceMap;
  onClose: () => void;
  onRendererSelected: (rendererId: CardRendererId, item: GameItem) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [selectedRendererId, setSelectedRendererId] =
    useState<CardRendererId>(currentRendererId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dialogItem, setDialogItem] = useState(item);
  const [pendingRendererId, setPendingRendererId] =
    useState<CardRendererId | null>(null);
  const owned = new Set(getOwnedCardRendererIds(ownedRendererIds));
  const appliedCosmetic = getCardCosmetic(currentRendererId);

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

  async function applyRenderer(rendererId: CardRendererId) {
    setSelectedRendererId(rendererId);
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/play/items/${dialogItem._id}/card-renderer`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rendererId }),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        item?: GameItem;
      };
      if (!response.ok || !body.item) {
        throw new Error(body.error ?? "The card style could not be applied.");
      }
      setDialogItem({
        ...dialogItem,
        ...body.item,
        artwork: dialogItem.artwork,
      });
      onRendererSelected(rendererId, body.item);
    } catch (saveError) {
      setSelectedRendererId(currentRendererId);
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
      aria-labelledby={`standard-item-title-${dialogItem._id}`}
      className="standard-item-dialog"
      data-mint={dialogItem.mint ? "true" : undefined}
      data-rarity={dialogItem.artwork.rarity}
      data-seasonal={dialogItem.seasonal ? "true" : undefined}
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      ref={dialogRef}
    >
      <div className="standard-item-dialog-content">
        <header className="standard-item-dialog-header">
          <div className="standard-item-dialog-feature">
            <p className="standard-item-dialog-kicker">
              <span className="card-rarity-label">
                {dialogItem.artwork.rarity}
              </span>{" "}
              artwork · level {dialogItem.level}
            </p>
            <div className="standard-item-dialog-identity">
              <ArtworkThumbnail
                alt={`${dialogItem.artwork.title} by ${dialogItem.artwork.artist}`}
                artworkId={dialogItem.artwork_id}
                className="standard-item-dialog-artwork"
              />
              <div className="standard-item-dialog-heading">
                <h2 id={`standard-item-title-${dialogItem._id}`}>
                  {dialogItem.artwork.title}
                </h2>
                <p>{dialogItem.artwork.artist}</p>
                <p className="standard-item-dialog-workline">
                  {dialogItem.artwork.date} · {dialogItem.artwork.medium}
                </p>
              </div>
            </div>
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
          <div className="standard-item-dialog-sidebar">
            <section className="standard-item-dialog-attributes">
              <span>Attributes</span>
              <AttributeIcons item={dialogItem} />
            </section>
            <section className="standard-item-dialog-properties">
              <span>Properties</span>
              <ItemPropertyBadges item={dialogItem} />
            </section>
            {permissions.canManageItem && actions ? (
              <div
                className="standard-item-dialog-actions card-actions"
                onClick={(event) => {
                  const target =
                    event.target instanceof Element
                      ? event.target.closest("button")
                      : null;
                  if (
                    target instanceof HTMLButtonElement &&
                    !target.disabled &&
                    target.getAttribute("aria-disabled") !== "true"
                  ) {
                    closeDialog();
                  }
                }}
              >
                {actions}
              </div>
            ) : null}
          </div>
          <CompleteItemRecord
            item={dialogItem}
            legendaryAttributes={legendaryAttributes}
            showAttributeDetails={false}
            showProperties={false}
          />
        </div>
        {permissions.canCustomizeCosmetic ? (
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
                rendererPrices,
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
                      name={`card-renderer-${dialogItem._id}`}
                      onChange={() => {
                        if (dialogItem.mint) {
                          setPendingRendererId(cosmetic.id);
                        } else {
                          void applyRenderer(cosmetic.id);
                        }
                      }}
                      type="radio"
                    />
                    <span>
                      <strong>
                        #{cosmetic.number.toString().padStart(2, "0")}{" "}
                        {cosmetic.name}
                      </strong>
                      <small>
                        {saving && selectedRendererId === cosmetic.id
                          ? "Applying..."
                          : unlocked
                          ? cosmetic.description
                          : `$${cosmetic.price.toLocaleString()} · locked`}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
            {error ? (
              <p className="reroll-dialog-error" role="alert">
                {error}
              </p>
            ) : null}
          </section>
        ) : (
          <section className="item-style-summary">
            <span>Card cosmetic</span>
            <strong>
              {appliedCosmetic
                ? `#${appliedCosmetic.number.toString().padStart(2, "0")} ${appliedCosmetic.name}`
                : currentRendererId}
            </strong>
          </section>
        )}
      </div>
      {pendingRendererId ? (
        <MintLossConfirmationDialog
          actionLabel="Changing this card cosmetic"
          onCancel={() => setPendingRendererId(null)}
          onConfirm={() => void applyRenderer(pendingRendererId)}
        />
      ) : null}
    </dialog>
  );
}
