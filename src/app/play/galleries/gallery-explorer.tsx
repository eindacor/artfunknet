"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import ArtworkThumbnail from "@/components/artwork-thumbnail";
import ItemThumbnail from "@/components/item-thumbnail";
import { CommunityReactionPicker } from "@/components/community-emotes";
import ItemCard from "@/components/item-cards/item-card";
import { ratingColor } from "@/components/item-cards/shared";
import PublicGallery from "@/components/public-gallery";
import type { CardLegendaryAttribute } from "@/components/item-cards/types";
import {
  type GalleryVisitorView,
  useGalleryVisitors,
} from "@/components/use-gallery-visitors";
import type {
  GalleryAttributeAggregate,
} from "@/server/gallery-metadata-core";
import {
  type CommunityReactionSummary,
} from "@/server/community-reactions-core";
import type { ArtworkRarity } from "@/server/gameplay";
import type { HydratedGameItem } from "@/server/item-artwork";
import type { AuctionView } from "@/server/auction-gameplay";
import type { NpcRewardInteraction } from "@/server/standard-npc-rewards";

import { AuctionBidDialog } from "../auctions/auction-house";
import GalleryChat from "./gallery-chat";

type GalleryRecord = {
  _id: string;
  schema_version: 3;
  owner_id: string;
  owner: string;
  value: number;
  score: number;
  display_count: number;
  display_capacity: number;
  attributes: GalleryAttributeAggregate[];
  display_rarities: ArtworkRarity[];
  featured_item_id: string | null;
  featured_artwork_id: string | null;
  featured_value: number;
  reactions: CommunityReactionSummary;
  updated_at: string;
};

type GalleryResponse = {
  galleries: GalleryRecord[];
  total: number;
  page: number;
  pageSize: number;
};

type GalleryViewMode = "expanded" | "list";

export type GalleryNpcView = GalleryVisitorView;

const EMPTY_GALLERY_VISITORS: GalleryNpcView[] = [];

type GalleryDetailResponse = {
  owner: {
    playerId: string;
    screenName: string;
    level: number;
    vintageLevel: number;
  };
  items: HydratedGameItem[];
  auctions: AuctionView[];
  metadata: GalleryRecord | null;
  npcs: GalleryNpcView[];
  legendaryAttributes: CardLegendaryAttribute[];
};

export default function GalleryExplorer({
  initialBankBalance,
  initialGalleryId,
  meetingNpc,
  npcSpawnIntervalMinutes,
  npcRewardEffects,
  onMeetNpc,
  viewerId,
}: {
  initialBankBalance: number;
  initialGalleryId: string | null;
  meetingNpc: string | null;
  npcSpawnIntervalMinutes: number;
  npcRewardEffects: Record<
    string,
    NpcRewardInteraction & { animationId: number }
  >;
  onMeetNpc: (npc: GalleryNpcView) => Promise<boolean>;
  viewerId: string;
}) {
  const router = useRouter();
  const [selectedGalleryId, setSelectedGalleryId] = useState<string | null>(
    initialGalleryId,
  );
  const [viewMode, setViewMode] = useState<GalleryViewMode>("expanded");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<GalleryResponse>({
    galleries: [],
    total: 0,
    page: 1,
    pageSize: 12,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({
      view: viewMode,
      page: page.toString(),
    });
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [page, search, viewMode]);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");
      try {
        const response = await fetch(
          `/api/play/galleries?${query}${refresh ? "&refresh=true" : ""}`,
          { cache: "no-store" },
        );
        const body = (await response.json()) as GalleryResponse & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(body.error ?? "Gallery records are unavailable.");
        }
        setData(body);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "The gallery directory could not be loaded.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [query],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  function visitGallery(gallery: GalleryRecord) {
    setSelectedGalleryId(gallery.owner_id);
    router.replace(
      `/play?gallery=${encodeURIComponent(gallery.owner_id)}`,
      { scroll: false },
    );
  }

  function updateGalleryReactions(
    ownerId: string,
    reactions: CommunityReactionSummary,
  ) {
    setData((current) => ({
      ...current,
      galleries: current.galleries.map((gallery) =>
        gallery.owner_id === ownerId
          ? {
              ...gallery,
              reactions,
            }
          : gallery,
      ),
    }));
  }

  if (selectedGalleryId) {
    return (
      <VisitedGallery
        initialBankBalance={initialBankBalance}
        meetingNpc={meetingNpc}
        npcSpawnIntervalMinutes={npcSpawnIntervalMinutes}
        npcRewardEffects={npcRewardEffects}
        onBack={() => {
          setSelectedGalleryId(null);
          router.replace("/play", { scroll: false });
        }}
        onMeetNpc={onMeetNpc}
        ownerId={selectedGalleryId}
        viewerId={viewerId}
      />
    );
  }

  return (
    <main className="gallery-explorer">
      <section className="gallery-explorer-filters">
        <label className="auction-search">
          <span>Find a player</span>
          <input
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            placeholder="player name"
            type="search"
            value={search}
          />
        </label>
      </section>

      {error ? <p className="auction-house-error">{error}</p> : null}
      <div className="auction-results-heading">
        <strong>
          {data.total.toLocaleString()} public{" "}
          {data.total === 1 ? "gallery" : "galleries"}
        </strong>
        <div className="auction-results-actions">
          <div aria-label="Gallery view" className="auction-view-toggle">
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
          <button
            aria-label="Refresh gallery records"
            disabled={refreshing}
            onClick={() => void load(true)}
            type="button"
          >
            <i
              aria-hidden="true"
              className={`fa fa-refresh ${refreshing ? "fa-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="empty-state">Reviewing the gallery registry...</p>
      ) : data.galleries.length === 0 ? (
        <p className="empty-state">
          No public galleries currently have artwork on display.
        </p>
      ) : viewMode === "list" ? (
        <div className="gallery-explorer-list-scroll">
          <div className="gallery-explorer-list" role="table">
            <div className="gallery-explorer-list-header" role="row">
              <span role="columnheader">Rank</span>
              <span role="columnheader">Player</span>
              <span role="columnheader">Gallery value</span>
              <span role="columnheader">Works</span>
              <span role="columnheader">Attributes on display</span>
              <span aria-hidden="true" />
            </div>
            {data.galleries.map((gallery, index) => (
              <article
                aria-label={`Visit ${gallery.owner}'s gallery`}
                className="gallery-explorer-list-row"
                key={gallery._id}
                onClick={() => visitGallery(gallery)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    visitGallery(gallery);
                  }
                }}
                role="row"
                tabIndex={0}
              >
                <strong role="cell">
                  #{(page - 1) * data.pageSize + index + 1}
                </strong>
                <div role="cell">
                  <strong>@{gallery.owner}</strong>
                  <span>Gallery score {gallery.score.toLocaleString()}</span>
                </div>
                <strong role="cell">
                  ${gallery.value.toLocaleString()}
                </strong>
                <span role="cell">{gallery.display_count}</span>
                <div className="gallery-explorer-signature">
                  <GalleryAttributeSummary
                    attributes={gallery.attributes}
                    displayCapacity={gallery.display_capacity}
                  />
                  <GalleryRaritySummary
                    rarities={gallery.display_rarities ?? []}
                  />
                  <CommunityReactionPicker
                    className="gallery-emote-reactions"
                    onChange={(reactions) =>
                      updateGalleryReactions(gallery.owner_id, reactions)
                    }
                    reactions={gallery.reactions}
                    targetId={gallery.owner_id}
                    targetType="gallery"
                  />
                </div>
                <span aria-hidden="true" className="gallery-visit-arrow">
                  <i className="fa fa-chevron-right" />
                </span>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="gallery-explorer-grid">
          {data.galleries.map((gallery, index) => (
            <article
              className="gallery-explorer-card"
              key={gallery._id}
              onClick={() => visitGallery(gallery)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  visitGallery(gallery);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="gallery-explorer-feature">
                {gallery.featured_artwork_id ? (
                  <ArtworkThumbnail
                    alt={`Most valuable work in ${gallery.owner}'s gallery`}
                    artworkId={gallery.featured_artwork_id}
                    size={520}
                  />
                ) : null}
                <span>
                  #{(page - 1) * data.pageSize + index + 1}
                </span>
                <em>Featured value ${gallery.featured_value.toLocaleString()}</em>
              </div>
              <div className="gallery-explorer-card-body">
                <header>
                  <div>
                    <p>Public exhibition</p>
                    <h2>@{gallery.owner}</h2>
                  </div>
                  <i aria-hidden="true" className="fa fa-chevron-right" />
                </header>
                <dl>
                  <div>
                    <dt>Gallery value</dt>
                    <dd>${gallery.value.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Works displayed</dt>
                    <dd>{gallery.display_count}</dd>
                  </div>
                  <div>
                    <dt>Attribute score</dt>
                    <dd>{gallery.score.toLocaleString()}</dd>
                  </div>
                </dl>
                <div className="gallery-explorer-signature">
                  <GalleryAttributeSummary
                    attributes={gallery.attributes}
                    displayCapacity={gallery.display_capacity}
                  />
                  <GalleryRaritySummary
                    rarities={gallery.display_rarities ?? []}
                  />
                  <CommunityReactionPicker
                    className="gallery-emote-reactions"
                    onChange={(reactions) =>
                      updateGalleryReactions(gallery.owner_id, reactions)
                    }
                    reactions={gallery.reactions}
                    targetId={gallery.owner_id}
                    targetType="gallery"
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <nav aria-label="Gallery directory pages" className="auction-pagination">
        <button
          disabled={page <= 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          type="button"
        >
          <i aria-hidden="true" className="fa fa-caret-left" /> Previous
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button
          disabled={page >= pages}
          onClick={() => setPage((current) => Math.min(pages, current + 1))}
          type="button"
        >
          Next <i aria-hidden="true" className="fa fa-caret-right" />
        </button>
      </nav>
    </main>
  );
}

function VisitedGallery({
  initialBankBalance,
  meetingNpc,
  npcSpawnIntervalMinutes,
  npcRewardEffects,
  onBack,
  onMeetNpc,
  ownerId,
  viewerId,
}: {
  initialBankBalance: number;
  meetingNpc: string | null;
  npcSpawnIntervalMinutes: number;
  npcRewardEffects: Record<
    string,
    NpcRewardInteraction & { animationId: number }
  >;
  onBack: () => void;
  onMeetNpc: (npc: GalleryNpcView) => Promise<boolean>;
  ownerId: string;
  viewerId: string;
}) {
  const [gallery, setGallery] = useState<GalleryDetailResponse | null>(null);
  const [selectedPreviewItem, setSelectedPreviewItem] =
    useState<HydratedGameItem | null>(null);
  const [selectedAuction, setSelectedAuction] = useState<AuctionView | null>(
    null,
  );
  const [bankBalance, setBankBalance] = useState(initialBankBalance);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const {
    markVisitorMet,
    replaceVisitors,
    visitors,
  } = useGalleryVisitors({
    enabled: gallery !== null,
    initialVisitors: gallery?.npcs ?? EMPTY_GALLERY_VISITORS,
    ownerId,
    spawnIntervalMinutes: npcSpawnIntervalMinutes,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadGallery() {
      setLoading(true);
      setError("");
      setSelectedPreviewItem(null);
      try {
        const response = await fetch(
          `/api/play/galleries/${encodeURIComponent(ownerId)}`,
          { cache: "no-store" },
        );
        const body = (await response.json()) as GalleryDetailResponse & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(body.error ?? "This gallery is unavailable.");
        }
        if (!cancelled) {
          setGallery(body);
          replaceVisitors(body.npcs);
          const mostValuableItem = body.items.reduce<HydratedGameItem | null>(
            (mostValuable, item) =>
              !mostValuable ||
              item.values.actual > mostValuable.values.actual
                ? item
                : mostValuable,
            null,
          );
          setSelectedPreviewItem(
            mostValuableItem ?? body.auctions[0]?.item ?? null,
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "This gallery could not be loaded.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadGallery();
    return () => {
      cancelled = true;
    };
  }, [ownerId, refreshVersion, replaceVisitors]);

  if (loading) {
    return (
      <section className="visited-gallery">
        <VisitedGalleryBackButton onBack={onBack} />
        <p className="empty-state">Preparing the exhibition...</p>
      </section>
    );
  }

  if (error || !gallery) {
    return (
      <section className="visited-gallery">
        <VisitedGalleryBackButton onBack={onBack} />
        <p className="auction-house-error">
          {error || "This gallery is unavailable."}
        </p>
      </section>
    );
  }
  const selectedPreviewAuction =
    gallery.auctions.find(
      (auction) => auction.item._id === selectedPreviewItem?._id,
    ) ?? null;

  return (
    <section className="visited-gallery">
      <div className="visited-gallery-workspace">
        <section className="visited-gallery-player-panel">
          <header className="visited-gallery-metadata-header">
            <div>
              <p>Collector exhibition</p>
              <h1>{gallery.owner.screenName}&apos;s Gallery</h1>
              <span>
                Meet visitors and inspect the artwork this collector has put on
                display.
              </span>
            </div>
            <VisitedGalleryBackButton onBack={onBack} />
          </header>
          <dl className="visited-gallery-overview-stats">
            <div>
              <dt>Player level</dt>
              <dd>{gallery.owner.level}</dd>
            </div>
            <div>
              <dt>Vintage level</dt>
              <dd>{gallery.owner.vintageLevel}</dd>
            </div>
            <div>
              <dt>Works displayed</dt>
              <dd>{gallery.items.length}</dd>
            </div>
            {gallery.metadata ? (
              <>
                <div>
                  <dt>Gallery value</dt>
                  <dd>${gallery.metadata.value.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Attribute score</dt>
                  <dd>{gallery.metadata.score.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Featured value</dt>
                  <dd>${gallery.metadata.featured_value.toLocaleString()}</dd>
                </div>
              </>
            ) : null}
            <div>
              <dt>Active auctions</dt>
              <dd>{gallery.auctions.length}</dd>
            </div>
          </dl>
          {gallery.metadata ? (
            <div className="visited-gallery-metadata-strip">
              <div>
                <span>Attributes</span>
                <GalleryAttributeSummary
                  attributes={gallery.metadata.attributes}
                  displayCapacity={gallery.metadata.display_capacity}
                />
              </div>
              <div>
                <span>Rarities</span>
                <GalleryRaritySummary
                  rarities={gallery.metadata.display_rarities}
                />
              </div>
              <div className="visited-gallery-reactions">
                <span>Reactions</span>
                <CommunityReactionPicker
                  className="gallery-emote-reactions"
                  onChange={(reactions) =>
                    setGallery((current) =>
                      current?.metadata
                        ? {
                            ...current,
                            metadata: {
                              ...current.metadata,
                              reactions,
                            },
                          }
                        : current,
                    )
                  }
                  reactions={gallery.metadata.reactions}
                  targetId={ownerId}
                  targetType="gallery"
                />
              </div>
            </div>
          ) : null}
          <header className="visited-gallery-auction-heading">
            <span>Items up for auction</span>
          </header>
          {gallery.auctions.length === 0 ? (
            <p className="collection-sidebar-empty">
              This player has no public auctions.
            </p>
          ) : (
            <div className="visited-gallery-auctions">
              {gallery.auctions.map((auction) => (
                <button
                  aria-label={`Preview auction for ${auction.item.artwork.title}`}
                  key={auction._id}
                  onClick={() => setSelectedPreviewItem(auction.item)}
                  type="button"
                >
                  <ItemThumbnail
                    alt=""
                    item={auction.item}
                    researchTarget={auction.questTarget}
                    size={82}
                  />
                  <span className="visited-gallery-auction-copy">
                    <strong>{auction.item.artwork.title}</strong>
                    <small>
                      ${auction.current_bid.toLocaleString()} current bid
                    </small>
                    {auction.buy_now !== null ? (
                      <small>
                        ${auction.buy_now.toLocaleString()} buy now
                      </small>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
        {selectedPreviewItem ? (
          <section className="collection-preview visited-gallery-preview">
            <ItemCard
              item={selectedPreviewItem}
              key={`${selectedPreviewItem._id}:${selectedPreviewItem.status}`}
              legendaryAttributes={gallery.legendaryAttributes}
              owner={gallery.owner}
              permissions={{
                canManageItem: false,
                canCustomizeCosmetic: false,
              }}
              onActivate={
                selectedPreviewAuction && ownerId !== viewerId
                  ? () => setSelectedAuction(selectedPreviewAuction)
                  : undefined
              }
              viewerId={viewerId}
            />
          </section>
        ) : (
          <section className="collection-preview visited-gallery-preview">
            <p className="empty-state">No artwork is available to preview.</p>
          </section>
        )}
        <GalleryChat galleryOwnerId={ownerId} viewerId={viewerId} />
        <PublicGallery
          floorContent={
            <div className="npc-area gallery-npc-overlay">
              {visitors.map((npc) => (
                  <span className="gallery-npc-slot" key={npc._id}>
                    <button
                      className={`gallery-npc ${npc.quality} ${
                        npc.alreadyMet ? "disabled" : "enabled"
                      } ${npcRewardEffects[npc._id] ? "rewarding" : ""}`}
                      disabled={
                        meetingNpc !== null ||
                        npc.alreadyMet ||
                        Boolean(npcRewardEffects[npc._id])
                      }
                      onClick={async () => {
                        if (await onMeetNpc(npc)) {
                          markVisitorMet(npc._id);
                        }
                      }}
                      title={
                        npc.alreadyMet
                          ? `${npc.npc_name} already met`
                          : `meet ${npc.npc_name}`
                      }
                      type="button"
                    >
                      <i aria-hidden="true" className={`fa ${npc.icon}`} />
                      <span>{npc.npc_name}</span>
                    </button>
                    {npcRewardEffects[npc._id] ? (
                      <span
                        aria-label={
                          npcRewardEffects[npc._id].rewardType === "money"
                            ? `Received $${npcRewardEffects[
                                npc._id
                              ].rewardAmount.toLocaleString()}`
                            : `Received ${npcRewardEffects[
                                npc._id
                              ].rewardAmount.toLocaleString()} experience points`
                        }
                        className={`npc-reward-popout ${
                          npcRewardEffects[npc._id].rewardType
                        }`}
                        key={npcRewardEffects[npc._id].animationId}
                        role="status"
                      >
                        <i
                          aria-hidden="true"
                          className={`fa ${
                            npcRewardEffects[npc._id].rewardType === "money"
                              ? "fa-usd"
                              : "fa-heart"
                          }`}
                        />
                      </span>
                    ) : null}
                  </span>
                ))}
            </div>
          }
          items={gallery.items}
          legendaryAttributes={gallery.legendaryAttributes}
          onSelectItem={setSelectedPreviewItem}
          owner={gallery.owner}
          viewerId={viewerId}
        />
      </div>
      {selectedAuction ? (
        <AuctionBidDialog
          auction={selectedAuction}
          bankBalance={bankBalance}
          legendaryAttributes={gallery.legendaryAttributes}
          onClose={() => setSelectedAuction(null)}
          onSuccess={(nextBankBalance) => {
            setBankBalance(nextBankBalance);
            setSelectedAuction(null);
            setRefreshVersion((current) => current + 1);
          }}
          playerId={viewerId}
        />
      ) : null}
    </section>
  );
}

function VisitedGalleryBackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      className="visited-gallery-back"
      onClick={onBack}
      type="button"
    >
      <i aria-hidden="true" className="fa fa-arrow-left" /> Back to public
      galleries
    </button>
  );
}

export function GalleryAttributeSummary({
  attributes,
  displayCapacity,
}: {
  attributes: GalleryAttributeAggregate[];
  displayCapacity: number;
}) {
  return (
    <div
      aria-label="Gallery attributes"
      className="gallery-attribute-summary"
      role="cell"
    >
      {attributes.length > 0 ? (
        attributes.map((attribute) => {
          const effectiveRating = Math.min(
            1,
            Math.max(0, attribute.effectiveRating),
          );
          const label = `${attribute.title}: ${attribute.count} ${
            attribute.count === 1 ? "work" : "works"
          }, ${Math.round(effectiveRating * 100)}% effective attraction (${
            Math.round(attribute.totalRating * 100)
          } total ÷ ${displayCapacity} display slots)`;
          return (
            <i
              aria-label={label}
              className={`fa ${attribute.icon || "fa-tag"}`}
              key={attribute.id}
              role="img"
              style={{ color: ratingColor(effectiveRating) }}
              title={label}
            />
          );
        })
      ) : (
        <i
          aria-label="No attributes"
          className="fa fa-times"
          role="img"
          title="No attributes"
        />
      )}
    </div>
  );
}

export function GalleryRaritySummary({
  rarities,
}: {
  rarities: ArtworkRarity[];
}) {
  return (
    <div aria-label="Displayed artwork rarities" className="gallery-rarity-summary">
      {rarities.map((rarity, index) => (
        <span
          aria-label={`${rarity} artwork`}
          className="gallery-rarity-square"
          data-rarity={rarity}
          key={`${rarity}-${index}`}
          role="img"
          title={rarity}
        />
      ))}
    </div>
  );
}
