"use client";

import { FormEvent, useState } from "react";

const SUPPORTER_STATUSES = [
  "common",
  "uncommon",
  "rare",
  "legendary",
  "masterpiece",
] as const;

type SupporterStatus = (typeof SUPPORTER_STATUSES)[number];

const SUPPORTER_STATUS_COLORS: Record<SupporterStatus, string> = {
  common: "#39b54a",
  uncommon: "#3e7bff",
  rare: "#e1c429",
  legendary: "#ff8a1f",
  masterpiece: "#42e8f5",
};

type PlayerAccountView = {
  id: string;
  email: string;
  screenName: string;
  active: boolean;
  hasPassword: boolean;
  hasOAuth: boolean;
  supporterStatus: SupporterStatus | null;
  supporterOverride: SupporterStatus | null;
  createdAt: string | null;
  updatedAt: string | null;
  metadata: unknown;
};

export default function PlayerAccountAdmin() {
  const [account, setAccount] = useState<PlayerAccountView | null>(null);
  const [searching, setSearching] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingSupporter, setSavingSupporter] = useState(false);
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
    setSavingPassword(true);
    setError("");
    setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirmPassword") ?? "")) {
      setError("The passwords do not match.");
      setSavingPassword(false);
      return;
    }

    const response = await fetch("/api/admin/player-accounts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "reset-password",
        email: account.email,
        password,
      }),
    });
    const result = (await response.json()) as {
      account?: PlayerAccountView;
      error?: string;
      message?: string;
    };
    if (!response.ok) {
      setError(result.error ?? "The password could not be reset.");
    } else {
      if (result.account) setAccount(result.account);
      setMessage(result.message ?? "The password was reset.");
      formElement.reset();
    }
    setSavingPassword(false);
  }

  async function setSupporterOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account) return;
    setSavingSupporter(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const selectedStatus = String(form.get("supporterStatus") ?? "");
    const response = await fetch("/api/admin/player-accounts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "set-supporter-override",
        email: account.email,
        supporterStatus: selectedStatus || null,
      }),
    });
    const result = (await response.json()) as {
      account?: PlayerAccountView;
      error?: string;
      message?: string;
    };
    if (!response.ok || !result.account) {
      setError(result.error ?? "The supporter override could not be saved.");
    } else {
      setAccount(result.account);
      setMessage(result.message ?? "The supporter override was saved.");
    }
    setSavingSupporter(false);
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
              <dt className="text-[var(--muted)]">Player ID</dt>
              <dd>{account.id}</dd>
            </div>
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
            <div>
              <dt className="text-[var(--muted)]">Supporter status</dt>
              <dd>
                {account.supporterStatus ? (
                  <strong
                    style={{
                      color:
                        SUPPORTER_STATUS_COLORS[account.supporterStatus],
                    }}
                  >
                    {account.supporterStatus}
                  </strong>
                ) : (
                  "Not a supporter"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Created</dt>
              <dd>{account.createdAt ?? "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Last updated</dt>
              <dd>{account.updatedAt ?? "Unknown"}</dd>
            </div>
          </dl>

          <form
            className="mt-6 grid gap-3"
            key={`${account.id}-${account.supporterOverride ?? "automatic"}`}
            onSubmit={setSupporterOverride}
          >
            <label
              className="grid gap-2"
              htmlFor="supporter-status-override"
            >
              <span>Admin supporter override</span>
              <select
                defaultValue={account.supporterOverride ?? ""}
                id="supporter-status-override"
                name="supporterStatus"
              >
                <option value="">No override (automatic)</option>
                {SUPPORTER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm text-[var(--muted)]">
              The effective status is the highest level found across this
              override, Patreon, and future supporter sources.
            </p>
            <button disabled={savingSupporter} type="submit">
              {savingSupporter ? "Saving..." : "Save supporter override"}
            </button>
          </form>

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
            <button disabled={savingPassword} type="submit">
              {savingPassword ? "Setting password..." : "Set new password"}
            </button>
          </form>

          <details className="mt-6" open>
            <summary>All player metadata</summary>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Credentials and access tokens are redacted.
            </p>
            <pre className="mt-3 max-h-[36rem] overflow-auto rounded-md border border-white/15 bg-black/30 p-4 text-xs">
              {JSON.stringify(account.metadata, null, 2)}
            </pre>
          </details>
        </article>
      ) : null}

      {message ? <p className="admin-success">{message}</p> : null}
      {error ? <p className="admin-error">{error}</p> : null}
    </div>
  );
}
