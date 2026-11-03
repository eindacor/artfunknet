"use client";

import { Fragment, useId, type ReactNode } from "react";

import type { GalleryRates } from "@/server/collection-gameplay";
import type { GalleryAttributeAggregate } from "@/server/gallery-metadata-core";
import type { HydratedGameItem } from "@/server/item-artwork";
import Attribute, { getGalleryAttributeLabel } from "./attribute/attribute";
import { ratingColor } from "./item-cards/shared";
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
  const visitorHelpId = useId();
  const chartTitleId = useId();
  const attributesById = new Map(attributes.map(attribute => [attribute.id, attribute]));
  const visitorAttributes = visitorTypes.map(visitor => {
    const attribute = attributesById.get(visitor.id);
    return {
      id: visitor.id, title: visitor.name, icon: visitor.icon, type: attribute?.type ?? "npc",
      count: attribute?.count ?? 0, totalRating: attribute?.totalRating ?? 0,
      effectiveRating: Math.min(1, Math.max(0, attribute?.effectiveRating ?? 0)),
    };
  });

  return (
    <InfoPanel className="home-featured-panel">
      <section aria-label="Featured works" className="home-featured-content">
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
          <figure aria-labelledby={chartTitleId} className="home-featured-attraction">
            <figcaption className="home-featured-visitor-label">
              <span id={chartTitleId}>Effective attraction</span>
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
                The symbols on each card show which visitor types are attracted to your gallery when that item is featured.
                Interact with visitors in galleries to earn money, items, and other bonuses. Visitors in your own gallery
                give bigger bonuses!
              </span>
            </figcaption>
            {visitorAttributes.length > 0 ? (
              <div className="home-featured-chart">
                <div aria-hidden="true" className="home-featured-chart-scale">
                  <span>100%</span><span>50%</span><span>0%</span>
                </div>
                <ul aria-label="Visitor types and effective attraction" className="home-featured-chart-bars">
                  {visitorAttributes.map(attribute => {
                    const percentage = Math.round(attribute.effectiveRating * 100);
                    const label = getGalleryAttributeLabel(attribute, displayCapacity);
                    return (
                      <li aria-label={label} className="home-featured-chart-column" key={attribute.id}
                        style={{ color: ratingColor(attribute.effectiveRating) }} tabIndex={0} title={label}>
                        <span aria-hidden="true" className="home-featured-chart-track">
                          <span className="home-featured-chart-bar" style={{ height: `${attribute.effectiveRating * 100}%` }} />
                        </span>
                        <span aria-hidden="true" className="home-featured-chart-icon">
                          <Attribute attribute={attribute} displayCapacity={displayCapacity} />
                        </span>
                        <span aria-hidden="true" className="home-featured-chart-value">{percentage}%</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : <p className="home-featured-chart-empty">No active visitor types.</p>}
          </figure>
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
