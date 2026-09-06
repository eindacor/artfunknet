"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import ItemThumbnail from "@/components/item-thumbnail";
import ItemCard from "@/components/item-cards/item-card";
import { resolveCardRendererId } from "@/components/item-cards/selection";
import StandardItemDialog from "@/components/item-cards/standard-item-dialog";
import type { AuctionView } from "@/server/auction-gameplay";
import { ARTWORK_RARITIES, type ArtworkRarity } from "@/server/gameplay";
import type { CardLegendaryAttribute } from "@/components/item-cards/types";

type AuctionResponse = {
  auctions: AuctionView[];
  total: number;
};

type AuctionViewMode = "expanded" | "list";

const CARD_TYPES = ["standard", "foil", "seasonal", "lottery", "original"];

export default function AuctionHouse({
  initialBankBalance,
  legendaryAttributes,
  marketExpertExpiration,
  playerId,
}: {
  initialBankBalance: number;
  legendaryAttributes: CardLegendaryAttribute[];
  marketExpertExpiration: string | null;
  playerId: string;
}) {
  const router = useRouter();
  const [bankBalance, setBankBalance] = useState(initialBankBalance);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("remaining");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [rarities, setRarities] = useState<ArtworkRarity[]>([
    ...ARTWORK_RARITIES,
  ]);
  const [types, setTypes] = useState([...CARD_TYPES]);
  const [exclusivity, setExclusivity] = useState("all");
  const [quest, setQuest] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuctionResponse>({
    auctions: [],
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AuctionView | null>(null);
  const [marketExpert, setMarketExpert] = useState(false);
  const [viewMode, setViewMode] = useState<AuctionViewMode>("list");
  const pageSize = viewMode === "expanded" ? 20 : 30;

  const query = useMemo(() => {
    const params = new URLSearchParams({
      search,
      sort,
      order,
      exclusivity,
      quest,
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    rarities.forEach((rarity) => params.append("rarity", rarity));
    types.forEach((type) => params.append("type", type));
    return params.toString();
  }, [
    exclusivity,
    order,
    page,
    pageSize,
    quest,
    rarities,
    search,
    sort,
    types,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/play/auctions?${query}`, {
        cache: "no-store",
      });
      const body = (await response.json()) as AuctionResponse & {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "Auctions unavailable.");
      setData(body);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "The auction house could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setMarketExpert(
        marketExpertExpiration !== null &&
          new Date(marketExpertExpiration).getTime() > Date.now(),
      );
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [marketExpertExpiration]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timeout);
  }, [load]);

  function toggleRarity(rarity: ArtworkRarity) {
    if (rarities.length === 1 && rarities.includes(rarity)) return;
    setPage(1);
    setRarities((current) =>
      current.includes(rarity)
        ? current.filter((value) => value !== rarity)
        : [...current, rarity],
    );
  }

  function toggleType(type: string) {
    if (types.length === 1 && types.includes(type)) return;
    setPage(1);
    setTypes((current) =>
      current.includes(type)
        ? current.filter((value) => value !== type)
        : [...current, type],
    );
  }

  const pages = Math.max(1, Math.ceil(data.total / pageSize));

  return (
    <main className="auction-house">
      {marketExpert ? (
        <p className="auctioneer-access">
          <i aria-hidden="true" className="fa fa-area-chart" /> Auctioneer
          market analysis is active until{" "}
          {marketExpertExpiration
            ? new Date(marketExpertExpiration).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })
            : ""}
          .
        </p>
      ) : null}

      <section className="auction-filters">
        <label className="auction-search">
          <span>Search</span>
          <input
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            placeholder="title, artist, or seller"
            type="search"
            value={search}
          />
        </label>
        <label>
          <span>Sort</span>
          <select
            onChange={(event) => {
              setPage(1);
              setSort(event.target.value);
            }}
            value={sort}
          >
            <option value="remaining">time remaining</option>
            <option value="price">current bid</option>
            <option value="seller">seller</option>
            <option value="title">title</option>
            <option value="artist">artist</option>
            <option value="date">artwork date</option>
            <option value="medium">medium</option>
            <option value="rarity">rarity</option>
            {marketExpert ? <option value="condition">condition</option> : null}
            {marketExpert ? <option value="rolls">roll count</option> : null}
            {marketExpert ? <option value="level">level</option> : null}
          </select>
        </label>
        <label>
          <span>Order</span>
          <select
            onChange={(event) => setOrder(event.target.value as "asc" | "desc")}
            value={order}
          >
            <option value="asc">ascending</option>
            <option value="desc">descending</option>
          </select>
        </label>
        <label>
          <span>Access</span>
          <select
            onChange={(event) => {
              setPage(1);
              setExclusivity(event.target.value);
            }}
            value={exclusivity}
          >
            <option value="all">all auctions</option>
            <option value="public">public only</option>
            <option value="private">private only</option>
          </select>
        </label>
        <label>
          <span>Research</span>
          <select
            onChange={(event) => {
              setPage(1);
              setQuest(event.target.value);
            }}
            value={quest}
          >
            <option value="all">all artwork</option>
            <option value="quest">quest targets</option>
            {marketExpert ? <option value="sought">sought by others</option> : null}
          </select>
        </label>
        <fieldset>
          <legend>Rarity</legend>
          {ARTWORK_RARITIES.map((rarity) => (
            <label key={rarity}>
              <input
                checked={rarities.includes(rarity)}
                onChange={() => toggleRarity(rarity)}
                type="checkbox"
              />
              {rarity}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Card type</legend>
          {CARD_TYPES.map((type) => (
            <label key={type}>
              <input
                checked={types.includes(type)}
                onChange={() => toggleType(type)}
                type="checkbox"
              />
              {type}
            </label>
          ))}
        </fieldset>
      </section>

      {error ? <p className="auction-house-error">{error}</p> : null}
      <div className="auction-results-heading">
        <strong>{data.total.toLocaleString()} available auctions</strong>
        <div className="auction-results-actions">
          <div aria-label="Auction view" className="auction-view-toggle">
            <button
              aria-pressed={viewMode === "expanded"}
              onClick={() => {
                setPage(1);
                setViewMode("expanded");
              }}
              type="button"
            >
              <i aria-hidden="true" className="fa fa-th" />
            </button>
            <button
              aria-pressed={viewMode === "list"}
              onClick={() => {
                setPage(1);
                setViewMode("list");
              }}
              type="button"
            >
              <i aria-hidden="true" className="fa fa-list" />
            </button>
          </div>
          <button onClick={() => void load()} type="button">
            <i aria-hidden="true" className="fa fa-refresh" />
          </button>
        </div>
      </div>
      {loading ? (
        <p className="empty-state">Reviewing the auction ledger...</p>
      ) : data.auctions.length === 0 ? (
        <p className="empty-state">No auctions match these filters.</p>
      ) : viewMode === "list" ? (
        <div className="auction-list-scroll">
          <div className="auction-list" role="table">
            <div className="auction-list-header" role="row">
              <span role="columnheader">Artwork</span>
              <span role="columnheader">Details</span>
              <span role="columnheader">Seller</span>
              <span role="columnheader">Estimated value</span>
              <span role="columnheader">Current</span>
              <span role="columnheader">Next bid</span>
              <span role="columnheader">Buy now</span>
              <span role="columnheader">Remaining</span>
              <span aria-hidden="true" />
            </div>
            {data.auctions.map((auction) => (
              <article
                aria-label={`Open auction for ${auction.item.artwork.title} by ${auction.item.artwork.artist}`}
                className="auction-list-row"
                data-rarity={auction.item.artwork.rarity}
                key={auction._id}
                onClick={() => setSelected(auction)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelected(auction);
                  }
                }}
                role="row"
                tabIndex={0}
              >
                <div className="auction-list-artwork" role="cell">
                  <div className="auction-list-card">
                    <ItemThumbnail alt="" item={auction.item} />
                  </div>
                  <div>
                    <strong>{auction.item.artwork.title}</strong>
                    <span>{auction.item.artwork.artist}</span>
                  </div>
                </div>
                <div className="auction-list-details" role="cell">
                  <strong
                    className={`rarity-text ${auction.item.artwork.rarity}`}
                  >
                    {auction.item.artwork.rarity}
                  </strong>
                  <span>{getCardType(auction)}</span>
                  <span>
                    Promotion {auction.item.level} ·{" "}
                    {Math.floor(auction.item.condition * 100)}%
                  </span>
                </div>
                <div className="auction-list-seller" role="cell">
                  <strong>{auction.seller_name}</strong>
                  <span>
                    {auction.privateAuction ? "Private lot" : "Public lot"}
                  </span>
                  {auction.currentlyWinning ? <em>Winning</em> : null}
                </div>
                <strong role="cell">
                  ${auction.item.values.actual.toLocaleString()}
                </strong>
                <strong role="cell">
                  ${auction.current_bid.toLocaleString()}
                </strong>
                <strong role="cell">
                  ${auction.minimum_bid.toLocaleString()}
                </strong>
                <span role="cell">
                  {auction.buy_now === null
                    ? "—"
                    : `$${auction.buy_now.toLocaleString()}`}
                </span>
                <strong role="cell">{formatRemaining(auction.expiration)}</strong>
                <AuctionBidButton
                  auction={auction}
                  onSelect={setSelected}
                  playerId={playerId}
                />
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="auction-grid">
          {data.auctions.map((auction) => (
            <article className="auction-lot" key={auction._id}>
              <div className="auction-lot-card">
                <AuctionItemCard
                  auction={auction}
                  legendaryAttributes={legendaryAttributes}
                  playerId={playerId}
                />
              </div>
              <div className="auction-lot-details">
                <div>
                  <span className={auction.privateAuction ? "private" : ""}>
                    {auction.privateAuction ? "PRIVATE LOT" : "PUBLIC LOT"}
                  </span>
                  {auction.currentlyWinning ? <strong>WINNING</strong> : null}
                </div>
                <h2>{auction.item.artwork.title}</h2>
                <p>{auction.item.artwork.artist}</p>
                <p className="auction-lot-seller">
                  Seller <strong>{auction.seller_name}</strong>
                </p>
                <dl>
                  <div>
                    <dt>{auction.has_bid ? "Current bid" : "Starting bid"}</dt>
                    <dd>${auction.current_bid.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Next bid</dt>
                    <dd>${auction.minimum_bid.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Buy now</dt>
                    <dd>
                      {auction.buy_now === null
                        ? "—"
                        : `$${auction.buy_now.toLocaleString()}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Remaining</dt>
                    <dd>{formatRemaining(auction.expiration)}</dd>
                  </div>
                </dl>
                <AuctionBidButton
                  auction={auction}
                  onSelect={setSelected}
                  playerId={playerId}
                />
              </div>
            </article>
          ))}
        </div>
      )}
      <nav aria-label="Auction pages" className="auction-pagination">
        <button
          disabled={page <= 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          type="button"
        >
          <i aria-hidden="true" className="fa fa-caret-left" /> Previous
        </button>
        <span>Page {page} of {pages}</span>
        <button
          disabled={page >= pages}
          onClick={() => setPage((current) => Math.min(pages, current + 1))}
          type="button"
        >
          Next <i aria-hidden="true" className="fa fa-caret-right" />
        </button>
      </nav>
      {selected ? (
        <AuctionBidDialog
          auction={selected}
          bankBalance={bankBalance}
          legendaryAttributes={legendaryAttributes}
          onClose={() => setSelected(null)}
          onSuccess={(nextBalance) => {
            setBankBalance(nextBalance);
            setSelected(null);
            void load();
            router.refresh();
          }}
          playerId={playerId}
        />
      ) : null}
    </main>
  );
}

function AuctionItemCard({
  auction,
  interactive = true,
  legendaryAttributes,
  playerId,
}: {
  auction: AuctionView;
  interactive?: boolean;
  legendaryAttributes: CardLegendaryAttribute[];
  playerId: string;
}) {
  return (
    <ItemCard
      alreadyOwned={auction.owned}
      consigned={auction.seller_id === playerId}
      interactive={interactive}
      item={auction.item}
      legendaryAttributes={legendaryAttributes}
      permissions={{
        canManageItem: false,
        canCustomizeCosmetic: false,
      }}
      researchTarget={auction.questTarget}
      viewerId={playerId}
    />
  );
}

function AuctionBidButton({
  auction,
  onSelect,
  playerId,
}: {
  auction: AuctionView;
  onSelect: (auction: AuctionView) => void;
  playerId: string;
}) {
  return (
    <div className="auction-bid-action" role="cell">
      <button
        disabled={auction.seller_id === playerId}
        onClick={() => onSelect(auction)}
        type="button"
      >
        <i aria-hidden="true" className="fa fa-gavel" />{" "}
        {auction.seller_id === playerId ? "Your listing" : "Bid"}
      </button>
    </div>
  );
}

function getCardType(auction: AuctionView): string {
  const types = [
    auction.item.foil ? "Foil" : "",
    auction.item.seasonal ? "Seasonal" : "",
    auction.item.lottery > 0 ? `Lottery ${auction.item.lottery}` : "",
    auction.item.original ? "Original" : "",
    auction.item.vintage ? "Vintage" : "",
  ].filter(Boolean);
  return types.length > 0 ? types.join(" · ") : "Standard";
}

export function AuctionBidDialog({
  auction,
  bankBalance,
  legendaryAttributes,
  onClose,
  onSuccess,
  playerId,
}: {
  auction: AuctionView;
  bankBalance: number;
  legendaryAttributes: CardLegendaryAttribute[];
  onClose: () => void;
  onSuccess: (bankBalance: number) => void;
  playerId: string;
}) {
  const [amount, setAmount] = useState(auction.minimum_bid.toString());
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const available =
    bankBalance + (auction.currentlyWinning ? auction.current_bid : 0);

  async function submit(buyNow = false) {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/play/auctions/${auction._id}/bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), buyNow }),
      });
      const body = (await response.json()) as {
        error?: string;
        bankBalance?: number;
      };
      if (!response.ok) throw new Error(body.error ?? "The bid failed.");
      onSuccess(body.bankBalance ?? bankBalance);
    } catch (bidError) {
      setError(
        bidError instanceof Error ? bidError.message : "The bid failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <StandardItemDialog
      currentRendererId={resolveCardRendererId({
        itemRendererId: auction.item.card_renderer,
      })}
      headerDetails={
        <form
          className="standard-item-auction-panel"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="standard-item-auction-heading">
            <span>
              {auction.privateAuction ? "Private auction" : "Public auction"}
            </span>
            {auction.currentlyWinning ? (
              <strong>
                <i aria-hidden="true" className="fa fa-trophy" /> Winning
              </strong>
            ) : null}
          </div>
          <dl className="standard-item-auction-facts">
            <div>
              <dt>Seller</dt>
              <dd>{auction.seller_name}</dd>
            </div>
            <div>
              <dt>{auction.has_bid ? "Current" : "Starting"}</dt>
              <dd>${auction.current_bid.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Next bid</dt>
              <dd>${auction.minimum_bid.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Remaining</dt>
              <dd>{formatRemaining(auction.expiration)}</dd>
            </div>
          </dl>
          {auction.seller_id === playerId ? (
            <p>Your listing</p>
          ) : (
            <>
              <p>
                Available ${available.toLocaleString()}
                {auction.currentlyWinning ? " including your current bid" : ""}
              </p>
              <label>
                <span className="sr-only">Bid amount</span>
                <i aria-hidden="true" className="fa fa-usd" />
                <input
                  aria-label="Bid amount"
                  min={auction.minimum_bid}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                  step="1"
                  type="number"
                  value={amount}
                />
              </label>
              {error ? <p className="auction-dialog-error">{error}</p> : null}
              <footer>
                <button
                  disabled={submitting || available < Number(amount)}
                  type="submit"
                >
                  Place bid
                </button>
                {auction.buy_now !== null ? (
                  <button
                    disabled={submitting || available < auction.buy_now}
                    onClick={() => void submit(true)}
                    type="button"
                  >
                    Buy now · ${auction.buy_now.toLocaleString()}
                  </button>
                ) : null}
              </footer>
            </>
          )}
        </form>
      }
      item={auction.item}
      legendaryAttributes={legendaryAttributes}
      onClose={onClose}
      permissions={{
        canManageItem: false,
        canCustomizeCosmetic: false,
      }}
      viewerId={playerId}
    />
  );
}

function formatRemaining(expiration: string): string {
  const milliseconds = Math.max(0, new Date(expiration).getTime() - Date.now());
  const totalMinutes = Math.ceil(milliseconds / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}
