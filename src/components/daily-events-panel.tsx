"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import GalleryChat from "@/app/play/galleries/gallery-chat";
import ItemCard from "@/components/item-cards/item-card";
import type { CardLegendaryAttribute } from "@/components/item-cards/types";
import RafflePanel, {
  type RafflePrizeView,
} from "@/components/raffle-panel";
import type { HydratedGameItem } from "@/server/item-artwork";
import type { ForgeryContestPrizeView } from "@/server/forgery-contest";
import type { ForgeryContestPhase } from "@/server/forgery-contest-schedule";
import type { RaffleWinner } from "@/server/raffle-gameplay";
import type { DailyEventCallToAction } from "@/server/daily-event-attention";

const DAYS = [
  { short: "SUN", title: "Bonus XP" },
  { short: "MON", title: "Weekly Lottery" },
  { short: "TUE", title: "Duper Tuesday" },
  { short: "WED", title: "Live Auction" },
  { short: "THU", title: "Seasonals" },
  { short: "FRI", title: "Free Ultimate Crate" },
  { short: "SAT", title: "Bonus Money" },
] as const;

type ForgeryEntryView = {
  id: string;
  playerId: string;
  playerName: string;
  item: HydratedGameItem;
  votes: number;
};

type ForgeryWinnerView = {
  place: number;
  playerId: string;
  playerName: string;
  votes: number;
  item: HydratedGameItem;
};

type ForgeryContestView = {
  phase: ForgeryContestPhase;
  nextPhaseAt: string;
  settling: boolean;
  submissionsOpen: boolean;
  votingOpen: boolean;
  nextSettlementAt: string;
  prizes: ForgeryContestPrizeView[];
  currentEntryId: string | null;
  eligibleItems: HydratedGameItem[];
  entries: ForgeryEntryView[];
  votedEntryId: string | null;
  lastWinners: ForgeryWinnerView[];
};

type LiveAuctionView = {
  activeToday: boolean;
  live: boolean;
  hidden: boolean;
  biddingOpen: boolean;
  streamUrl: string;
  thankYou: boolean;
  currentItem: HydratedGameItem | null;
  currentBid: number | null;
  minimumBid: number | null;
  increment: number | null;
  winnerName: string | null;
};

type SeasonalView = {
  activeToday: boolean;
  nextRotationAt: string;
  items: HydratedGameItem[];
};

type DebugDayMode = "today" | "not-today";

type FridayCrateView = {
  availableToday: boolean;
  claimed: boolean;
  itemCount: number;
  weekKey: string;
};

export default function DailyEventsPanel({
  callsToAction = [],
  currentDay,
  impersonating,
  legendaryAttributes,
  playerId,
  raffle,
}: {
  callsToAction?: DailyEventCallToAction[];
  currentDay: number;
  impersonating: boolean;
  legendaryAttributes: CardLegendaryAttribute[];
  playerId: string;
  raffle: {
    availableTickets: number;
    nextDrawAt: string;
    prizes: RafflePrizeView[];
    previousWinners: RaffleWinner[];
  };
}) {
  const [selectedDay, setSelectedDay] = useState(currentDay);
  const [debugDayMode, setDebugDayMode] =
    useState<DebugDayMode>("today");
  const [debugBusy, setDebugBusy] = useState(false);
  const [debugError, setDebugError] = useState("");
  const [debugMessage, setDebugMessage] = useState("");
  const router = useRouter();
  const activeToday = impersonating
    ? debugDayMode === "today"
    : selectedDay === currentDay;

  async function runDebugAction(
    action: "draw-lottery" | "rotate-seasonals",
  ) {
    setDebugBusy(true);
    setDebugError("");
    setDebugMessage("");
    try {
      const response = await fetch("/api/play/daily-events/debug", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "The debug action failed.");
      }
      setDebugMessage(body.message ?? "Debug action completed.");
      router.refresh();
    } catch (error) {
      setDebugError(
        error instanceof Error ? error.message : "The debug action failed.",
      );
    } finally {
      setDebugBusy(false);
    }
  }

  return (
    <section className="daily-events">
      {impersonating ? (
        <section className="daily-event-debug-panel">
          <div>
            <strong>Test account event controls</strong>
            <span>
              {debugDayMode === "today"
                ? "Every selected panel acts as its event day."
                : "Every selected panel acts as a different day."}
            </span>
          </div>
          <div className="daily-event-debug-toggle" role="group" aria-label="Simulated event day">
            <button
              className={debugDayMode === "today" ? "selected" : ""}
              onClick={() => setDebugDayMode("today")}
              type="button"
            >
              Today
            </button>
            <button
              className={debugDayMode === "not-today" ? "selected" : ""}
              onClick={() => setDebugDayMode("not-today")}
              type="button"
            >
              Not today
            </button>
          </div>
          {selectedDay === 1 ? (
            <button
              disabled={debugBusy}
              onClick={() => void runDebugAction("draw-lottery")}
              type="button"
            >
              Draw lottery
            </button>
          ) : null}
          <ActionMessages error={debugError} message={debugMessage} />
        </section>
      ) : null}
      <div aria-label="Daily events" className="daily-event-calendar" role="tablist">
        {DAYS.map((day, index) => {
          const action = callsToAction.find(action => action.day === index);
          return (
            <button
              aria-label={`${day.short}: ${day.title}${action ? `. ${action.description}` : ""}`}
              aria-selected={selectedDay === index}
              className={`${selectedDay === index ? "selected" : ""} ${action ? "has-attention" : ""} ${
                (impersonating
                  ? debugDayMode === "today" && selectedDay === index
                  : currentDay === index)
                  ? "today"
                  : ""
              }`}
              key={day.short}
              onClick={() => setSelectedDay(index)}
              role="tab"
              title={action?.description}
              type="button"
            >
              <span>{day.short}</span>
              {action ? (
                <span aria-hidden="true" className="daily-event-cta">
                  {action.label}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="daily-event-stage" role="tabpanel">
        {selectedDay === 0 ? (
          <CopyEvent
            activeToday={activeToday}
            title="Bonus XP"
          >
            Actions will earn bonus XP on Sundays. Details and reward values
            will be announced when this event is activated.
          </CopyEvent>
        ) : null}
        {selectedDay === 1 ? (
          <RafflePanel
            availableTickets={raffle.availableTickets}
            key={`${raffle.nextDrawAt}:${raffle.prizes.map((prize) => prize.item._id).join(",")}`}
            nextDrawAt={raffle.nextDrawAt}
            previousWinners={raffle.previousWinners}
            prizes={raffle.prizes}
            viewerId={playerId}
          />
        ) : null}
        {selectedDay === 2 ? (
          <ForgeryContestPanel
            impersonating={impersonating}
            legendaryAttributes={legendaryAttributes}
            playerId={playerId}
          />
        ) : null}
        {selectedDay === 3 ? (
          <LiveAuctionPanel
            debugDayMode={impersonating ? debugDayMode : null}
            legendaryAttributes={legendaryAttributes}
            playerId={playerId}
          />
        ) : null}
        {selectedDay === 4 ? (
          <SeasonalEventPanel
            debugDayMode={impersonating ? debugDayMode : null}
            impersonating={impersonating}
            legendaryAttributes={legendaryAttributes}
            playerId={playerId}
          />
        ) : null}
        {selectedDay === 5 ? (
          <FridayCratePanel
            debugDayMode={impersonating ? debugDayMode : null}
            impersonating={impersonating}
          />
        ) : null}
        {selectedDay === 6 ? (
          <CopyEvent
            activeToday={activeToday}
            title="Bonus Money"
          >
            Actions will earn extra money on Saturdays. Details and reward
            values will be announced when this event is activated.
          </CopyEvent>
        ) : null}
      </div>
    </section>
  );
}

function CopyEvent({
  activeToday,
  children,
  title,
}: {
  activeToday?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="daily-event-copy">
      <h3>{title}</h3>
      <div className="daily-event-copy-mark">artfunkel</div>
      <p>{children}</p>
      {activeToday === false ? (
        <p className="daily-event-callout">This event is not active today.</p>
      ) : null}
    </section>
  );
}

function ForgeryContestPanel({
  impersonating,
  legendaryAttributes,
  playerId,
}: {
  impersonating: boolean;
  legendaryAttributes: CardLegendaryAttribute[];
  playerId: string;
}) {
  const [view, setView] = useState<ForgeryContestView | null>(null);
  const [index, setIndex] = useState(0);
  const [submissionIndex, setSubmissionIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/play/daily-events/forgery-contest", { cache: "no-store" });
    const body = (await response.json()) as ForgeryContestView & {
      error?: string;
    };
    if (!response.ok) throw new Error(body.error ?? "Unable to load the contest.");
    setView(body);
  }, []);

  useEffect(() => {
    const refresh = () => {
      void load().catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "Unable to load the contest."),
      );
    };
    const timeout = window.setTimeout(refresh, 0);
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  const nextPhaseAt = view?.nextPhaseAt;
  useEffect(() => {
    if (!nextPhaseAt) return;
    const timeout = window.setTimeout(() => {
      void load().catch(() => setError("Unable to refresh Duper Tuesday."));
    }, Math.max(100, new Date(nextPhaseAt).getTime() - Date.now() + 100));
    return () => window.clearTimeout(timeout);
  }, [load, nextPhaseAt]);

  async function act(method: "POST" | "PATCH", payload: object) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/play/daily-events/forgery-contest", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error ?? "The contest action failed.");
      setMessage(body.message ?? "Contest entry saved.");
      setIndex(0);
      setSubmissionIndex(0);
      window.dispatchEvent(new Event("artfunkel:daily-events-change"));
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "The contest action failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function drawWinners() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/play/daily-events/debug", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "settle-forgery" }),
      });
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "The contest could not be settled.");
      }
      setMessage(body.message ?? "Duper Tuesday winners drawn.");
      setIndex(0);
      window.dispatchEvent(new Event("artfunkel:daily-events-change"));
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "The contest could not be settled.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!view) return <EventLoading title="Duper Tuesday" error={error} />;
  const visibleEntryCount = Math.min(5, view.entries.length);
  const visibleEntries = Array.from(
    { length: visibleEntryCount },
    (_, offset) =>
      view.entries[(index + offset) % Math.max(1, view.entries.length)],
  );
  const submissionItem =
    view.eligibleItems[
      submissionIndex % Math.max(1, view.eligibleItems.length)
    ];

  return (
    <section className="daily-event-content forgery-contest-event" data-phase={view.phase}>
      <header>
        <h3>Duper Tuesday</h3>
        <span>
          {view.phase === "results"
            ? null
            : `Drawing ${new Date(view.nextSettlementAt).toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" })}.`}
        </span>
      </header>
      <p className="forgery-contest-section-note">
        {view.phase === "submissions"
          ? "Submit through Monday night. Entries stay hidden until voting opens Tuesday at 12am. Winners are drawn at noon. All times are New York time."
          : view.phase === "voting"
            ? "Entries are closed. Vote for your favorite until noon on Tuesday (EST)."
            : "Entries reopen Wednesday at 12am EST."}
      </p>
      {view.settling ? (
        <p className="daily-event-callout">
          The Duper Tuesday drawing is in progress. Results will appear shortly.
        </p>
      ) : null}
      {impersonating && view.phase === "voting" ? (
        <div className="daily-event-debug-action">
          <button
            disabled={busy || view.entries.length === 0}
            onClick={() => void drawWinners()}
            type="button"
          >
            Draw contest winners
          </button>
        </div>
      ) : null}
      {view.phase !== "results" ? (
        <div className="forgery-contest-overview">
        {view.phase === "submissions" ? (
          <section aria-label="Your submission" className="forgery-contest-section daily-event-submission">
          <header>
            <h4>Your submission</h4>
            <span>{view.currentEntryId ? "Submitted" : "One entry per player"}</span>
          </header>
          {view.currentEntryId !== null ? (
            <p className="forgery-contest-section-note">
              Your forgery is entered. Come back Tuesday at 12am to see the entries and vote.
            </p>
          ) : (
            <>
              <p className="forgery-contest-section-note">
                Submissions permanently leave your inventory and join the Artfunkel Inc. collection after the drawing.
              </p>
              {submissionItem ? (
                <div className="daily-event-browser">
                  <button
                    aria-label="Previous owned forgery"
                    disabled={view.eligibleItems.length < 2}
                    onClick={() =>
                      setSubmissionIndex(
                        (current) =>
                          (current - 1 + view.eligibleItems.length) %
                          view.eligibleItems.length,
                      )
                    }
                    type="button"
                  >
                    <i aria-hidden="true" className="fa fa-chevron-left" />
                  </button>
                  <div>
                    <div className="forgery-contest-card-art">
                      <ItemCard
                        interactive={false}
                        item={submissionItem}
                        key={submissionItem._id}
                        legendaryAttributes={legendaryAttributes}
                        permissions={{
                          canManageItem: false,
                          canCustomizeCosmetic: false,
                        }}
                        viewerId={playerId}
                      />
                    </div>
                    <button
                      className="daily-event-submit-button"
                      disabled={busy || !view.submissionsOpen}
                      onClick={() =>
                        void act("POST", { itemId: submissionItem._id })
                      }
                      type="button"
                    >
                      Submit this forgery
                    </button>
                  </div>
                  <button
                    aria-label="Next owned forgery"
                    disabled={view.eligibleItems.length < 2}
                    onClick={() =>
                      setSubmissionIndex(
                        (current) =>
                          (current + 1) % view.eligibleItems.length,
                      )
                    }
                    type="button"
                  >
                    <i aria-hidden="true" className="fa fa-chevron-right" />
                  </button>
                </div>
              ) : (
                <p className="daily-event-empty">
                  No eligible forgeries. Create one from your archive to enter.
                </p>
              )}
            </>
          )}
          </section>
        ) : null}
        <section aria-label="Contest rewards" className="forgery-contest-section forgery-contest-rewards">
          <header>
            <h4>Contest rewards</h4>
            <span>Top three entries</span>
          </header>
          <p className="forgery-contest-section-note">
            Winners receive a share of their submission&apos;s estimated value plus the prize below.
          </p>
          <div className="forgery-contest-reward-grid">
            {view.prizes.map(({ place, item }) => (
              <article key={place}>
                <h5>{place === 1 ? "First" : place === 2 ? "Second" : "Third"} place</h5>
                <div className="forgery-contest-card-art">
                  <ItemCard
                    item={item}
                    legendaryAttributes={legendaryAttributes}
                    permissions={{ canManageItem: false, canCustomizeCosmetic: false }}
                    viewerId={playerId}
                  />
                </div>
              </article>
            ))}
          </div>
        </section>
        </div>
      ) : null}
      {view.phase === "voting" ? (
        <section aria-label="Current entries and voting" className="forgery-contest-section forgery-contest-entries">
        <header>
          <h4>Entries &amp; voting</h4>
          <span>
            {view.entries.length.toLocaleString()} {view.entries.length === 1 ? "entry" : "entries"}
          </span>
        </header>
        <p className="forgery-contest-section-note">
          Choose another player&apos;s work. You can move your vote until the drawing.
        </p>
        {visibleEntries.length > 0 ? (
          <div className="daily-event-contest-browser">
            <button
              aria-label="Show previous contestants"
              className="daily-event-contest-navigation"
              disabled={view.entries.length <= visibleEntryCount}
              onClick={() =>
                setIndex(
                  (current) =>
                    (current - 1 + view.entries.length) % view.entries.length,
                )
              }
              type="button"
            >
              <i aria-hidden="true" className="fa fa-chevron-left" />
            </button>
            <div className="daily-event-contest-grid">
              {visibleEntries.map((entry) => {
                const isOwnEntry = entry.playerId === playerId;
                const isCurrentVote = view.votedEntryId === entry.id;
                return (
                  <article
                    className={`daily-event-contest-card ${
                      isCurrentVote ? "selected" : ""
                    }`}
                    key={entry.id}
                  >
                    <div className="daily-event-contest-card-art">
                      <ItemCard
                        hideForgeryWatermark
                        item={entry.item}
                        legendaryAttributes={legendaryAttributes}
                        permissions={{
                          canManageItem: false,
                          canCustomizeCosmetic: false,
                        }}
                        viewerId={playerId}
                      />
                    </div>
                    <div className="daily-event-entry-details">
                      <strong>{entry.playerName}</strong>
                      <button
                        aria-pressed={isCurrentVote}
                        className={`daily-event-vote-button ${
                          isCurrentVote ? "selected" : ""
                        }`}
                        disabled={
                          busy ||
                          !view.votingOpen ||
                          isOwnEntry ||
                          isCurrentVote
                        }
                        onClick={() =>
                          void act("PATCH", { entryId: entry.id })
                        }
                        title={
                          isOwnEntry
                            ? "You cannot vote for your own entry."
                            : isCurrentVote
                              ? "This is your current vote."
                              : view.votedEntryId
                                ? "Move your vote to this entry."
                                : "Vote for this entry."
                        }
                        type="button"
                      >
                        {isOwnEntry
                          ? "Your entry"
                          : isCurrentVote
                            ? "Your vote"
                            : view.votedEntryId
                              ? "Change vote"
                              : "Vote"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            <button
              aria-label="Show next contestants"
              className="daily-event-contest-navigation"
              disabled={view.entries.length <= visibleEntryCount}
              onClick={() =>
                setIndex((current) => (current + 1) % view.entries.length)
              }
              type="button"
            >
              <i aria-hidden="true" className="fa fa-chevron-right" />
            </button>
          </div>
        ) : (
          <p className="daily-event-empty">
            No works have been submitted yet.
          </p>
        )}
        </section>
      ) : null}
      {view.phase === "results" ? (
        <section aria-label="Today's winners" className="forgery-contest-section forgery-contest-celebration">
          <header>
            <h4><i aria-hidden="true" className="fa fa-trophy" /> Today&apos;s Winners</h4>
          </header>
          {view.lastWinners.length === 0 ? (
            <p className="daily-event-empty">
              {view.settling ? "Counting the votes..." : "No winning entries this week. Bring your best forgery to the next round!"}
            </p>
          ) : null}
          <div className="forgery-contest-reward-grid">
            {view.lastWinners.map((winner) => (
              <article key={`${winner.place}:${winner.item._id}`}>
                <span className="forgery-contest-winner-place">
                  {winner.place === 1 ? "First" : winner.place === 2 ? "Second" : "Third"} place
                </span>
                <strong>#{winner.place} · {winner.playerName}</strong>
                <div className="forgery-contest-card-art">
                  <ItemCard
                    interactive={false}
                    item={winner.item}
                    legendaryAttributes={legendaryAttributes}
                    permissions={{
                      canManageItem: false,
                      canCustomizeCosmetic: false,
                    }}
                    viewerId={playerId}
                  />
                </div>
                <span>{winner.votes.toLocaleString()} votes</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <ActionMessages error={error} message={message} />
    </section>
  );
}

function LiveAuctionPanel({
  debugDayMode,
  legendaryAttributes,
  playerId,
}: {
  debugDayMode: DebugDayMode | null;
  legendaryAttributes: CardLegendaryAttribute[];
  playerId: string;
}) {
  const [view, setView] = useState<LiveAuctionView | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const currentItemId = useRef<string | null>(null);
  const load = useCallback(async (resetAmount = false) => {
    const response = await fetch(
      `/api/play/daily-events/live-auction${getDebugQuery(debugDayMode)}`,
      { cache: "no-store" },
    );
    const body = (await response.json()) as LiveAuctionView & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Unable to load the live auction.");
    const nextItemId = body.currentItem?._id ?? null;
    if (resetAmount || nextItemId !== currentItemId.current) {
      setAmount(String(body.minimumBid || ""));
    }
    currentItemId.current = nextItemId;
    setView(body);
  }, [debugDayMode]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load().catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "Unable to load the live auction."),
      );
    }, 0);
    const interval = window.setInterval(() => void load().catch(() => undefined), 5000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [load]);

  async function bid() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/play/daily-events/live-auction", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount: Number(amount),
          debugDayMode,
        }),
      });
      const body = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error ?? "The bid could not be placed.");
      setMessage(body.message ?? "Bid placed.");
      window.dispatchEvent(new Event("artfunkel:account-summary-change"));
      await load(true);
    } catch (bidError) {
      setError(bidError instanceof Error ? bidError.message : "The bid could not be placed.");
    } finally {
      setBusy(false);
    }
  }

  if (!view) return <EventLoading title="Live Auction" error={error} />;
  if (!view.live) {
    return (
      <CopyEvent
        activeToday={view.activeToday}
        title="Live Auction Stream"
      >
        Join scheduled live auctions to bid alongside the Artfunkel community.
        Stream information will appear here when the next event begins.
      </CopyEvent>
    );
  }
  const itemVisible = !view.hidden && Boolean(view.currentItem);
  return (
    <section className="daily-event-content">
      <header>
        <p>{view.thankYou ? "Live auction complete" : "Live auction"}</p>
        {view.thankYou ? <h3>Thank you for joining</h3> : null}
        {!view.thankYou && !itemVisible ? (
          <h3>Live auction in progress</h3>
        ) : null}
      </header>
      {view.streamUrl ? (
        <TwitchStreamEmbed streamUrl={view.streamUrl} />
      ) : null}
      {view.thankYou ? (
        <p className="daily-event-callout">
          All buffered works have been auctioned. The host will end the stream
          shortly.
        </p>
      ) : itemVisible && view.currentItem ? (
        <div className="live-auction-player">
          <ItemCard
            hideAuctionWatermark
            item={view.currentItem}
            key={view.currentItem._id}
            legendaryAttributes={legendaryAttributes}
            permissions={{ canManageItem: false, canCustomizeCosmetic: false }}
            viewerId={playerId}
          />
          <GalleryChat global viewerId={playerId} />
          <div className="live-auction-bid-panel">
            <dl className="live-auction-bid-summary">
              <div>
                <dt>Current bid</dt>
                <dd>${(view.currentBid ?? 0).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Next minimum</dt>
                <dd>${(view.minimumBid ?? 0).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Increment</dt>
                <dd>${(view.increment ?? 0).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Leading bidder</dt>
                <dd>{view.winnerName ?? "No bids yet"}</dd>
              </div>
            </dl>
            <label className="live-auction-bid-entry">
              <span>Your bid</span>
              <input
                min={view.minimumBid ?? 1}
                onChange={(event) => setAmount(event.target.value)}
                step="1"
                type="number"
                value={amount}
              />
            </label>
            <button
              disabled={busy || !view.biddingOpen}
              onClick={() => void bid()}
              type="button"
            >
              Submit bid
            </button>
          </div>
        </div>
      ) : (
        <div className="live-auction-intermission-copy">
          <div className="daily-event-copy-mark">artfunkel</div>
          <h4>The next work will be revealed shortly.</h4>
        </div>
      )}
      {view.thankYou || !itemVisible ? (
        <GalleryChat global viewerId={playerId} />
      ) : null}
      <ActionMessages error={error} message={message} />
    </section>
  );
}

function TwitchStreamEmbed({ streamUrl }: { streamUrl: string }) {
  const [parent, setParent] = useState("");

  useEffect(() => {
    setParent(window.location.hostname);
  }, []);

  const embedUrl = getTwitchEmbedUrl(streamUrl, parent);
  if (!embedUrl) return null;

  return (
    <div className="live-auction-stream">
      <iframe
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        src={embedUrl}
        title="Artfunkel live auction Twitch stream"
      />
    </div>
  );
}

function getTwitchEmbedUrl(streamUrl: string, parent: string): string | null {
  if (!parent) return null;
  try {
    const parsed = new URL(streamUrl);
    if (
      parsed.protocol !== "https:" ||
      (parsed.hostname !== "www.twitch.tv" && parsed.hostname !== "twitch.tv")
    ) {
      return null;
    }
    const channel = parsed.pathname.split("/").filter(Boolean)[0];
    if (!channel || !/^[a-zA-Z0-9_]{1,25}$/.test(channel)) return null;
    const embed = new URL("https://player.twitch.tv/");
    embed.searchParams.set("channel", channel);
    embed.searchParams.set("parent", parent);
    embed.searchParams.set("autoplay", "true");
    embed.searchParams.set("muted", "true");
    return embed.toString();
  } catch {
    return null;
  }
}

function SeasonalEventPanel({
  debugDayMode,
  impersonating,
  legendaryAttributes,
  playerId,
}: {
  debugDayMode: DebugDayMode | null;
  impersonating: boolean;
  legendaryAttributes: CardLegendaryAttribute[];
  playerId: string;
}) {
  const [view, setView] = useState<SeasonalView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(
      `/api/play/daily-events/seasonals${getDebugQuery(debugDayMode)}`,
    );
    const body = (await response.json()) as SeasonalView & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Unable to load seasonals.");
    setView(body);
  }, [debugDayMode]);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load().catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load seasonals.",
        ),
      );
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);
  async function rotateSeasonals() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/play/daily-events/debug", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "rotate-seasonals" }),
      });
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? "Seasonal artworks could not be changed.");
      }
      setMessage(body.message ?? "Seasonal artworks changed.");
      await load();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Seasonal artworks could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!view) return <EventLoading title="Seasonals" error={error} />;
  return (
    <section className="daily-event-content">
      <header>
        <h3>Seasonals Change</h3>
        <span>Next seasonal rotation: {new Date(view.nextRotationAt).toLocaleString()}</span>
      </header>
      {impersonating ? (
        <div className="daily-event-debug-action">
          <button
            disabled={busy}
            onClick={() => void rotateSeasonals()}
            type="button"
          >
            Change seasonal artworks
          </button>
        </div>
      ) : null}
      <div className="daily-seasonal-grid">
        {view.items.map((item) => (
          <ItemCard
            interactive={false}
            item={item}
            key={item._id}
            legendaryAttributes={legendaryAttributes}
            permissions={{ canManageItem: false, canCustomizeCosmetic: false }}
            viewerId={playerId}
          />
        ))}
      </div>
      <ActionMessages error={error} message={message} />
    </section>
  );
}

function FridayCratePanel({
  debugDayMode,
  impersonating,
}: {
  debugDayMode: DebugDayMode | null;
  impersonating: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<FridayCrateView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(
      `/api/play/daily-events/friday-crate${getDebugQuery(debugDayMode)}`,
    );
    const body = (await response.json()) as FridayCrateView & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Unable to load the Friday event.");
    setView(body);
  }, [debugDayMode]);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load().catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "Unable to load the Friday event."),
      );
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function openCrate() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/play/daily-events/friday-crate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ debugDayMode }),
      });
      const body = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error ?? "The crate could not be opened.");
      setMessage(body.message ?? "Ultimate crate opened.");
      window.dispatchEvent(new Event("artfunkel:daily-events-change"));
      await load();
      router.refresh();
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "The crate could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  if (!view) return <EventLoading title="Free Ultimate Crate" error={error} />;
  return (
    <section className="daily-event-copy friday-crate-event">
      <h3>Free Ultimate Crate</h3>
      <div className="daily-event-crate-icon">
        <i aria-hidden="true" className="fa fa-cube" />
      </div>
      <p>
        Open one free Ultimate crate containing {view.itemCount} paintings each
        Friday.
      </p>
      <button
        className={impersonating ? "daily-event-debug-button" : ""}
        disabled={busy || view.claimed || !view.availableToday}
        onClick={() => void openCrate()}
        type="button"
      >
        {view.claimed
          ? "Claimed this week"
          : view.availableToday
            ? impersonating
              ? "Debug: Open ultimate crate"
              : "Open free crate"
            : "Available Friday"}
      </button>
      <ActionMessages error={error} message={message} />
    </section>
  );
}

function getDebugQuery(mode: DebugDayMode | null): string {
  return mode ? `?debugDayMode=${encodeURIComponent(mode)}` : "";
}

function EventLoading({ error, title }: { error: string; title: string }) {
  return (
    <section className="daily-event-copy">
      <h3>{title}</h3>
      <p>{error || "Loading event..."}</p>
    </section>
  );
}

function ActionMessages({
  error,
  message,
}: {
  error: string;
  message: string;
}) {
  return (
    <>
      {message ? <p className="action-notice success">{message}</p> : null}
      {error ? <p className="action-notice error">{error}</p> : null}
    </>
  );
}
