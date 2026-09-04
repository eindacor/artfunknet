"use client";

import { FormEvent, useState } from "react";

type PlayerAccountView = {
  id: string;
  email: string;
  screenName: string;
  active: boolean;
  hasPassword: boolean;
  hasOAuth: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export default function PlayerAccountRecovery() {
  const [account, setAccount] = useState<PlayerAccountView | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setAccount(null);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const response = await fetch(
      `/api/admin/player-accounts?email=${encodeURIComponent(email)}`,
    );
    const result = (await response.json()) as {
      account?: PlayerAccountView;
      error?: string;
    };
    if (!response.ok || !result.account) {
      setError(result.error ?? "The player account could not be found.");
    } else {
      setAccount(result.account);
    }
    setSearching(false);
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account) return;
    setSaving(true);
    setError("");
    setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirmPassword") ?? "")) {
      setError("The passwords do not match.");
      setSaving(false);
      return;
    }

    const response = await fetch("/api/admin/player-accounts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: account.email, password }),
    });
    const result = (await response.json()) as {
      error?: string;
      message?: string;
    };
    if (!response.ok) {
      setError(result.error ?? "The password could not be reset.");
    } else {
      setAccount((current) =>
        current ? { ...current, hasPassword: true } : current,
      );
      setMessage(result.message ?? "The password was reset.");
      formElement.reset();
    }
    setSaving(false);
  }

  return (
    <div className="grid gap-6">
      <form className="grid gap-3" onSubmit={search}>
        <label className="grid gap-2" htmlFor="player-account-email">
          <span>Player email address</span>
          <input
            id="player-account-email"
            name="email"
            type="email"
            autoComplete="off"
            required
          />
        </label>
        <button disabled={searching} type="submit">
          {searching ? "Searching..." : "Find account"}
        </button>
      </form>

      {account ? (
        <article className="rounded-md border border-white/15 p-5">
          <h2>{account.screenName}</h2>
          <dl className="mt-3 grid gap-2 text-sm">
            <div>
              <dt className="text-[var(--muted)]">Email</dt>
              <dd>{account.email}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Status</dt>
              <dd>{account.active ? "Active" : "Inactive"}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Sign-in methods</dt>
              <dd>
                {[
                  account.hasPassword ? "password" : null,
                  account.hasOAuth ? "external provider" : null,
                ]
                  .filter(Boolean)
                  .join(", ") || "none"}
              </dd>
            </div>
          </dl>

          <form className="mt-6 grid gap-3" onSubmit={resetPassword}>
            <label className="grid gap-2" htmlFor="recovery-password">
              <span>New password</span>
              <input
                id="recovery-password"
                minLength={12}
                name="password"
                type="password"
                autoComplete="new-password"
                required
              />
            </label>
            <label className="grid gap-2" htmlFor="recovery-password-confirm">
              <span>Confirm new password</span>
              <input
                id="recovery-password-confirm"
                minLength={12}
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
              />
            </label>
            <button disabled={saving} type="submit">
              {saving ? "Setting password..." : "Set new password"}
            </button>
          </form>
        </article>
      ) : null}

      {message ? <p className="admin-success">{message}</p> : null}
      {error ? <p className="admin-error">{error}</p> : null}
    </div>
  );
}
