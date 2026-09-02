"use client";

import { useEffect, useRef } from "react";

export default function ArtStyleRemovalDialog({
  breaksMint,
  onCancel,
  onConfirm,
}: {
  breaksMint: boolean;
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
      aria-describedby="art-style-removal-description"
      aria-labelledby="art-style-removal-title"
      className="mint-loss-dialog art-style-removal-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      ref={dialogRef}
    >
      <div className="mint-loss-dialog-content">
        <p className="mint-loss-dialog-kicker">Applied style notice</p>
        <i
          aria-hidden="true"
          className="fa fa-paint-brush mint-loss-dialog-leaf"
        />
        <h2 id="art-style-removal-title">Remove this art style?</h2>
        <p id="art-style-removal-description">
          The applied style will be discarded and will not return to your
          inventory. The item will use the default Museum Label presentation.
          {breaksMint
            ? " This will also permanently remove the item's Mint status."
            : ""}
        </p>
        <div className="mint-loss-dialog-actions">
          <button onClick={onCancel} type="button">
            Keep style
          </button>
          <button
            className="confirm"
            onClick={() => {
              onCancel();
              onConfirm();
            }}
            type="button"
          >
            Remove style
          </button>
        </div>
      </div>
    </dialog>
  );
}
