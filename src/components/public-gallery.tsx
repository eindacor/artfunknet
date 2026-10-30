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

export default function PublicGallery({
  visitorContent,
  focusedItemId,
  finishes,
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
}: {
  visitorContent?: React.ReactNode;
  focusedItemId?: string;
  finishes?: GalleryFinishes;
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
}) {
  const [selectedItem, setSelectedItem] = useState<HydratedGameItem | null>(
    null,
  );
  return (
    <>
      <div className="gallery-window public-gallery-window">
        <GalleryView
          disabled={navigationDisabled}
          emptyMessage={`@${owner.screenName} has not put any artwork on display.`}
          focusedItemId={focusedItemId}
          finishes={finishes}
          items={items}
          onFocusItem={onSelectItem}
          onSelectItem={setSelectedItem}
        />
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
            </button>
            <button
              aria-label="Next gallery"
              className="gallery-navigation-control next"
              disabled={navigationDisabled || !onNextGallery}
              onClick={onNextGallery}
              title="Next gallery"
              type="button"
            >
              <i aria-hidden="true" className="fa fa-chevron-right" />
            </button>
          </>
        ) : null}
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
        {navigationError ? (
          <p className="gallery-navigation-error" role="alert">
            {navigationError}
          </p>
        ) : null}
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
