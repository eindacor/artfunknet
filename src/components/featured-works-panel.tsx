"use client";

import { Fragment, type ReactNode } from "react";
import { TutorialElement } from "@/shared/tutorial";

import type { GalleryRates } from "@/server/collection-gameplay";
import type { GalleryAttributeAggregate } from "@/server/gallery-metadata-core";
import type { HydratedGameItem } from "@/server/item-artwork";
import GalleryAttractionChart from "./gallery-attraction-chart";
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
  visitorTypes,
}: {
  actions: ReactNode;
  attributeScore: number;
  attributes: GalleryAttributeAggregate[];
  displayCapacity: number;
  items: readonly HydratedGameItem[];
  maxDisplayCapacity: number;
  rates: GalleryRates;
  renderItem: (item: HydratedGameItem) => ReactNode;
  visitorTypes: readonly { id: string; name: string; icon: string }[];
}) {
  const slotCount = Math.max(maxDisplayCapacity, displayCapacity, items.length);
  const emptySlotCount = Math.max(0, displayCapacity - items.length);

  return (
    <InfoPanel className="home-featured-panel">
      <section aria-label="Featured works" className="home-featured-content"
        data-tutorial-element={TutorialElement.TUTORIAL_FILL_FEATURES}>
        <header className="home-featured-heading">
          <h2 className="info-panel-title">Your featured works</h2>
        </header>
        <div className="home-featured-top">
          <div className="home-featured-info">
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
                label="Visitor attraction score"
                value={attributeScore.toLocaleString()}
              />
            </GalleryStats>
          </div>
          <GalleryAttractionChart
            attributes={attributes}
            className="home-featured-attraction"
            displayCapacity={displayCapacity}
            visitorTypes={visitorTypes}
          />
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
