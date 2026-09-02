"use client";

import { useEffect, useRef } from "react";

import { getArchiveCategories } from "@/server/archive-gameplay";
import type { HydratedGameItem } from "@/server/item-artwork";

import { ArchivedCategoryBadges } from "./shared";

export default function ArchiveConfirmationDialog({
  item,
  purchaseAmount = 0,
  replacement,
  onCancel,
  onConfirm,
}: {
  item: HydratedGameItem;
  purchaseAmount?: number;
  replacement?: HydratedGameItem;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const restoring = item.status === "archived" && item.displaced === true;

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
        <h2 id="archive-confirmation-title">
          {restoring ? "Restore this archive copy?" : "Archive this item?"}
        </h2>
        <ArchivedCategoryBadges categories={getArchiveCategories(item)} />
        <p id="archive-confirmation-description">
          {restoring
            ? "This copy will become the active archived variant."
            : "Archiving is permanent. This item can no longer be modified, sold, donated, displayed, repaired, or auctioned."}
          {replacement
            ? ` The current ${getArchiveCategories(replacement).join(" + ")} archive copy will be displaced.`
            : ""}
          {purchaseAmount > 0
            ? ` This dealer offer will be purchased for $${purchaseAmount.toLocaleString()} and moved directly into the archive.`
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
            {restoring ? "Restore copy" : "Archive permanently"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
