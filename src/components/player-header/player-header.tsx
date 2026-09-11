import Link from "next/link";
import type { ReactNode } from "react";

import ProgressBar from "@/components/progress-bar/progress-bar";

import styles from "./player-header.module.css";

/** The community links, which both branches of the navbar show. */
export function HeaderCommunity({ className = "" }: { className?: string }) {
  return (
    <div className="flex items-center min-w-0 gap-3">
      <Link className={styles.title} href="/">
        artfunkel
      </Link>
      <nav aria-label="Artfunkel community" className={styles.links}>
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

export default function PlayerHeader({
  auctionEscrow,
  bankBalance,
  error = "",
  impersonating = false,
  isMaxLevel = false,
  level,
  notifications,
  onSignOut,
  xp,
  xpGoal,
}: {
  auctionEscrow: number;
  bankBalance: number;
  error?: string;
  impersonating?: boolean;
  isMaxLevel?: boolean;
  level: number;
  /** The notification centre, passed in so this stays free of its polling. */
  notifications?: ReactNode;
  onSignOut: () => void;
  xp: number;
  xpGoal: number;
}) {
  return (
    /* @container, not viewport breakpoints: the header is laid out against the
       width of its own box, so it reflows the same way inside the reference
       page's resizable frame as it does in the app. @2xl is 42rem and @5xl is
       64rem — the container scale, which is not the breakpoint scale. */
    <div className="@container grid grid-cols-12 items-center gap-2">
      <div className="col-span-4">
        <Link href="/">
          <span className="font-bold text-3xl @lg:text-4xl text-[#ff33cc]">artfunkel</span>
        </Link>
      </div>
      <div className="col-end-13 order-2 @2xl:order-3 flex justify-end gap-3">
        {!impersonating ? (
          <Link
            aria-label="Account settings"
            className="item-action-button inline-flex items-center justify-center no-underline"
            data-tooltip="Account settings"
            href="/play/account"
          >
            <i aria-hidden="true" className="fa fa-user-cog" />
          </Link>
        ) : null}
        <button
          aria-label={impersonating ? "Return to admin" : "Sign out"}
          className={`item-action-button ${styles.signOut}`}
          data-tooltip={impersonating ? "Return to admin" : "Sign out"}
          onClick={onSignOut}
          type="button"
        >
          <i aria-hidden="true" className="fa fa-sign-out" />
        </button>
      </div>
      <div className="col-span-12 order-3 @2xl:order-2 @2xl:col-span-6 @2xl:col-end-12 flex items-center gap-3">
        <div className="inline-flex items-center gap-1 grow">
          <span className="text-nowrap font-['Courier_New',Courier,monospace] text-sm font-bold text-[#222]">
            Level {level}
          </span>
          <div className="w-full">
            <ProgressBar goal={xpGoal} maxed={isMaxLevel} value={xp} />
          </div>
        </div>
        <div className="flex gap-2">
          <span className="text-sm font-bold text-[#222] font-['Courier_New',Courier,monospace]" aria-label={`Available bank balance $${bankBalance.toLocaleString()}`}>
            ${bankBalance.toLocaleString()}
          </span>
          <span className="inline-flex items-center text-sm font-bold text-[#222] font-['Courier_New',Courier,monospace]" aria-label={`Available bank balance $${bankBalance.toLocaleString()}`}>
            <i aria-hidden="true" className="fa fa-heart text-[#9a7b18]" />{735}
          </span>
        </div>
      </div>
      <div className="order-last flex items-center gap-2">
        {error ? (
          <span className="text-xs text-[#b00020]" role="alert">
            {error}
          </span>
        ) : auctionEscrow > 0 ? (
          <span
          aria-label={`$${auctionEscrow.toLocaleString()} held in auction escrow`}
          className="text-sm text-nowrap font-bold text-[#8a651e]"
          title="Active auction bids held in escrow"
          >
          <i aria-hidden="true" className="fa fa-gavel" /> ${auctionEscrow.toLocaleString()}
        </span>
        ) : null}
        {notifications}
      </div>
    </div>
  );
}
