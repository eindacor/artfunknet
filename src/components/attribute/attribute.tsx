import { ratingColor } from "@/components/item-cards/shared";
import type { GalleryAttributeAggregate } from "@/server/gallery-metadata-core";

/**
 * A single gallery attribute, rendered as its Font Awesome glyph tinted by how
 * much of its rating the gallery is actually realising. Copied from the icon
 * inside GalleryAttributeSummary.
 */
export default function Attribute({
  attribute,
  displayCapacity,
}: {
  attribute: GalleryAttributeAggregate;
  displayCapacity: number;
}) {
  const effectiveRating = Math.min(1, Math.max(0, attribute.effectiveRating));
  const label = `${attribute.title}: ${attribute.count} ${
    attribute.count === 1 ? "work" : "works"
  }, ${Math.round(effectiveRating * 100)}% effective attraction (${Math.round(
    attribute.totalRating * 100,
  )} total ÷ ${displayCapacity} display slots)`;

  return (
    <i
      aria-label={label}
      className={`fa ${attribute.icon || "fa-tag"}`}
      role="img"
      style={{ color: ratingColor(effectiveRating) }}
      title={label}
    />
  );
}
