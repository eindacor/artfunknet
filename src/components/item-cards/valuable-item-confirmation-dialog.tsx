"use client";

import { useEffect, useRef } from "react";

import type { HydratedGameItem } from "@/server/item-artwork";

export default function ValuableItemConfirmationDialog({
  action,
  item,
  onCancel,
  onConfirm,
}: {
  action: "sell" | "donate" | "purchase-donate";
  item: HydratedGameItem;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const actionLabel =
    action === "sell"
      ? "Sell"
      : action === "purchase-donate"
        ? "Purchase and donate"
        : "Donate";
  const actionDescription =
    action === "purchase-donate"
      ? "Purchasing and donating it will immediately and permanently remove it in exchange for Karma."
      : `${
          action === "sell" ? "Selling" : "Donating"
        } it will permanently remove it from your collection.`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      aria-describedby="valuable-item-confirmation-description"
      aria-labelledby="valuable-item-confirmation-title"
      className="mint-loss-dialog valuable-item-confirmation-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      ref={dialogRef}
    >
      <div className="mint-loss-dialog-content">
        <p className="mint-loss-dialog-kicker">High-rarity artwork</p>
        <i
          aria-hidden="true"
          className="fa fa-exclamation-triangle valuable-item-warning-mark"
        />
        <h2 id="valuable-item-confirmation-title">Are you sure?</h2>
        <p id="valuable-item-confirmation-description">
          {item.artwork.title} is a{" "}
          <span className="card-rarity-label">{item.artwork.rarity}</span>{" "}
          item.{" "}
          {actionDescription}
        </p>
        <div className="mint-loss-dialog-actions">
          <button onClick={onCancel} type="button">
            Keep item
          </button>
          <button
            className="confirm"
            onClick={() => {
              onCancel();
              onConfirm();
            }}
            type="button"
          >
            {actionLabel} anyway
          </button>
        </div>
      </div>
    </dialog>
  );
}
