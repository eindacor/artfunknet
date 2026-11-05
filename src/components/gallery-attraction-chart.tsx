"use client";

import { useId } from "react";

import type { GalleryAttributeAggregate } from "@/server/gallery-metadata-core";
import Attribute, { getGalleryAttributeLabel } from "./attribute/attribute";
import { ratingColor } from "./item-cards/shared";

export default function GalleryAttractionChart({
  attributes,
  className = "",
  displayCapacity,
  visitorTypes,
  showInfo = true,
}: {
  attributes: readonly GalleryAttributeAggregate[];
  className?: string;
  displayCapacity: number;
  visitorTypes: readonly { id: string; name: string; icon: string }[];
  showInfo?: boolean;
}) {
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
    <figure
      aria-label={showInfo ? undefined : "Effective attraction"}
      aria-labelledby={showInfo ? chartTitleId : undefined}
      className={`gallery-attraction ${className}`.trim()}
    >
      {showInfo ? (
        <figcaption className="gallery-attraction-label">
          <span id={chartTitleId}>Effective attraction</span>
          <button
            aria-describedby={visitorHelpId}
            aria-label="How featuring attracts visitors"
            className="gallery-attraction-help"
            onClick={(event) => {
              event.stopPropagation();
              event.currentTarget.focus();
            }}
            type="button"
          >
            <i aria-hidden="true" className="fa fa-info-circle" />
          </button>
          <span className="gallery-attraction-help-tooltip" id={visitorHelpId} role="tooltip">
            The symbols on each card show which visitor types are attracted to your gallery when that item is featured.
            Interact with visitors in galleries to earn money, items, and other bonuses. Visitors in your own gallery
            give bigger bonuses!
          </span>
        </figcaption>
      ) : null}
      {visitorAttributes.length > 0 ? (
        <div className="gallery-attraction-chart">
          <div aria-hidden="true" className="gallery-attraction-chart-scale">
            <span>100%</span><span>50%</span><span>0%</span>
          </div>
          <ul aria-label="Visitor types and effective attraction" className="gallery-attraction-chart-bars">
            {visitorAttributes.map(attribute => {
              const percentage = Math.round(attribute.effectiveRating * 100);
              const label = getGalleryAttributeLabel(attribute, displayCapacity);
              return (
                <li aria-label={label} className="gallery-attraction-chart-column" key={attribute.id}
                  style={{ color: ratingColor(attribute.effectiveRating) }} tabIndex={0} title={label}>
                  <span aria-hidden="true" className="gallery-attraction-chart-track">
                    <span className="gallery-attraction-chart-bar" style={{ height: `${attribute.effectiveRating * 100}%` }} />
                  </span>
                  <span aria-hidden="true" className="gallery-attraction-chart-icon">
                    <Attribute attribute={attribute} displayCapacity={displayCapacity} />
                  </span>
                  <span aria-hidden="true" className="gallery-attraction-chart-value">{percentage}%</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : <p className="gallery-attraction-chart-empty">No active visitor types.</p>}
    </figure>
  );
}
