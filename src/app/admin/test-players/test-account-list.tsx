"use client";

import { useState } from "react";

export type TestAccountView = {
  id: string;
  screenName: string;
  email: string;
  level: number;
  bankBalance: number;
  itemCount: number;
  lastActivity: string;
};

export default function TestAccountList({
  accounts,
}: {
  accounts: TestAccountView[];
}) {
  const [pendingId, setPendingId] = useState("");
  const [error, setError] = useState("");

  async function impersonate(account: TestAccountView) {
    setPendingId(account.id);
    setError("");
    try {
      const response = await fetch(
        "/api/admin/test-accounts/impersonate",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ playerId: account.id }),
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "The test account could not be opened.");
      }
      window.location.assign("/play");
    } catch (impersonationError) {
      setError(
        impersonationError instanceof Error
          ? impersonationError.message
          : "The test account could not be opened.",
      );
      setPendingId("");
    }
  }

  if (accounts.length === 0) {
    return (
      <p>
        No test accounts are available. Run <code>npm run db:seed</code> to
        create them.
      </p>
    );
  }

  return (
    <>
      <div className="test-account-list">
        {accounts.map((account) => (
          <button
            className="test-account-card"
            disabled={pendingId.length > 0}
            key={account.id}
            onClick={() => impersonate(account)}
            type="button"
          >
            <strong>{account.screenName}</strong>
            <span>{account.email}</span>
            <dl>
              <div>
                <dt>level</dt>
                <dd>{account.level}</dd>
              </div>
              <div>
                <dt>balance</dt>
                <dd>${account.bankBalance.toLocaleString()}</dd>
              </div>
              <div>
                <dt>items</dt>
                <dd>{account.itemCount}</dd>
              </div>
            </dl>
            <small>
              last active {new Date(account.lastActivity).toLocaleString()}
            </small>
            <span className="test-account-open">
              {pendingId === account.id ? "opening..." : "play as account"}
            </span>
          </button>
        ))}
      </div>
      <p aria-live="polite" className="admin-config-status">
        {error}
      </p>
    </>
  );
}
