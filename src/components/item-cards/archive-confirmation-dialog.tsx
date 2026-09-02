"use client";

import { useEffect, useRef } from "react";

import {
  getUnarchivedArchiveData,
} from "@/server/archive-gameplay";
import type { HydratedGameItem } from "@/server/item-artwork";

import {
  ArchivedArtStyleBadges,
  ArchivedCategoryBadges,
} from "./shared";

export default function ArchiveConfirmationDialog({
  item,
  purchaseAmount = 0,
  onCancel,
  onConfirm,
}: {
  item: HydratedGameItem;
  purchaseAmount?: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const additions = getUnarchivedArchiveData(
    item,
    item.archivedCategories,
    item.archivedArtStyles,
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      aria-describedby="archive-confirmation-description"
      aria-labelledby="archive-confirmation-title"
      className="mint-loss-dialog archive-confirmation-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      ref={dialogRef}
    >
      <div className="mint-loss-dialog-content">
        <p className="mint-loss-dialog-kicker">Collection archive</p>
        <i
          aria-hidden="true"
          className="fa fa-archive archive-confirmation-mark"
        />
        <h2 id="archive-confirmation-title">Archive this item?</h2>
        {additions.modifiers.length > 0 ? (
          <ArchivedCategoryBadges categories={additions.modifiers} />
        ) : null}
        {additions.artStyles.length > 0 ? (
          <ArchivedArtStyleBadges styles={additions.artStyles} />
        ) : null}
        <p id="archive-confirmation-description">
          Archiving is permanent. The item will be deleted, while the
          new labels shown above and its current value are added to this
          artwork&apos;s archive record.
          {purchaseAmount > 0
            ? ` This dealer offer will first be purchased for $${purchaseAmount.toLocaleString()}.`
            : ""}
        </p>
        <div className="mint-loss-dialog-actions">
          <button onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className="confirm"
            onClick={() => {
              onCancel();
              onConfirm();
            }}
            type="button"
          >
            Archive permanently
          </button>
        </div>
      </div>
    </dialog>
  );
}
