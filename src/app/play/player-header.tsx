"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { PlayerNotification } from "@/server/player-notifications";

import NotificationCenter from "./notification-center";
import ProgressBar from "@/components/progress-bar/progress-bar";

type PlayerHeaderProps =
  | { anonymous: true }
  | AuthenticatedPlayerHeaderProps;

type AuthenticatedPlayerHeaderProps = {
  anonymous?: false;
  auctionEscrow: number;
  xp: number;
  xpGoal: number;
  level: number;
  isMaxLevel: boolean;
  bankBalance: number;
  initialNotifications?: PlayerNotification[];
  impersonating: boolean;
};

export default function PlayerHeader(props: PlayerHeaderProps) {
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

  return <AuthenticatedPlayerHeader {...props} />;
}

function AuthenticatedPlayerHeader(props: AuthenticatedPlayerHeaderProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [accountSummary, setAccountSummary] = useState<{
    auctionEscrow: number;
    bankBalance: number;
  } | null>(null);
  const refreshInFlight = useRef(false);
  const {
    auctionEscrow,
    bankBalance,
    initialNotifications,
    impersonating,
  } = props;
  const displayedAuctionEscrow =
    accountSummary?.auctionEscrow ?? auctionEscrow;
  const displayedBankBalance = accountSummary?.bankBalance ?? bankBalance;

  const refreshAccountSummary = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const response = await fetch("/api/play/account-summary", {
        cache: "no-store",
      });
      const body = (await response.json()) as {
        auctionEscrow?: number;
        bankBalance?: number;
      };
      if (
        response.ok &&
        typeof body.auctionEscrow === "number" &&
        typeof body.bankBalance === "number"
      ) {
        setAccountSummary({
          auctionEscrow: body.auctionEscrow,
          bankBalance: body.bankBalance,
        });
      }
    } catch (refreshError) {
      console.error("Unable to refresh account summary", refreshError);
    } finally {
      refreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(
      () => void refreshAccountSummary(),
      0,
    );
    const timer = window.setInterval(
      () => void refreshAccountSummary(),
      5_000,
    );
    function refreshWhenActive() {
      if (document.visibilityState === "visible") {
        void refreshAccountSummary();
      }
    }
    window.addEventListener("focus", refreshWhenActive);
    document.addEventListener("visibilitychange", refreshWhenActive);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenActive);
      document.removeEventListener("visibilitychange", refreshWhenActive);
    };
  }, [refreshAccountSummary]);

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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <HeaderCommunity />
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="text-[#222] font-['Courier_New',Courier,monospace] text-[0.82rem] font-bold">Level {props.level}</span>
            <div className="w-[200px]">
              <ProgressBar value={props.xp} goal={props.xpGoal} maxed={props.isMaxLevel} />
            </div>
          </div>
          <div className="player-bank-indicator">
            <span aria-label={`Available bank balance $${displayedBankBalance.toLocaleString()}`}>
              ${displayedBankBalance.toLocaleString()}
            </span>
            {displayedAuctionEscrow > 0 ? (
              <span
                aria-label={`$${displayedAuctionEscrow.toLocaleString()} held in auction escrow`}
                className="player-auction-escrow"
                title="Active auction bids held in escrow"
              >
                (<i aria-hidden="true" className="fa fa-gavel" /> $
                {displayedAuctionEscrow.toLocaleString()})
              </span>
            ) : null}
            <NotificationCenter initialNotifications={initialNotifications} />
            {error ? (
              <span className="player-header-error" role="alert">
                {error}
              </span>
            ) : null}
          </div>
          <div className="flex gap-3">
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
        </div>
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
