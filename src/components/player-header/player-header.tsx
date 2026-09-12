import Link from "next/link";
import type { ReactNode } from "react";
import ProgressBar from "@/components/progress-bar/progress-bar";
import ActionButton from "../action-button/action-button";
import IconButton from "../icon-button/icon-button";

export default function PlayerHeaderContent({
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
    <>
      <div className="col-span-12 @2xs:col-span-4">
        <Link href="/">
          <span className="font-bold text-2xl @md:text-4xl text-[#ff33cc]">artfunkel</span>
        </Link>
      </div>
      <div className="col-span-6 col-end-13 order-2 flex justify-end gap-1 @2xs:gap-3">
      <nav aria-label="Artfunkel community" className="flex items-center gap-1 @xs:gap-2">
        <IconButton
          aria-label="Join the Artfunkel Discord server"
          as="a"
          href="https://discord.gg/3dQdyhXVb"
          icon="fa-brands fa-discord"
          rel="noreferrer"
          target="_blank"
          title="Discord"
        />
        <IconButton
          aria-label="Visit the Artfunkel subreddit"
          as="a"
          href="https://www.reddit.com/r/artfunkel/"
          icon="fa-brands fa-reddit"
          rel="noreferrer"
          target="_blank"
          title="Reddit"
        />
        <IconButton
          aria-label="Support Artfunkel on Patreon"
          as="a"
          href="https://www.patreon.com/c/artfunkel"
          icon="fa-brands fa-patreon"
          rel="noreferrer"
          target="_blank"
          title="Patreon"
        />
      </nav>
        {!impersonating ? (
          <ActionButton
            as={Link}
            href="/play/account"
            icon="fa-user-cog"
            label="Account settings"
            size="xs"
          />
        ) : null}
        <ActionButton
          icon="fa-sign-out"
          label={impersonating ? "Return to admin" : "Sign out"}
          onClick={onSignOut}
          size="xs"
          type="button"        
        />
      </div>
      <div className="col-span-12 order-3 @3xl:col-span-6 flex items-center gap-3">
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
            <i aria-hidden="true" className="fa fa-spa text-[#9a7b18]" />{735}
          </span>
        </div>
      </div>
      <div className="order-last col-span-12 @3xl:col-span-6 flex items-center justify-end gap-2">
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
    </>
  );
}
