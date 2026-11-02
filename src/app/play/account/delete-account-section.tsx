"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";

const CONFIRMATION = "DELETE MY ACCOUNT";

export default function DeleteAccountSection() {
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="rounded-lg border border-red-400/40 bg-white/5 p-6">
      <h2 className="text-xl font-bold">Delete account</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Permanently delete your account, items, collections, and associated game data.
      </p>
      <p className="mt-3 text-sm">
        <Link className="text-[var(--accent)] underline" href="/privacy">Privacy policy</Link>
        {" | "}
        <Link className="text-[var(--accent)] underline" href="/data-deletion">Deletion instructions</Link>
      </p>
      <button
        className="mt-5 rounded-md border border-red-400 px-4 py-2 font-semibold text-red-300"
        onClick={() => setConfirming(true)}
        type="button"
      >
        Delete account
      </button>
      {confirming ? <DeleteAccountDialog onCancel={() => setConfirming(false)} /> : null}
    </section>
  );
}

function DeleteAccountDialog({ onCancel }: { onCancel: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || confirmation !== CONFIRMATION) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/player/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Deletion did not finish. Please retry.");
      window.location.replace("/data-deletion?deleted=1");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Deletion did not finish. Please retry.");
      setBusy(false);
    }
  }

  return (
    <dialog
      aria-describedby="delete-account-description"
      aria-labelledby="delete-account-title"
      className="mint-loss-dialog delete-account-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      ref={dialogRef}
    >
      <form className="mint-loss-dialog-content" onSubmit={submit}>
        <h2 id="delete-account-title">Permanently delete your account?</h2>
        <div className="space-y-3 text-left" id="delete-account-description">
          <p>
            This cannot be undone. Your profile, email addresses, linked accounts,
            credentials, every owned item, featured and permanent collections,
            galleries, quests, archives, chat messages, and other associated
            live game data will be removed. Shared history will be redacted.
          </p>
          <p>
            Deletion is blocked while you are selling or winning auctions or an
            auction is settling. Game actions briefly pause during deletion.
            You will be signed out when it finishes.
          </p>
          <p>
            Backups remain until manually deleted by the operator. Hosting logs
            and independently held copies are outside in-game deletion.
            Provider accounts and Patreon billing are not deleted or canceled.
          </p>
        </div>
        <label className="grid gap-2 text-left">
          <span>Type <strong>{CONFIRMATION}</strong> to confirm.</span>
          <input
            autoComplete="off"
            className="w-full rounded-md border border-black/30 bg-white/80 px-3 py-2"
            disabled={busy}
            onChange={(event) => setConfirmation(event.target.value)}
            required
            spellCheck={false}
            value={confirmation}
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <div className="mint-loss-dialog-actions">
          <button className="disabled:opacity-50" disabled={busy} onClick={onCancel} type="button">Cancel</button>
          <button
            className="confirm disabled:opacity-50"
            disabled={busy || confirmation !== CONFIRMATION}
            type="submit"
          >
            {busy ? "Deleting..." : "Delete account permanently"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
