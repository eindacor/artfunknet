"use client";

import { useState } from "react";

import {
  getGalleryPaintingDimension,
  getGalleryPixelsPerCentimeter,
} from "./gallery-layout";
import { resolveCardRendererId } from "./item-cards/selection";
import StandardItemDialog from "./item-cards/standard-item-dialog";
import type {
  CardLegendaryAttribute,
  ItemDisplayOwner,
} from "./item-cards/types";
import type { HydratedGameItem } from "@/server/item-artwork";

export default function PublicGallery({
  floorContent,
  items,
  legendaryAttributes,
  navigationDisabled = false,
  navigationError,
  onExitGallery,
  onNextGallery,
  onPreviousGallery,
  onSelectItem,
  owner,
  viewerId,
}: {
  floorContent?: React.ReactNode;
  items: HydratedGameItem[];
  legendaryAttributes: CardLegendaryAttribute[];
  navigationDisabled?: boolean;
  navigationError?: string;
  onExitGallery?: () => void;
  onNextGallery?: () => void;
  onPreviousGallery?: () => void;
  onSelectItem?: (item: HydratedGameItem) => void;
  owner: ItemDisplayOwner;
  viewerId: string | null;
}) {
  const [selectedItem, setSelectedItem] = useState<HydratedGameItem | null>(
    null,
  );
  const pixelsPerCentimeter = getGalleryPixelsPerCentimeter(
    items.map((item) => item.artwork.height),
  );
  const paintingMargin = Math.floor(80 * pixelsPerCentimeter);
  const wallOffset = Math.floor(120 * pixelsPerCentimeter);

  return (
    <>
      <div className="gallery-window public-gallery-window">
        <div className="gallery-scroll-window">
          <div className="gallery-scene">
            <div
              className="gallery-wall"
              style={{
                paddingBottom: wallOffset,
                paddingTop: wallOffset,
              }}
            >
              {items.length === 0 ? (
                <p className="empty-gallery">
                  @{owner.screenName} has not put any artwork on display.
                </p>
              ) : (
                items.map((item) => (
                  <div
                    className="painting-container"
                    key={item._id}
                    style={{
                      marginLeft: paintingMargin,
                      marginRight: paintingMargin,
                    }}
                  >
                    <button
                      aria-label={`View ${item.artwork.title} by ${item.artwork.artist}`}
                      className="framed-painting"
                      onClick={() =>
                        onSelectItem
                          ? onSelectItem(item)
                          : setSelectedItem(item)
                      }
                      style={{
                        backgroundImage: `url("/api/artwork/${item.artwork_id}/image?variant=full")`,
                        height: getGalleryPaintingDimension(
                          item.artwork.height,
                          pixelsPerCentimeter,
                        ),
                        width: getGalleryPaintingDimension(
                          item.artwork.width,
                          pixelsPerCentimeter,
                        ),
                      }}
                      type="button"
                    />
                    <div className="placard">
                      <p>{item.artwork.title}</p>
                      <p>
                        {item.artwork.artist}, {item.artwork.date}
                      </p>
                      <p className={`rarity-text ${item.artwork.rarity}`}>
                        {item.artwork.rarity}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="gallery-floor" />
          </div>
        </div>
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
        {navigationError ? (
          <p className="gallery-navigation-error" role="alert">
            {navigationError}
          </p>
        ) : null}
        {floorContent}
      </div>
      {!onSelectItem && selectedItem ? (
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
