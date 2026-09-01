"use client";

import { useRouter } from "next/navigation";

export default function PlayerHeader({
  screenName,
  bankBalance,
  xp,
}: {
  screenName: string;
  bankBalance: number;
  xp: number;
}) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/player/logout", { method: "POST" });
    router.push("/play/login");
    router.refresh();
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
      </div>
      <div className="legacy-nav-stats">
        <strong className="green-text">
          ${bankBalance.toLocaleString()}
        </strong>
        <strong className="af-color">{xp.toLocaleString()}xp</strong>
      </div>
      <button
        className="legacy-signout"
        onClick={logout}
        type="button"
      >
        sign out
      </button>
    </header>
  );
}
