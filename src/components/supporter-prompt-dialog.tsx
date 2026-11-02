"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./supporter-prompt-dialog.module.css";

export default function SupporterPromptDialog({
  bonusCommemorationItems,
  onAcknowledge,
}: {
  bonusCommemorationItems: number;
  onAcknowledge: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    function syncDialog() {
      if (!dialog) return;
      const anotherDialogOpen = Array.from(
        document.querySelectorAll("dialog[open]"),
      ).some((other) => other !== dialog);
      if (anotherDialogOpen) {
        if (dialog.open) dialog.close();
      } else if (!dialog.open) {
        dialog.showModal();
      }
    }
    const observer = new MutationObserver(syncDialog);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["open"],
      childList: true,
      subtree: true,
    });
    const timer = window.setTimeout(syncDialog, 0);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
      if (dialog.open) dialog.close();
    };
  }, []);

  async function acknowledge() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await onAcknowledge();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your acknowledgment could not be saved.",
      );
      setSaving(false);
    }
  }

  return (
    <dialog
      aria-describedby="supporter-prompt-description"
      aria-labelledby="supporter-prompt-title"
      className={`reroll-dialog ${styles.dialog}`}
      onCancel={(event) => {
        event.preventDefault();
        void acknowledge();
      }}
      ref={dialogRef}
    >
      <div className="reroll-dialog-content">
        <header className="reroll-dialog-header">
          <div>
            <p className="reroll-dialog-kicker">Membership bonuses</p>
            <h2 id="supporter-prompt-title">
              Support <span className={styles.brandName}>artfunkel</span>
            </h2>
          </div>
          <button
            aria-label="Close Patreon offerings"
            className="reroll-dialog-close"
            disabled={saving}
            onClick={() => void acknowledge()}
            type="button"
          >
            <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
              <path d="m3 3 10 10M13 3 3 13" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
            </svg>
          </button>
        </header>
        <p className="reroll-dialog-description" id="supporter-prompt-description">
          Become a Patreon member to help the game grow and unlock these bonuses.
        </p>
        <dl className={styles.perks}>
          <div>
            <dt className="rarity-text common">Common</dt>
            <dd>Discord &quot;Benefactor&quot; status.</dd>
          </div>
          <div>
            <dt className="rarity-text uncommon">Uncommon</dt>
            <dd>All previous perks, plus access to exclusive art styles.</dd>
          </div>
          <div>
            <dt className="rarity-text rare">Rare</dt>
            <dd>
              All previous perks, plus {bonusCommemorationItems.toLocaleString()}{" "}
              bonus commemoration items when you start a new era.
            </dd>
          </div>
        </dl>
        {error ? <p className="reroll-dialog-error" role="alert">{error}</p> : null}
        <div className={styles.actions}>
          <a
            className={styles.membership}
            href="https://www.patreon.com/c/artfunkel/membership"
            rel="noopener noreferrer"
            target="_blank"
          >
            View Patreon memberships
          </a>
          <button disabled={saving} onClick={() => void acknowledge()} type="button">
            {saving ? "Saving..." : "OK"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
