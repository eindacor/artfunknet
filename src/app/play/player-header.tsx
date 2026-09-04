"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type PlayerHeaderProps =
  | { anonymous: true }
  | {
      anonymous?: false;
      auctionEscrow: number;
      bankBalance: number;
      impersonating: boolean;
    };

export default function PlayerHeader(props: PlayerHeaderProps) {
  const router = useRouter();
  const [error, setError] = useState("");

  if (props.anonymous) {
    return (
      <header className="legacy-navbar null-player-navbar">
        <HeaderCommunity />
        <Link className="player-signup" href="/play/login">
          Sign up
        </Link>
      </header>
    );
  }

  const { auctionEscrow, bankBalance, impersonating } = props;

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
      <HeaderCommunity />
      <div className="player-bank-indicator">
        <span aria-label={`Available bank balance $${bankBalance.toLocaleString()}`}>
          ${bankBalance.toLocaleString()}
        </span>
        {auctionEscrow > 0 ? (
          <span
            aria-label={`$${auctionEscrow.toLocaleString()} held in auction escrow`}
            className="player-auction-escrow"
            title="Active auction bids held in escrow"
          >
            (<i aria-hidden="true" className="fa fa-gavel" /> $
            {auctionEscrow.toLocaleString()})
          </span>
        ) : null}
        {error ? (
          <span className="player-header-error" role="alert">
            {error}
          </span>
        ) : null}
      </div>
      <div className="player-account-actions">
        {!impersonating ? (
          <Link
            aria-label="Account settings"
            className="item-action-button player-account-link"
            data-tooltip="Account settings"
            href="/play/account"
          >
            <i aria-hidden="true" className="fa fa-user-cog" />
          </Link>
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
      </div>
    </header>
  );
}

function HeaderCommunity() {
  return (
    <div className="header-community">
      <Link className="nav-title" href="/">
        artfunkel
      </Link>
      <nav aria-label="Artfunkel community" className="community-links">
        <a
          aria-label="Join the Artfunkel Discord server"
          href="https://discord.gg/3dQdyhXVb"
          rel="noreferrer"
          target="_blank"
          title="Discord"
        >
          <i aria-hidden="true" className="fa-brands fa-discord" />
        </a>
        <a
          aria-label="Visit the Artfunkel subreddit"
          href="https://www.reddit.com/r/artfunkel/"
          rel="noreferrer"
          target="_blank"
          title="Reddit"
        >
          <i aria-hidden="true" className="fa-brands fa-reddit" />
        </a>
        <a
          aria-label="Support Artfunkel on Patreon"
          href="https://www.patreon.com/c/artfunkel"
          rel="noreferrer"
          target="_blank"
          title="Patreon"
        >
          <i aria-hidden="true" className="fa-brands fa-patreon" />
        </a>
      </nav>
    </div>
  );
}
