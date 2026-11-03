import Link from "next/link";
import type { ReactNode } from "react";
import type { SupporterStatus } from "@/server/supporter-status";
import ActionButton from "../action-button/action-button";
import IconButton from "../icon-button/icon-button";
import ResponsiveMenu from "../responsive-menu";

export default function PlayerHeaderContent({
  auctionEscrow,
  bankBalance,
  error = "",
  impersonating = false,
  isArtist = false,
  karma,
  lotteryTickets,
  notifications,
  onOpenTutorial,
  onSignOut,
  supporterStatus,
}: {
  auctionEscrow: number;
  bankBalance: number;
  karma: number;
  lotteryTickets: number;
  error?: string;
  impersonating?: boolean;
  isArtist?: boolean;
  /** The notification centre, passed in so this stays free of its polling. */
  notifications?: ReactNode;
  onOpenTutorial?: () => void;
  onSignOut: () => void;
  supporterStatus?: SupporterStatus | null;
}) {
  return (
    <>
      <div className="player-header-brand col-span-12 @2xs:col-span-4">
        <Link href="/">
          <span className="font-bold text-2xl @md:text-4xl text-[#ff33cc]">artfunkel</span>
        </Link>
      </div>
      <div className="player-header-tools col-span-8 order-2 flex flex-wrap items-center justify-end gap-1 @2xs:gap-3">
        <div className="player-header-balances flex items-center gap-2">
          <span
            className={`text-sm font-bold ${bankBalance < 0 ? "bank-balance-negative" : "text-[#222]"} font-['Courier_New',Courier,monospace]`}
            aria-label={`Available bank balance $${bankBalance.toLocaleString()}`}
            data-label="Balance"
          >
            ${bankBalance.toLocaleString()}
          </span>
          <span
            className="inline-flex items-center text-sm font-bold text-[#222] font-['Courier_New',Courier,monospace]"
            aria-label={`${karma.toLocaleString()} Karma`}
            title="Earned by donating artwork and being kind. Used to level up items."
            data-label="Karma"
          >
            <i aria-hidden="true" className="fa fa-spa mr-2 text-[#9a7b18]" />
            {karma.toLocaleString()}
          </span>
          <span
            aria-label={`${lotteryTickets.toLocaleString()} lottery tickets`}
            className="inline-flex items-center text-sm font-bold text-[#222] font-['Courier_New',Courier,monospace]"
            title="Lottery tickets"
            data-label="Tickets"
          >
            <i aria-hidden="true" className="fa fa-ticket mr-2 text-[#8a651e]" />
            {lotteryTickets.toLocaleString()}
          </span>
          {auctionEscrow > 0 ? (
            <span
              aria-label={`$${auctionEscrow.toLocaleString()} held in auction escrow`}
              className="player-header-escrow text-sm text-nowrap font-bold text-[#8a651e]"
              title="Active auction bids held in escrow"
              data-label="Auction escrow"
            >
              <i aria-hidden="true" className="fa fa-gavel" /> $
              {auctionEscrow.toLocaleString()}
            </span>
          ) : null}
        </div>
        <div className="player-header-notifications">{notifications}</div>
        <ResponsiveMenu className="player-header-menu" label="Account">
          {onOpenTutorial ? (
            <IconButton
              aria-label="Open the Artfunkel tutorial"
              icon="fa-question"
              onClick={onOpenTutorial}
              title="How to play"
            />
          ) : null}
          <nav
            aria-label="Artfunkel community"
            className="flex items-center gap-1 @xs:gap-2"
          >
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
              iconClassName={
                supporterStatus ? `rarity-text ${supporterStatus}` : ""
              }
              rel="noreferrer"
              target="_blank"
              title="Patreon"
            />
          </nav>
          {isArtist ? (
            <Link className="player-signup inline-flex shrink-0 items-center gap-2" href="/artist">
              <i aria-hidden="true" className="fa fa-paint-brush" /> Artist studio
            </Link>
          ) : null}
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
        </ResponsiveMenu>
      </div>
      {error ? (
        <span
          className="col-span-12 order-last text-right text-xs text-[#b00020]"
          role="alert"
        >
          {error}
        </span>
      ) : null}
    </>
  );
}
