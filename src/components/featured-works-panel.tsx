"use client";

import { Fragment, useId, type ReactNode } from "react";

import type { GalleryRates } from "@/server/collection-gameplay";
import type { GalleryAttributeAggregate } from "@/server/gallery-metadata-core";
import type { HydratedGameItem } from "@/server/item-artwork";
import Attribute from "./attribute/attribute";
import GalleryStat from "./gallery-stat/gallery-stat";
import GalleryStats from "./gallery-stats/gallery-stats";
import InfoPanel from "./info-panel/info-panel";

export default function FeaturedWorksPanel({
  actions,
  attributeScore,
  attributes,
  displayCapacity,
  items,
  maxDisplayCapacity,
  rates,
  renderItem,
}: {
  actions: ReactNode;
  attributeScore: number;
  attributes: GalleryAttributeAggregate[];
  displayCapacity: number;
  items: readonly HydratedGameItem[];
  maxDisplayCapacity: number;
  rates: GalleryRates;
  renderItem: (item: HydratedGameItem) => ReactNode;
}) {
  const slotCount = Math.max(maxDisplayCapacity, displayCapacity, items.length);
  const emptySlotCount = Math.max(0, displayCapacity - items.length);
  const visitorHelpId = useId();

  return (
    <InfoPanel className="home-featured-panel">
      <section aria-label="Featured works" className="home-featured-content">
        <div className="home-featured-top">
          <div className="home-featured-info">
            <header className="home-featured-heading">
              <h2 className="info-panel-title">Featured works</h2>
            </header>
            <GalleryStats>
              <GalleryStat
                label="Money per hour"
                value={`$${rates.moneyPerHour.toLocaleString()}`}
              />
              <GalleryStat
                label="XP per hour"
                value={rates.xpPerHour.toLocaleString()}
              />
              <GalleryStat
                label="Total featured value"
                value={`$${rates.value.toLocaleString()}`}
              />
              <GalleryStat
                label="Attribute score"
                value={attributeScore.toLocaleString()}
              />
              <div className="home-featured-attributes">
                <dt className="home-featured-visitor-label">
                  <span>Visitors you attract</span>
                  <button
                    aria-describedby={visitorHelpId}
                    aria-label="How featuring attracts visitors"
                    className="home-featured-help"
                    onClick={(event) => event.currentTarget.focus()}
                    type="button"
                  >
                    <i aria-hidden="true" className="fa fa-info-circle" />
                  </button>
                  <span className="home-featured-help-tooltip" id={visitorHelpId} role="tooltip">
                    Featured works earn money and XP over time. Their attributes attract the visitor types shown here.
                    Ratings for each type are combined and averaged across all unlocked feature slots, so empty slots dilute attraction.
                    Higher ratings improve arrival chances; artwork rarity and your level also matter.
                    Visit your gallery to meet visitors and use their services.
                  </span>
                </dt>
                <dd>
                  {attributes.length > 0 ? attributes.map((attribute) => (
                    <Attribute
                      attribute={attribute}
                      displayCapacity={displayCapacity}
                      key={attribute.id}
                    />
                  )) : "None"}
                </dd>
              </div>
            </GalleryStats>
          </div>
          <div className="home-overview-actions">{actions}</div>
        </div>
        {emptySlotCount > 0 ? (
          <p className="home-featured-warning" role="status">
            <i aria-hidden="true" className="fa fa-exclamation-triangle" />
            <span>
              <strong>{emptySlotCount} unoccupied feature {emptySlotCount === 1 ? "slot" : "slots"}.</strong>{" "}
              Fill all available slots to attract more visitors and earn money and XP.
            </span>
          </p>
        ) : null}
        <div aria-label="Featured artwork slots" className="home-featured-slots">
          {Array.from({ length: slotCount }, (_, index) => {
            const item = items[index];
            if (item) {
              return <Fragment key={item._id}>{renderItem(item)}</Fragment>;
            }
            const locked = index >= displayCapacity;
            return (
              <div
                aria-label={`${locked ? "Locked" : "Empty"} feature slot ${index + 1}`}
                className="home-featured-slot"
                data-locked={locked || undefined}
                key={`slot-${index}`}
                role="group"
                title={locked ? "Level up to unlock more feature space." : "Feature a work from your inventory."}
              >
                <i aria-hidden="true" className={`fa ${locked ? "fa-lock" : "fa-exclamation-circle"}`} />
                <span>{locked ? "Locked slot" : "Available feature slot"}</span>
                <small>{locked ? "Level up to unlock" : "Choose a work from your inventory"}</small>
              </div>
            );
          })}
        </div>
      </section>
    </InfoPanel>
  );
}
