"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import ItemFilterControls, {
  type ItemFilterSortOption,
} from "@/components/item-filter-controls";
import ItemThumbnail from "@/components/item-thumbnail";
import OfferThumbnail from "@/components/offer-thumbnail";
import AuctionBidPanel, {
  formatAuctionRemaining,
  hasPlacedAuctionBid,
} from "@/components/item-cards/auction-bid-panel";
import ItemCard from "@/components/item-cards/item-card";
import { resolveCardRendererId } from "@/components/item-cards/selection";
import StandardItemDialog from "@/components/item-cards/standard-item-dialog";
import type {
  AuctionFilterOptions,
  AuctionView,
} from "@/server/auction-gameplay";
import { getAuctionBidRestriction } from "@/server/auction-bid-permissions";
import {
  getDefaultCollectionFilters,
  type CollectionAttributeOption,
  type CollectionFilters,
  type CollectionFlagKey,
} from "@/server/collection-inventory";
import type { CardLegendaryAttribute } from "@/components/item-cards/types";
import { getOfferRevealTier } from "@/server/offer-reveal";
import {
  AUCTION_PROPERTY_KEYS,
  DEFAULT_AUCTION_FILTER_SETTINGS,
  type AuctionFilterSettings,
  type AuctionSort,
  type AuctionSortDirection,
  type AuctionViewMode,
  type PlayerViewSettings,
} from "@/server/player-view-settings";

type AuctionResponse = {
  auctions: AuctionView[];
  filterOptions: AuctionFilterOptions;
  total: number;
};

const EMPTY_FILTER_OPTIONS: AuctionFilterOptions = {
  artStyleIds: [],
  attributes: [],
  specialAttributes: [],
};
const AUCTION_FILTER_PROPERTIES =
  AUCTION_PROPERTY_KEYS as readonly CollectionFlagKey[];
const MARKET_EXPERT_SORTS: readonly AuctionSort[] = [
  "condition",
  "rolls",
  "level",
];

function getAuctionCollectionFilters(
  settings: AuctionFilterSettings,
): CollectionFilters {
  const filters = getDefaultCollectionFilters();
  return {
    ...filters,
    search: settings.search,
    artStyle: settings.artStyle,
    rarities: [...settings.rarities],
    flags: {
      ...filters.flags,
      ...settings.properties,
    },
    attributeIds: [...settings.attributeIds],
    attributeMinimum: settings.attributeMinimum,
    specialAttributeIds: [...settings.specialAttributeIds],
    specialAttributeMinimum: settings.specialAttributeMinimum,
  };
}

function getAuctionSortOptions(
  marketExpert: boolean,
): readonly ItemFilterSortOption[] {
  return [
    { value: "remaining:asc", label: "Ending soonest" },
    { value: "remaining:desc", label: "Ending latest" },
    { value: "price:desc", label: "Current bid: high to low" },
    { value: "price:asc", label: "Current bid: low to high" },
    { value: "dropChance:desc", label: "Drop chance: most likely first" },
    { value: "dropChance:asc", label: "Drop chance: least likely first" },
    { value: "title:asc", label: "Title: A to Z" },
    { value: "title:desc", label: "Title: Z to A" },
    { value: "date:desc", label: "Artwork date: newest first" },
    { value: "date:asc", label: "Artwork date: oldest first" },
    { value: "artist:asc", label: "Artist: A to Z" },
    { value: "artist:desc", label: "Artist: Z to A" },
    { value: "rarity:desc", label: "Rarity: highest first" },
    { value: "rarity:asc", label: "Rarity: lowest first" },
    { value: "seller:asc", label: "Seller: A to Z" },
    { value: "seller:desc", label: "Seller: Z to A" },
    { value: "medium:asc", label: "Medium: A to Z" },
    { value: "medium:desc", label: "Medium: Z to A" },
    ...(marketExpert
      ? [
          { value: "condition:desc", label: "Condition: highest first" },
          { value: "condition:asc", label: "Condition: lowest first" },
          { value: "rolls:desc", label: "Roll count: highest first" },
          { value: "rolls:asc", label: "Roll count: lowest first" },
          { value: "level:desc", label: "Promotion level: highest first" },
          { value: "level:asc", label: "Promotion level: lowest first" },
        ]
      : []),
  ];
}

export default function AuctionHouse({
  artStyleOptions = [],
  canMakePrivateAuctionsPublic = false,
  initialAuctionFilters = DEFAULT_AUCTION_FILTER_SETTINGS,
  initialAuctionId,
  initialBankBalance,
  initialMarketExpert = false,
  initialViewMode = "list",
  legendaryAttributes,
  marketExpertExpiration,
  onViewSettingsChange = () => undefined,
  playerId,
}: {
  artStyleOptions?: CollectionAttributeOption[];
  canMakePrivateAuctionsPublic?: boolean;
  initialAuctionFilters?: AuctionFilterSettings;
  initialAuctionId: string | null;
  initialBankBalance: number;
  initialMarketExpert?: boolean;
  initialViewMode?: AuctionViewMode;
  legendaryAttributes: CardLegendaryAttribute[];
  marketExpertExpiration: string | null;
  onViewSettingsChange?: (settings: Partial<PlayerViewSettings>) => void;
  playerId: string;
}) {
  const router = useRouter();
  const [linkedAuctionId, setLinkedAuctionId] = useState(initialAuctionId);
  const [bankBalance, setBankBalance] = useState(initialBankBalance);
  const [filters, setFilters] = useState<CollectionFilters>(() =>
    getAuctionCollectionFilters(initialAuctionFilters),
  );
  const [sort, setSort] = useState<AuctionSort>(
    !initialMarketExpert &&
      MARKET_EXPERT_SORTS.includes(initialAuctionFilters.sort)
      ? "remaining"
      : initialAuctionFilters.sort,
  );
  const [order, setOrder] = useState<AuctionSortDirection>(
    !initialMarketExpert &&
      MARKET_EXPERT_SORTS.includes(initialAuctionFilters.sort)
      ? "asc"
      : initialAuctionFilters.order,
  );
  const [exclusivity, setExclusivity] = useState(
    initialAuctionFilters.exclusivity,
  );
  const [quest, setQuest] = useState(
    !initialMarketExpert && initialAuctionFilters.quest === "sought"
      ? "all"
      : initialAuctionFilters.quest,
  );
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuctionResponse>({
    auctions: [],
    filterOptions: EMPTY_FILTER_OPTIONS,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AuctionView | null>(null);
  const [marketExpert, setMarketExpert] = useState(initialMarketExpert);
  const [viewMode, setViewMode] =
    useState<AuctionViewMode>(initialViewMode);
  const pageSize = viewMode === "expanded" ? 20 : 30;
  const auctionSortOptions = useMemo(
    () => getAuctionSortOptions(marketExpert),
    [marketExpert],
  );
  const availableArtStyleOptions = useMemo(() => {
    const available = new Set(data.filterOptions.artStyleIds);
    return artStyleOptions.filter((option) => available.has(option.id));
  }, [artStyleOptions, data.filterOptions.artStyleIds]);
  const persistAuctionFilters = useCallback(
    (
      nextFilters: CollectionFilters,
      overrides: Partial<
        Pick<
          AuctionFilterSettings,
          "sort" | "order" | "exclusivity" | "quest"
        >
      > = {},
    ) => {
      onViewSettingsChange({
        auctionFilters: {
          search: nextFilters.search,
          sort: overrides.sort ?? sort,
          order: overrides.order ?? order,
          exclusivity: overrides.exclusivity ?? exclusivity,
          quest: overrides.quest ?? quest,
          rarities: nextFilters.rarities,
          artStyle: nextFilters.artStyle,
          properties: Object.fromEntries(
            AUCTION_PROPERTY_KEYS.map((key) => [
              key,
              nextFilters.flags[key],
            ]),
          ) as AuctionFilterSettings["properties"],
          attributeIds: nextFilters.attributeIds,
          attributeMinimum: nextFilters.attributeMinimum,
          specialAttributeIds: nextFilters.specialAttributeIds,
          specialAttributeMinimum: nextFilters.specialAttributeMinimum,
        },
      });
    },
    [exclusivity, onViewSettingsChange, order, quest, sort],
  );

  const query = useMemo(() => {
    const params = new URLSearchParams({
      search: filters.search,
      sort,
      order,
      exclusivity,
      quest,
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    if (linkedAuctionId) params.set("auction", linkedAuctionId);
    filters.rarities.forEach((rarity) => params.append("rarity", rarity));
    if (filters.artStyle) params.set("artStyle", filters.artStyle);
    for (const key of AUCTION_PROPERTY_KEYS) {
      const mode = filters.flags[key];
      if (mode !== "any") params.set(`property-${key}`, mode);
    }
    filters.attributeIds.forEach((id) => params.append("attribute", id));
    params.set("attributeMinimum", filters.attributeMinimum.toString());
    filters.specialAttributeIds.forEach((id) =>
      params.append("specialAttribute", id),
    );
    params.set(
      "specialAttributeMinimum",
      filters.specialAttributeMinimum.toString(),
    );
    return params.toString();
  }, [
    exclusivity,
    filters,
    order,
    page,
    pageSize,
    quest,
    sort,
    linkedAuctionId,
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
      setData({
        ...body,
        filterOptions: body.filterOptions ?? EMPTY_FILTER_OPTIONS,
      });
      if (linkedAuctionId) {
        setSelected(
          body.auctions.find((auction) => auction._id === linkedAuctionId) ??
            null,
        );
        setLinkedAuctionId(null);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "The auction house could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [linkedAuctionId, query]);

  useEffect(() => {
    const expiration = new Date(marketExpertExpiration ?? 0).getTime();
    const timeout = window.setTimeout(
      () => setMarketExpert(expiration > Date.now()),
      0,
    );
    const accessTimeout = expiration > Date.now()
      ? window.setTimeout(() => {
          setMarketExpert(false);
          const resetSort = MARKET_EXPERT_SORTS.includes(sort);
          const nextSort = resetSort ? "remaining" : sort;
          const nextOrder = resetSort ? "asc" : order;
          const nextQuest = quest === "sought" ? "all" : quest;
          if (resetSort) {
            setSort(nextSort);
            setOrder(nextOrder);
          }
          if (quest === "sought") setQuest(nextQuest);
          if (resetSort || quest === "sought") {
            setPage(1);
            persistAuctionFilters(filters, {
              sort: nextSort,
              order: nextOrder,
              quest: nextQuest,
            });
          }
          void load();
        }, expiration - Date.now() + 50)
      : undefined;
    return () => {
      window.clearTimeout(timeout);
      if (accessTimeout !== undefined) window.clearTimeout(accessTimeout);
    };
  }, [
    filters,
    load,
    marketExpertExpiration,
    order,
    persistAuctionFilters,
    quest,
    sort,
  ]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timeout);
  }, [load]);

  function updateFilters(next: CollectionFilters) {
    setPage(1);
    setFilters(next);
    persistAuctionFilters(next);
  }

  function updateSort(value: string) {
    const [nextSort, nextOrder] = value.split(":") as [
      AuctionSort,
      AuctionSortDirection,
    ];
    setPage(1);
    setSort(nextSort);
    setOrder(nextOrder);
    persistAuctionFilters(filters, {
      sort: nextSort,
      order: nextOrder,
    });
  }

  function clearFilters() {
    const next = getAuctionCollectionFilters(DEFAULT_AUCTION_FILTER_SETTINGS);
    setPage(1);
    setFilters(next);
    setSort(DEFAULT_AUCTION_FILTER_SETTINGS.sort);
    setOrder(DEFAULT_AUCTION_FILTER_SETTINGS.order);
    setExclusivity(DEFAULT_AUCTION_FILTER_SETTINGS.exclusivity);
    setQuest(DEFAULT_AUCTION_FILTER_SETTINGS.quest);
    onViewSettingsChange({
      auctionFilters: DEFAULT_AUCTION_FILTER_SETTINGS,
    });
  }

  const pages = Math.max(1, Math.ceil(data.total / pageSize));

  return (
    <main className="auction-house">
      <ItemFilterControls
        additionalFilters={
          <div className="auction-context-filters">
            <label>
              <span>Access</span>
              <select
                onChange={(event) => {
                  const next = event.target.value as AuctionFilterSettings["exclusivity"];
                  setPage(1);
                  setExclusivity(next);
                  persistAuctionFilters(filters, { exclusivity: next });
                }}
                value={exclusivity}
              >
                <option value="all">All auctions</option>
                <option value="public">Public only</option>
                <option value="private">Private only</option>
              </select>
            </label>
            <label>
              <span>Research</span>
              <select
                onChange={(event) => {
                  const next = event.target.value as AuctionFilterSettings["quest"];
                  setPage(1);
                  setQuest(next);
                  persistAuctionFilters(filters, { quest: next });
                }}
                value={quest}
              >
                <option value="all">All artwork</option>
                <option value="quest">Quest targets</option>
                {marketExpert ? (
                  <option value="sought">Sought by others</option>
                ) : null}
              </select>
            </label>
          </div>
        }
        artStyleOptions={availableArtStyleOptions}
        attributeOptions={data.filterOptions.attributes}
        className="auction-filter-controls"
        contextFiltersActive={exclusivity !== "all" || quest !== "all"}
        filters={filters}
        matchCount={data.total}
        onClearFilters={clearFilters}
        onFiltersChange={updateFilters}
        onSortChange={updateSort}
        searchHint="Searches artwork title, artist, or seller."
        searchLabel="Search auctions"
        searchPlaceholder="Title, artist, or seller"
        sort={`${sort}:${order}`}
        sortOptions={auctionSortOptions}
        specialAttributeOptions={data.filterOptions.specialAttributes}
        visibility={{
          properties: AUCTION_FILTER_PROPERTIES,
          status: false,
          tag: false,
        }}
      />

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
                onViewSettingsChange({ auctionView: "expanded" });
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
                onViewSettingsChange({ auctionView: "list" });
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
                    <OfferThumbnail
                      aria-label={`Preview ${auction.item.artwork.title} by ${auction.item.artwork.artist}`}
                      className="auction-list-thumbnail"
                      data-rarity={auction.item.artwork.rarity}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelected(auction);
                      }}
                      tier={getOfferRevealTier(auction.item)}
                      title={`${auction.item.artwork.title} by ${auction.item.artwork.artist}`}
                      type="button"
                      unrevealed={false}
                    >
                      <ItemThumbnail
                        alt=""
                        item={auction.item}
                        researchTarget={auction.questTarget && !auction.owned}
                        size={82}
                      />
                    </OfferThumbnail>
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
                <span
                  className="auction-list-current-bid"
                  data-has-bid={hasPlacedAuctionBid(auction) || undefined}
                  role="cell"
                >
                  {hasPlacedAuctionBid(auction)
                    ? `$${auction.current_bid.toLocaleString()}`
                    : "-"}
                </span>
                <span role="cell">
                  {auction.buy_now === null
                    ? "—"
                    : `$${auction.buy_now.toLocaleString()}`}
                </span>
                <strong role="cell">
                  {formatAuctionRemaining(auction.expiration)}
                </strong>
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
                    <dt>
                      {hasPlacedAuctionBid(auction)
                        ? "Current bid"
                        : "Starting bid"}
                    </dt>
                    <dd>
                      {hasPlacedAuctionBid(auction) ? (
                        <strong className="auction-current-bid">
                          ${auction.current_bid.toLocaleString()}
                        </strong>
                      ) : (
                        `$${auction.current_bid.toLocaleString()}`
                      )}
                    </dd>
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
                    <dd>{formatAuctionRemaining(auction.expiration)}</dd>
                  </div>
                </dl>
                <AuctionBidButton
                  auction={auction}
                  onSelect={setSelected}
                  playerId={playerId}
                />
              </div>
              <div className="auction-lot-card">
                <AuctionItemCard
                  auction={auction}
                  legendaryAttributes={legendaryAttributes}
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
          canMakePublic={canMakePrivateAuctionsPublic}
          legendaryAttributes={legendaryAttributes}
          onClose={() => setSelected(null)}
          onMadePublic={() => {
            setSelected(null);
            void load();
            router.refresh();
          }}
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
  onSelect,
  playerId,
}: {
  auction: AuctionView;
  interactive?: boolean;
  legendaryAttributes: CardLegendaryAttribute[];
  onSelect: (auction: AuctionView) => void;
  playerId: string;
}) {
  return (
    <ItemCard
      alreadyOwned={auction.owned}
      consigned={auction.seller_id === playerId}
      interactive={interactive}
      item={auction.item}
      legendaryAttributes={legendaryAttributes}
      onActivate={() => onSelect(auction)}
      overlay={
        auction.currentlyWinning ? <WinningAuctionWatermark /> : undefined
      }
      owner={
        auction.seller_id
          ? {
              playerId: auction.seller_id,
              screenName: auction.seller_name,
            }
          : undefined
      }
      permissions={{
        canManageItem: false,
        canCustomizeCosmetic: false,
      }}
      researchTarget={auction.questTarget && !auction.owned}
      viewerId={playerId}
    />
  );
}

export function WinningAuctionWatermark() {
  return (
    <span className="winning-auction-watermark">
      <i aria-hidden="true" className="fa fa-trophy" />
      Winning
    </span>
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
  const restriction = getAuctionBidRestriction(auction, playerId);
  return (
    <div className="auction-bid-action" role="cell">
      <button
        disabled={restriction !== null}
        onClick={() => onSelect(auction)}
        type="button"
      >
        <i aria-hidden="true" className="fa fa-gavel" />{" "}
        {auction.seller_id === playerId
          ? "Your listing"
          : restriction
            ? "Commission listing"
            : "Bid"}
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
  canMakePublic = false,
  legendaryAttributes,
  onClose,
  onMadePublic,
  onSuccess,
  playerId,
}: {
  auction: AuctionView;
  bankBalance: number;
  canMakePublic?: boolean;
  legendaryAttributes: CardLegendaryAttribute[];
  onClose: () => void;
  onMadePublic?: (auctionId: string, message: string) => void;
  onSuccess: (bankBalance: number) => void;
  playerId: string;
}) {
  return (
    <StandardItemDialog
      currentRendererId={resolveCardRendererId({
        itemRendererId: auction.item.card_renderer,
      })}
      owner={
        auction.seller_id
          ? {
              playerId: auction.seller_id,
              screenName: auction.seller_name,
            }
          : undefined
      }
      actionPanel={
        <AuctionBidPanel
          auction={auction}
          bankBalance={bankBalance}
          canMakePublic={canMakePublic}
          onClose={onClose}
          onMadePublic={onMadePublic}
          onSuccess={onSuccess}
          playerId={playerId}
        />
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
