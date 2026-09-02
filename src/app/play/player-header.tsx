"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PlayerHeader({
  screenName,
  bankBalance,
  impersonating,
  xp,
}: {
  screenName: string;
  bankBalance: number;
  impersonating: boolean;
  xp: number;
}) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function logout() {
    setError("");
    try {
      const response = await fetch(
        impersonating
          ? "/api/admin/test-accounts/exit"
          : "/api/auth/player/logout",
        {
          method: "POST",
        },
      );
      if (!response.ok) {
        throw new Error(
          impersonating
            ? "The administrator session is no longer available."
            : "The player session could not be closed.",
        );
      }
      router.push(impersonating ? "/admin" : "/play/login");
      router.refresh();
    } catch (logoutError) {
      setError(
        logoutError instanceof Error
          ? logoutError.message
          : "Could not sign out.",
      );
    }
  }

  return (
    <header className="legacy-navbar">
      <div className="legacy-nav-icons">
        <a aria-label="Dashboard" href="/play" title="dashboard">
          ■
        </a>
        <span className="nav-player">{screenName}</span>
        <span className="loot-icon" title="loot">
          ◆
        </span>
        <a
          aria-label="Auction house"
          className="auction-house-link"
          href="/play/auctions"
          title="auction house"
        >
          <i aria-hidden="true" className="fa fa-gavel" />
        </a>
        <a
          aria-label="Art style collection"
          className="cosmetic-store-link"
          href="/play/cosmetics"
          title="art style collection"
        >
          <i aria-hidden="true" className="fa fa-shopping-bag" />
        </a>
      </div>
      <div className="legacy-nav-stats">
        <strong className="green-text">
          ${bankBalance.toLocaleString()}
        </strong>
        <strong className="af-color">{xp.toLocaleString()}xp</strong>
      </div>
      {error ? (
        <span className="header-error" role="alert">
          {error}
        </span>
      ) : null}
      <button
        aria-label={impersonating ? "Return to admin" : "Sign out"}
        className="item-action-button player-signout"
        data-tooltip={impersonating ? "Return to admin" : "Sign out"}
        onClick={logout}
        type="button"
      >
        <i aria-hidden="true" className="fa fa-sign-out" />
      </button>
    </header>
  );
}
