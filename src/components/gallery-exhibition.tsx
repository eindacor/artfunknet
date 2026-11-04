"use client";

import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { ArtistGalleryIntroduction, ArtistGalleryShowcase } from "@/components/artist-gallery";
import { CommunityReactionPicker } from "@/components/community-emotes";
import FeaturedWorkContent from "@/components/featured-work-content";
import FeaturedWorksPanel from "@/components/featured-works-panel";
import GalleryRaritySummary from "@/components/gallery-rarity-summary";
import GalleryShareButton from "@/components/gallery-share-button";
import ItemCard from "@/components/item-cards/item-card";
import { getActiveLegendaryAttribute, ratingColor } from "@/components/item-cards/shared";
import ItemThumbnail from "@/components/item-thumbnail";
import PublicGallery from "@/components/public-gallery";
import type { AuctionView } from "@/server/auction-gameplay";
import type { CommunityReactionSummary } from "@/server/community-reactions-core";
import type { GalleryExhibitionData } from "@/server/gallery-exhibition";
import type { GalleryAttributeAggregate } from "@/server/gallery-metadata-core";
import type { HydratedGameItem } from "@/server/item-artwork";

type GalleryNavigation = Pick<ComponentProps<typeof PublicGallery>,
  "navigationDisabled" | "navigationError" | "onExitGallery" | "onGoHome" | "onNextGallery" | "onPreviousGallery">;

export function getGalleryPreviewItem(gallery: GalleryExhibitionData, initialItemId?: string | null) {
  const requestedItem = gallery.items.find(item => item._id === initialItemId);
  const firstArtistArtworkId = gallery.artist?.featured ? gallery.artistWorks[0]?._id : undefined;
  const artistPreview = firstArtistArtworkId
    ? gallery.items.find(item => item.artwork_id === firstArtistArtworkId)
    : undefined;
  const mostValuableItem = gallery.items.reduce<HydratedGameItem | null>(
    (best, item) => !best || item.values.actual > best.values.actual ? item : best, null,
  );
  return requestedItem ?? artistPreview ?? mostValuableItem ?? gallery.auctions[0]?.item ?? null;
}

export default function GalleryExhibition({
  gallery, viewerId, selectedItem, onSelectItem, onSelectAuction, onReactionsChange,
  sidebar, chatContent, visitorContent, navigation, visitorTypes = [],
}: {
  gallery: GalleryExhibitionData;
  viewerId: string | null;
  selectedItem: HydratedGameItem | null;
  onSelectItem: (item: HydratedGameItem) => void;
  onSelectAuction?: (auction: AuctionView) => void;
  onReactionsChange?: (reactions: CommunityReactionSummary) => void;
  sidebar?: ReactNode;
  chatContent?: ReactNode;
  visitorContent?: ReactNode;
  navigation?: GalleryNavigation;
  visitorTypes?: readonly { id: string; name: string; icon: string }[];
}) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const workspace = workspaceRef.current;
    const galleryWindow = workspace?.querySelector<HTMLElement>(".public-gallery-window");
    if (!workspace || !galleryWindow) return;
    const updateHeight = () => {
      workspace.style.setProperty("--gallery-window-height", `${galleryWindow.getBoundingClientRect().height}px`);
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(galleryWindow);
    return () => observer.disconnect();
  }, [gallery.galleryId]);
  const selectedAuction = gallery.auctions.find(auction => auction.item._id === selectedItem?._id);
  const galleryTitle = `${gallery.artist?.name ?? gallery.owner.screenName}'s Gallery`;

  return <>
    {gallery.artist ? <ArtistGalleryIntroduction artist={gallery.artist} /> : null}
    {!viewerId ? <div className="gallery-title">
      <h1>{galleryTitle}</h1>
      <GalleryShareButton key={gallery.owner.playerId} playerId={gallery.owner.playerId} />
    </div> : null}
    <div className="visited-gallery-workspace" ref={workspaceRef}>
      {viewerId ? <section className="visited-gallery-player-panel">
        <FeaturedWorksPanel
          actions={gallery.metadata?.reactions && onReactionsChange ? (
            <CommunityReactionPicker className="gallery-emote-reactions" onChange={onReactionsChange}
              reactions={gallery.metadata.reactions} targetId={gallery.owner.playerId} targetType="gallery" />
          ) : null}
          attributeScore={gallery.metadata?.score ?? 0}
          attributes={gallery.metadata?.attributes ?? []}
          className="visited-gallery-featured-panel"
          displayCapacity={gallery.metadata?.display_capacity ?? 0}
          galleryOwnerId={gallery.owner.playerId}
          items={gallery.items.filter(item => item.status === "displayed" && item.owner !== "preview")}
          maxDisplayCapacity={gallery.metadata?.display_capacity ?? 0}
          rates={gallery.rates ?? { value: 0, moneyPerHour: 0, xpPerHour: 0 }}
          rarities={gallery.metadata?.display_rarities ?? []}
          readOnly
          renderItem={item => {
            const effect = getActiveLegendaryAttribute(item, gallery.legendaryAttributes);
            return <article className="home-featured-card" data-rarity={item.artwork.rarity}
              data-selected={selectedItem?._id === item._id || undefined} key={item._id}>
              <button aria-describedby={effect ? `featured-effect-${item._id}` : undefined}
                aria-label={`Preview ${item.artwork.title} by ${item.artwork.artist}`}
                aria-pressed={selectedItem?._id === item._id} className="home-featured-select"
                onClick={() => {
                  onSelectItem(item);
                  workspaceRef.current?.querySelector(".public-gallery-window")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }} type="button">
                <FeaturedWorkContent item={item} legendaryEffect={effect} />
              </button>
            </article>;
          }}
          title={galleryTitle}
          visitorTypes={visitorTypes}
        />
        {sidebar ? <details className="visited-gallery-finish-controls">
          <summary>Gallery finishes</summary>
          {sidebar}
        </details> : null}
        <section aria-label="Gallery auctions">
          <header className="visited-gallery-auction-heading"><span>Items up for auction</span></header>
          {gallery.auctions.length === 0 ? <p className="collection-sidebar-empty">This player has no public auctions.</p>
            : <div className="visited-gallery-auctions">{gallery.auctions.map(auction => (
              <button aria-label={`Preview auction for ${auction.item.artwork.title}`} key={auction._id}
                onClick={() => onSelectItem(auction.item)} type="button">
                <ItemThumbnail alt="" item={auction.item} researchTarget={auction.questTarget && !auction.owned} size={82} />
                <span className="visited-gallery-auction-copy">
                  <strong>{auction.item.artwork.title}</strong>
                  <small>${auction.current_bid.toLocaleString()} current bid</small>
                  {auction.buy_now !== null ? <small>${auction.buy_now.toLocaleString()} buy now</small> : null}
                </span>
              </button>
            ))}</div>}
        </section>
      </section> : null}
      <section className="collection-preview visited-gallery-preview">
        {selectedItem ? <ItemCard item={selectedItem} key={`${selectedItem._id}:${selectedItem.status}`}
          legendaryAttributes={gallery.legendaryAttributes} owner={gallery.owner}
          permissions={{ canManageItem: false, canCustomizeCosmetic: false }}
          onActivate={selectedAuction && onSelectAuction && gallery.owner.playerId !== viewerId
            ? () => onSelectAuction(selectedAuction) : undefined}
          viewerId={viewerId} />
          : <p className="empty-state">No artwork is available to preview.</p>}
      </section>
      {gallery.artist ? <ArtistGalleryShowcase artist={gallery.artist} works={gallery.artistWorks}
        legendaryAttributes={gallery.legendaryAttributes} onPreview={item => {
          onSelectItem(gallery.items.find(displayed => displayed.artwork_id === item.artwork_id) ?? item);
          workspaceRef.current?.querySelector(".public-gallery-window")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }} viewerId={viewerId} /> : null}
      {chatContent}
      <PublicGallery {...navigation} finishes={gallery.finishes} focusedItemId={selectedItem?._id}
        visitorContent={visitorContent} items={gallery.items} legendaryAttributes={gallery.legendaryAttributes}
        onSelectItem={onSelectItem} owner={gallery.owner} viewerId={viewerId} />
    </div>
  </>;
}

export function GalleryAttributeSummary({ attributes, displayCapacity }: {
  attributes: GalleryAttributeAggregate[]; displayCapacity: number;
}) {
  return <div aria-label="Gallery attributes" className="gallery-attribute-summary" role="cell">
    {attributes.length > 0 ? attributes.map(attribute => {
      const effectiveRating = Math.min(1, Math.max(0, attribute.effectiveRating));
      const label = `${attribute.title}: ${attribute.count} ${attribute.count === 1 ? "work" : "works"}, ${Math.round(effectiveRating * 100)}% effective attraction (${Math.round(attribute.totalRating * 100)} total ÷ ${displayCapacity} display slots)`;
      return <i aria-label={label} className={`fa ${attribute.icon || "fa-tag"}`} key={attribute.id}
        role="img" style={{ color: ratingColor(effectiveRating) }} title={label} />;
    }) : <i aria-label="No attributes" className="fa fa-times" role="img" title="No attributes" />}
  </div>;
}

export { GalleryRaritySummary };
