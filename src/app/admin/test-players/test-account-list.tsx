"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type TestAccountView = {
  id: string;
  screenName: string;
  email: string;
  level: number;
  bankBalance: number;
  lotteryTickets: number;
  itemCount: number;
  lastActivity: string;
};

export default function TestAccountList({
  accounts,
}: {
  accounts: TestAccountView[];
}) {
  const router = useRouter();
  const [currentAccounts, setCurrentAccounts] = useState(accounts);
  const [pendingId, setPendingId] = useState("");
  const [levelInputs, setLevelInputs] = useState(
    Object.fromEntries(accounts.map((account) => [account.id, account.level])),
  );
  const [balanceInputs, setBalanceInputs] = useState(
    Object.fromEntries(
      accounts.map((account) => [account.id, account.bankBalance]),
    ),
  );
  const [ticketInputs, setTicketInputs] = useState(
    Object.fromEntries(
      accounts.map((account) => [account.id, account.lotteryTickets]),
    ),
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function impersonate(account: TestAccountView) {
    setPendingId(account.id);
    setMessage("");
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
      router.push("/play");
      router.refresh();
    } catch (impersonationError) {
      setError(
        impersonationError instanceof Error
          ? impersonationError.message
          : "The test account could not be opened.",
      );
      setPendingId("");
    }
  }

  async function setLevel(account: TestAccountView) {
    const level = levelInputs[account.id];
    setPendingId(account.id);
    setMessage("");
    setError("");
    try {
      const response = await fetch(
        `/api/admin/test-accounts/${account.id}/level`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ level }),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        level?: number;
        message?: string;
      };
      if (!response.ok || body.level === undefined) {
        throw new Error(
          body.error ?? "The test player level could not be set.",
        );
      }
      const updatedLevel = body.level;
      setCurrentAccounts((current) =>
        current.map((candidate) =>
          candidate.id === account.id
            ? { ...candidate, level: updatedLevel }
            : candidate,
        ),
      );
      setMessage(body.message ?? `Level set to ${updatedLevel}.`);
    } catch (levelError) {
      setError(
        levelError instanceof Error
          ? levelError.message
          : "The test player level could not be set.",
      );
    } finally {
      setPendingId("");
    }
  }

  async function setBalance(account: TestAccountView) {
    const balance = balanceInputs[account.id];
    setPendingId(account.id);
    setMessage("");
    setError("");
    try {
      const response = await fetch(
        `/api/admin/test-accounts/${account.id}/balance`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ balance }),
        },
      );
      const body = (await response.json()) as {
        bankBalance?: number;
        error?: string;
        message?: string;
      };
      if (!response.ok || body.bankBalance === undefined) {
        throw new Error(
          body.error ?? "The test player balance could not be set.",
        );
      }

      const bankBalance = body.bankBalance;
      setCurrentAccounts((current) =>
        current.map((candidate) =>
          candidate.id === account.id
            ? { ...candidate, bankBalance }
            : candidate,
        ),
      );
      setMessage(
        body.message ?? `Balance set to $${bankBalance.toLocaleString()}.`,
      );
    } catch (balanceError) {
      setError(
        balanceError instanceof Error
          ? balanceError.message
          : "The test player balance could not be set.",
      );
    } finally {
      setPendingId("");
    }
  }

  async function setLotteryTickets(account: TestAccountView) {
    const tickets = ticketInputs[account.id];
    setPendingId(account.id);
    setMessage("");
    setError("");
    try {
      const response = await fetch(
        `/api/admin/test-accounts/${account.id}/lottery-tickets`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tickets }),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        lotteryTickets?: number;
        message?: string;
      };
      if (!response.ok || body.lotteryTickets === undefined) {
        throw new Error(
          body.error ?? "The test player's lottery tickets could not be set.",
        );
      }
      const lotteryTickets = body.lotteryTickets;
      setCurrentAccounts((current) =>
        current.map((candidate) =>
          candidate.id === account.id
            ? { ...candidate, lotteryTickets }
            : candidate,
        ),
      );
      setMessage(
        body.message ?? `Lottery tickets set to ${lotteryTickets}.`,
      );
    } catch (ticketError) {
      setError(
        ticketError instanceof Error
          ? ticketError.message
          : "The test player's lottery tickets could not be set.",
      );
    } finally {
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
        {currentAccounts.map((account) => (
          <article className="test-account-card" key={account.id}>
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
              <div>
                <dt>lottery tickets</dt>
                <dd>{account.lotteryTickets.toLocaleString()}</dd>
              </div>
            </dl>
            <small>
              last active {new Date(account.lastActivity).toLocaleString()}
            </small>
            <div className="test-account-level-control">
              <label htmlFor={`test-level-${account.id}`}>Set level</label>
              <input
                disabled={pendingId.length > 0}
                id={`test-level-${account.id}`}
                max={50}
                min={0}
                onChange={(event) =>
                  setLevelInputs((current) => ({
                    ...current,
                    [account.id]: Number(event.target.value),
                  }))
                }
                type="number"
                value={levelInputs[account.id]}
              />
              <button
                disabled={pendingId.length > 0}
                onClick={() => setLevel(account)}
                type="button"
              >
                Set
              </button>
            </div>
            <div className="test-account-balance-control">
              <label htmlFor={`test-balance-${account.id}`}>Set balance</label>
              <input
                disabled={pendingId.length > 0}
                id={`test-balance-${account.id}`}
                min={0}
                onChange={(event) =>
                  setBalanceInputs((current) => ({
                    ...current,
                    [account.id]: Number(event.target.value),
                  }))
                }
                step={1}
                type="number"
                value={balanceInputs[account.id]}
              />
              <button
                disabled={pendingId.length > 0}
                onClick={() => setBalance(account)}
                type="button"
              >
                Set
              </button>
            </div>
            <div className="test-account-ticket-control">
              <label htmlFor={`test-tickets-${account.id}`}>
                Set lottery tickets
              </label>
              <input
                disabled={pendingId.length > 0}
                id={`test-tickets-${account.id}`}
                min={0}
                onChange={(event) =>
                  setTicketInputs((current) => ({
                    ...current,
                    [account.id]: Number(event.target.value),
                  }))
                }
                step={1}
                type="number"
                value={ticketInputs[account.id]}
              />
              <button
                disabled={pendingId.length > 0}
                onClick={() => setLotteryTickets(account)}
                type="button"
              >
                Set
              </button>
            </div>
            <button
              className="test-account-open"
              disabled={pendingId.length > 0}
              onClick={() => impersonate(account)}
              type="button"
            >
              {pendingId === account.id ? "opening..." : "play as account"}
            </button>
          </article>
        ))}
      </div>
      {message ? <p className="admin-success">{message}</p> : null}
      {error ? <p className="admin-error">{error}</p> : null}
    </>
  );
}
