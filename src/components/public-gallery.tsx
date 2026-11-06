"use client";

import { useState } from "react";

import GalleryView from "./gallery-view";
import { resolveCardRendererId } from "./item-cards/selection";
import StandardItemDialog from "./item-cards/standard-item-dialog";
import type {
  CardLegendaryAttribute,
  ItemDisplayOwner,
} from "./item-cards/types";
import type { HydratedGameItem } from "@/server/item-artwork";
import type { GalleryFinishes } from "@/server/gallery-finishes";
import type { GallerySceneVisitor } from "./gallery-visitors";

export default function PublicGallery({
  visitorContent,
  focusedItemId,
  finishes,
  overviewDistanceCm,
  visitorScale,
  cameraHeightCm,
  artworkCenterHeightCm,
  items,
  legendaryAttributes,
  navigationDisabled = false,
  navigationError,
  onExitGallery,
  onGoHome,
  onNextGallery,
  onPreviousGallery,
  onSelectItem,
  owner,
  viewerId,
  visitors,
  onMeetVisitor,
  visitorsVisible,
  onVisitorsVisibleChange,
}: {
  visitorContent?: React.ReactNode;
  focusedItemId?: string;
  finishes?: GalleryFinishes;
  overviewDistanceCm?: number;
  visitorScale?: number;
  cameraHeightCm?: number;
  artworkCenterHeightCm?: number;
  items: HydratedGameItem[];
  legendaryAttributes: CardLegendaryAttribute[];
  navigationDisabled?: boolean;
  navigationError?: string;
  onExitGallery?: () => void;
  onGoHome?: () => void;
  onNextGallery?: () => void;
  onPreviousGallery?: () => void;
  onSelectItem?: (item: HydratedGameItem) => void;
  owner: ItemDisplayOwner;
  viewerId: string | null;
  visitors?: readonly GallerySceneVisitor[];
  onMeetVisitor?: (id: string) => void;
  visitorsVisible?: boolean;
  onVisitorsVisibleChange?: (visible: boolean) => void;
}) {
  const [selectedItem, setSelectedItem] = useState<HydratedGameItem | null>(
    null,
  );
  const navigation = (visitorToggle: React.ReactNode) => (
      <nav
        aria-label={onPreviousGallery || onNextGallery || onExitGallery || onGoHome
          ? "Gallery navigation" : "Gallery display controls"}
        className="gallery-navigation-overlay"
        onKeyDown={(event) => event.stopPropagation()}
      >
        {onPreviousGallery || onNextGallery ? (
          <>
            <button
              aria-label="Previous gallery"
              className="gallery-navigation-control previous"
              disabled={navigationDisabled || !onPreviousGallery}
              onClick={onPreviousGallery}
              title="Previous gallery"
              type="button"
            >
              <i aria-hidden="true" className="fa fa-chevron-left" />
              <i aria-hidden="true" className="fa fa-solid fa-door-open" />
            </button>
            <button
              aria-label="Next gallery"
              className="gallery-navigation-control next"
              disabled={navigationDisabled || !onNextGallery}
              onClick={onNextGallery}
              title="Next gallery"
              type="button"
            >
              <i aria-hidden="true" className="fa fa-solid fa-door-open" />
              <i aria-hidden="true" className="fa fa-chevron-right" />
            </button>
          </>
        ) : null}
          <div className="gallery-navigation-actions">
            {onExitGallery ? (
              <button
                aria-label="Exit gallery"
                className="gallery-navigation-control exit"
                disabled={navigationDisabled}
                onClick={onExitGallery}
                title="Back to public galleries"
                type="button"
              >
                <i aria-hidden="true" className="fa fa-solid fa-door-open" />
                <span>Exit gallery</span>
              </button>
            ) : null}
            {visitorToggle}
            {onGoHome ? (
              <button
                aria-label="Return home"
                className="gallery-navigation-control home"
                disabled={navigationDisabled}
                onClick={onGoHome}
                title="Return home"
                type="button"
              >
                <i aria-hidden="true" className="fa fa-home" />
                <span>Home</span>
              </button>
            ) : null}
          </div>
        {navigationError ? (
          <p className="gallery-navigation-error" role="alert">
            {navigationError}
          </p>
        ) : null}
      </nav>
    );
  return (
    <>
      <div className="gallery-window public-gallery-window">
        <GalleryView
          disabled={navigationDisabled}
          emptyMessage={`@${owner.screenName} has not shared any artwork in this gallery.`}
          focusedItemId={focusedItemId}
          finishes={finishes}
          overviewDistanceCm={overviewDistanceCm}
          visitorScale={visitorScale}
          cameraHeightCm={cameraHeightCm}
          artworkCenterHeightCm={artworkCenterHeightCm}
          items={items}
          navigation={navigation}
          onFocusItem={onSelectItem}
          onSelectItem={setSelectedItem}
          visitors={viewerId === null ? undefined : visitors}
          ambientVisitorCount={viewerId === null ? items.length * 4 : 0}
          onMeetVisitor={viewerId === null ? undefined : onMeetVisitor}
          visitorsVisible={visitorsVisible}
          onVisitorsVisibleChange={onVisitorsVisibleChange}
        />
        {visitorContent}
      </div>
      {selectedItem ? (
        <StandardItemDialog
          currentRendererId={resolveCardRendererId({
            itemRendererId: selectedItem.card_renderer,
          })}
          displayOwner={owner}
          owner={owner}
          item={selectedItem}
          legendaryAttributes={legendaryAttributes}
          onClose={() => setSelectedItem(null)}
          permissions={{
            canManageItem: false,
            canCustomizeCosmetic: false,
          }}
          viewerId={viewerId}
        />
      ) : null}
    </>
  );
}
