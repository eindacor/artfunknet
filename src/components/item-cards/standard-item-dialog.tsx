"use client";

import { useEffect, useRef } from "react";

import ArtworkThumbnail from "@/components/artwork-thumbnail";

import ArtStyleActionButton from "./art-style-action-button";
import { getCardCosmetic } from "./catalog";
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

export default function StandardItemDialog({
  item,
  legendaryAttributes,
  currentRendererId,
  actions,
  permissions,
  onClose,
  onOpenArtStyle,
}: {
  item: HydratedGameItem;
  legendaryAttributes: CardLegendaryAttribute[];
  currentRendererId: CardRendererId;
  actions?: React.ReactNode;
  permissions: ItemDialogPermissions;
  onClose: () => void;
  onOpenArtStyle?: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const appliedCosmetic = getCardCosmetic(currentRendererId);

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

  return (
    <dialog
      aria-labelledby={`standard-item-title-${item._id}`}
      className="standard-item-dialog"
      data-mint={item.mint ? "true" : undefined}
      data-rarity={item.artwork.rarity}
      data-seasonal={item.seasonal ? "true" : undefined}
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      ref={dialogRef}
      tabIndex={-1}
    >
      <div className="standard-item-dialog-content">
        <header className="standard-item-dialog-header">
          <div className="standard-item-dialog-feature">
            <p className="standard-item-dialog-kicker">
              <span className="card-rarity-label">
                {item.artwork.rarity}
              </span>{" "}
              artwork · level {item.level}
            </p>
            <div className="standard-item-dialog-identity">
              <ArtworkThumbnail
                alt={`${item.artwork.title} by ${item.artwork.artist}`}
                artworkId={item.artwork_id}
                className="standard-item-dialog-artwork"
              />
              <div className="standard-item-dialog-heading">
                <h2 id={`standard-item-title-${item._id}`}>
                  {item.artwork.title}
                </h2>
                <p>{item.artwork.artist}</p>
                <p className="standard-item-dialog-workline">
                  {item.artwork.date} · {item.artwork.medium}
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
              <AttributeIcons item={item} />
            </section>
            <section className="standard-item-dialog-properties">
              <span>Properties</span>
              <ItemPropertyBadges item={item} showLifecycle />
            </section>
            {permissions.canManageItem &&
            (actions || permissions.canCustomizeCosmetic) ? (
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
                    target.getAttribute("aria-disabled") !== "true" &&
                    target.dataset.dialogPersistent !== "true"
                  ) {
                    closeDialog();
                  }
                }}
              >
                {actions}
                {permissions.canCustomizeCosmetic ? (
                  <ArtStyleActionButton
                    onClick={() => {
                      onOpenArtStyle?.();
                      closeDialog();
                    }}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
          <CompleteItemRecord
            item={item}
            legendaryAttributes={legendaryAttributes}
            showAttributeDetails={false}
            showProperties={false}
          />
        </div>
        <section className="item-style-summary">
          <span>Art style</span>
          <strong>
            {appliedCosmetic
              ? appliedCosmetic.id === "museum"
                ? "Museum Label (default)"
                : `#${appliedCosmetic.number.toString().padStart(2, "0")} ${appliedCosmetic.name}`
              : currentRendererId}
          </strong>
        </section>
      </div>
    </dialog>
  );
}
