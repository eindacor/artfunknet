"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PlayerHeader({
  screenName,
  bankBalance,
  impersonating,
  xp,
  patreonTier,
  patreonSupporter = false,
}: {
  screenName: string;
  bankBalance: number;
  impersonating: boolean;
  xp: number;
  patreonTier?: string | null;
  patreonSupporter?: boolean;
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
      <span className="nav-title">artfunkel</span>
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
