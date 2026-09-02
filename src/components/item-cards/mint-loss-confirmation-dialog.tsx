"use client";

import { useEffect, useRef } from "react";

export default function MintLossConfirmationDialog({
  actionLabel,
  onCancel,
  onConfirm,
}: {
  actionLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
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
      aria-describedby="mint-loss-description"
      aria-labelledby="mint-loss-title"
      className="mint-loss-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      ref={dialogRef}
    >
      <div className="mint-loss-dialog-content">
        <p className="mint-loss-dialog-kicker">Mint artwork notice</p>
        <i aria-hidden="true" className="fa fa-leaf mint-loss-dialog-leaf" />
        <h2 id="mint-loss-title">Break the mint seal?</h2>
        <p id="mint-loss-description">
          {actionLabel} will permanently remove this item&apos;s Mint status,
          set its condition to 100%, and affect its value.
        </p>
        <div className="mint-loss-dialog-actions">
          <button onClick={onCancel} type="button">
            Keep Mint
          </button>
          <button
            className="confirm"
            onClick={() => {
              onCancel();
              onConfirm();
            }}
            type="button"
          >
            Continue
          </button>
        </div>
      </div>
    </dialog>
  );
}
