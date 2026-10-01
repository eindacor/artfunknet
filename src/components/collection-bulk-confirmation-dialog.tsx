"use client";

import { useEffect, useRef } from "react";

export default function CollectionBulkConfirmationDialog({
  actionLabel,
  confirmLabel,
  description,
  destructive = false,
  itemCount,
  onCancel,
  onConfirm,
  totalValue,
}: {
  actionLabel: string;
  confirmLabel: string;
  description: string;
  destructive?: boolean;
  itemCount: number;
  onCancel: () => void;
  onConfirm: () => void;
  totalValue: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      aria-describedby="collection-bulk-confirmation-description"
      aria-labelledby="collection-bulk-confirmation-title"
      className={`mint-loss-dialog collection-bulk-confirmation-dialog${
        destructive ? " destructive" : ""
      }`}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      ref={dialogRef}
    >
      <div className="mint-loss-dialog-content">
        <button
          aria-label="Close"
          className="reroll-dialog-close collection-bulk-confirmation-close"
          onClick={onCancel}
          type="button"
        >
          <i aria-hidden="true" className="fa fa-times" />
        </button>
        <p className="mint-loss-dialog-kicker">Bulk collection action</p>
        <i
          aria-hidden="true"
          className={`fa ${
            destructive ? "fa-exclamation-triangle" : "fa-check-square-o"
          } collection-bulk-confirmation-mark`}
        />
        <h2 id="collection-bulk-confirmation-title">
          {actionLabel} {itemCount} items?
        </h2>
        <dl className="collection-bulk-confirmation-summary">
          <div>
            <dt>Selected</dt>
            <dd>{itemCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Total value</dt>
            <dd>${totalValue.toLocaleString()}</dd>
          </div>
        </dl>
        <p id="collection-bulk-confirmation-description">{description}</p>
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
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
