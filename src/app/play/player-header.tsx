"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { PlayerNotification } from "@/server/player-notifications";

import NotificationCenter from "./notification-center";
import PlayerHeaderContent, {
  HeaderCommunity,
} from "@/components/player-header/player-header";

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
      <header className="legacy-navbar">
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
      <PlayerHeaderContent
        auctionEscrow={displayedAuctionEscrow}
        bankBalance={displayedBankBalance}
        error={error}
        impersonating={impersonating}
        isMaxLevel={props.isMaxLevel}
        level={props.level}
        notifications={
          <NotificationCenter initialNotifications={initialNotifications} />
        }
        onSignOut={logout}
        xp={props.xp}
        xpGoal={props.xpGoal}
      />
    </header>
  );
}
