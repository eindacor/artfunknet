"use client";

import Link from "next/link";
import type { GameItem } from "@/server/gameplay";
import { useRef, useState, type CSSProperties } from "react";

import type { ArchiveCategory } from "@/server/archive-gameplay";
import { FloatingPopover } from "@/components/floating-popover";
import { CARD_COSMETICS, getCardCosmetic } from "./catalog";
import type {
  CardLegendaryAttribute,
  ItemCardRendererProps,
  ItemOwner,
} from "./types";

export function ratingColor(value: number): string {
  const red = Math.round(255 * (1 - value));
  return `rgb(${red}, 0, 0)`;
}

export function ratingColorOnDark(value: number): string {
  const light = Math.round(255 * value);
  return `rgb(255, ${light}, ${light})`;
}

function ratingColorOnDarkGreen(value: number): string {
  const clampedValue = Math.min(Math.max(value, 0), 1);
  const red = Math.round(255 - 87 * clampedValue);
  const green = Math.round(159 + 88 * clampedValue);
  const blue = Math.round(90 + 134 * clampedValue);
  return `rgb(${red}, ${green}, ${blue})`;
}

function ratingStyle(value: number): CSSProperties {
  return {
    "--rating-color-light": ratingColor(value),
    "--rating-color-dark": ratingColorOnDark(value),
    "--rating-color-abstract": ratingColorOnDarkGreen(value),
  } as CSSProperties;
}

export function getActiveLegendaryAttribute(
  item: ItemCardRendererProps["item"],
  legendaryAttributes: CardLegendaryAttribute[],
) {
  return legendaryAttributes.find(
    (attribute) =>
      attribute.active && attribute.id === item.active_unique_attribute,
  );
}

export function ArtworkImage({
  item,
  className,
}: Pick<ItemCardRendererProps, "item"> & { className: string }) {
  return (
    <div
      aria-label={`${item.artwork.title} by ${item.artwork.artist}`}
      className={`${className} render-card-artwork-image`}
      role="img"
      style={{
        backgroundImage: `url("/api/artwork/${item.artwork_id}/image?variant=card")`,
      }}
    />
  );
}

export function ItemStatusBadges({
  item,
  alreadyOwned,
  consigned = false,
  researchTarget = false,
  collectorSaleLabel = "for sale",
  showFoil = false,
  showMint = true,
  showUnlocked = false,
}: Pick<
  ItemCardRendererProps,
  "item" | "alreadyOwned" | "consigned" | "researchTarget"
> & {
  collectorSaleLabel?: string;
  showFoil?: boolean;
  showMint?: boolean;
  showUnlocked?: boolean;
}) {
  return (
    <span className="render-card-badges">
      {item.foil && showFoil ? (
        <span className="foil-indicator">foil</span>
      ) : null}
      {item.unlocked && showUnlocked ? (
        <span className="item-property-badge property-unlocked">
          unlocked
        </span>
      ) : null}
      {item.mint && showMint ? (
        <span className="mint-indicator">mint</span>
      ) : null}
      {item.status === "claimed" && item.tags.includes("for sale") ? (
        <span className="collector-sale-indicator">{collectorSaleLabel}</span>
      ) : null}
      {item.repairing ? (
        <span className="repairing-indicator">repairing</span>
      ) : null}
      {researchTarget ? (
        <span className="research-sought-indicator">sought</span>
      ) : null}
      {consigned ? (
        <span className="auction-consigned-indicator">consigned</span>
      ) : null}
      {item.status === "unclaimed" && alreadyOwned ? (
        <span className="artwork-ownership-indicator owned">owned</span>
      ) : null}
    </span>
  );
}

export function ItemPropertyBadges({
  item,
  showLifecycle = false,
}: Pick<ItemCardRendererProps, "item"> & {
  showLifecycle?: boolean;
}) {
  const properties = [
    showLifecycle && item.tags.includes("for sale")
      ? { key: "for-sale", label: "for sale" }
      : null,
    item.archivePermission?.allowed
      ? { key: "archivable", label: "archivable" }
      : null,
    item.mint ? { key: "mint", label: "mint" } : null,
    item.foil ? { key: "foil", label: "foil" } : null,
    item.unlocked ? { key: "unlocked", label: "unlocked" } : null,
    item.seasonal ? { key: "seasonal", label: "seasonal" } : null,
    item.vintage ? { key: "vintage", label: "vintage" } : null,
    item.original ? { key: "original", label: "original" } : null,
    item.patreon ? { key: "patreon", label: "patreon" } : null,
    item.lottery
      ? { key: "lottery", label: `lottery ${item.lottery}` }
      : null,
    item.misprint ? { key: "misprint", label: "misprint" } : null,
  ].filter(
    (property): property is { key: string; label: string } =>
      property !== null,
  );

  return (
    <span className="item-property-badges">
      {properties.length > 0 ? (
        properties.map((property) => (
          <span
            className={`item-property-badge property-${property.key}`}
            key={property.key}
          >
            {property.label}
          </span>
        ))
      ) : (
        <span aria-label="No properties" className="item-properties-empty">
          <i aria-hidden="true" className="fa fa-times" />
        </span>
      )}
    </span>
  );
}

export function ArchivedCategoryBadges({
  availableCategories,
  categories,
}: {
  availableCategories?: readonly ArchiveCategory[];
  categories: readonly ArchiveCategory[];
}) {
  const archived = new Set(categories);
  const displayedCategories = availableCategories ?? categories;
  return (
    <span className="item-property-badges archived-category-badges">
      {displayedCategories.map((category) => (
        <span
          aria-label={`${category}, ${archived.has(category) ? "archived" : "not archived"}`}
          className={`item-property-badge property-${category}${
            archived.has(category) ? "" : " archive-property-missing"
          }`}
          key={category}
        >
          {category}
        </span>
      ))}
    </span>
  );
}

export function ArchivedArtStyleBadges({
  availableStyles,
  styles,
}: {
  availableStyles?: readonly string[];
  styles: readonly string[];
}) {
  const archived = new Set(styles);
  const displayedStyles = availableStyles ?? styles;
  const orderedStyles = [
    ...CARD_COSMETICS.flatMap((cosmetic) =>
      displayedStyles.includes(cosmetic.id) ? [cosmetic.id] : [],
    ),
    ...displayedStyles.filter((style) => !getCardCosmetic(style)),
  ];

  return (
    <span className="item-property-badges archived-art-style-badges">
      {orderedStyles.map((style) => {
        const cosmetic = getCardCosmetic(style);
        return (
          <span
            aria-label={`${cosmetic?.name ?? style}, ${
              archived.has(style) ? "archived" : "not archived"
            }`}
            className={`item-property-badge property-art-style${
              archived.has(style) ? "" : " archive-property-missing"
            }`}
            key={style}
          >
            {cosmetic
              ? cosmetic.id === "museum"
                ? `${cosmetic.name} (default)`
                : `#${cosmetic.number.toString().padStart(2, "0")} ${cosmetic.name}`
              : style}
          </span>
        );
      })}
    </span>
  );
}

export function AttributeIcons({
  item,
}: Pick<ItemCardRendererProps, "item">) {
  const attributeCount =
    item.attributes.unlocked.length +
    item.attributes.locked.length +
    item.attributes.special.length;

  return (
    <span
      className={`render-card-attribute-icons ${
        attributeCount > 3 ? "attribute-layout-many" : ""
      }`}
      data-attribute-count={attributeCount}
    >
      <AttributeGroup attributes={item.attributes.unlocked} type="unlocked" />
      <AttributeGroup attributes={item.attributes.locked} type="locked" />
      <AttributeGroup attributes={item.attributes.special} type="special" />
    </span>
  );
}

export function ItemDetails({
  item,
  legendaryAttributes,
  summary = "View complete item details",
}: Pick<ItemCardRendererProps, "item" | "legendaryAttributes"> & {
  summary?: string;
}) {
  return (
    <details className="render-card-details">
      <summary>{summary}</summary>
      <div className="render-card-details-panel">
        <CompleteItemRecord
          item={item}
          legendaryAttributes={legendaryAttributes}
        />
      </div>
    </details>
  );
}

export function CompleteItemRecord({
  item,
  legendaryAttributes,
  showAttributeDetails = true,
  showProperties = true,
  owner,
  statusValue,
}: Pick<ItemCardRendererProps, "item" | "legendaryAttributes"> & {
  owner?: ItemOwner;
  showAttributeDetails?: boolean;
  showProperties?: boolean;
  statusValue?: React.ReactNode;
}) {
  const legendary = getActiveLegendaryAttribute(item, legendaryAttributes);
  const properties = [
    item.mint ? "mint" : null,
    item.foil ? "foil" : null,
    item.unlocked ? "unlocked" : null,
    item.seasonal ? "seasonal" : null,
    item.vintage ? "vintage" : null,
    item.original ? "original" : null,
    item.patreon ? "patreon" : null,
    item.lottery ? `lottery ${item.lottery}` : null,
    item.misprint ? "misprint" : null,
  ].filter((property): property is string => Boolean(property));

  return (
    <div className="complete-item-record">
      <dl>
          <Fact label="Artist" value={item.artwork.artist} />
          <Fact
            label="Owner"
            value={
              owner ? (
                <Link
                  className="item-owner-link"
                  href={`/gallery/${encodeURIComponent(owner.playerId)}`}
                >
                  @{owner.screenName}
                </Link>
              ) : (
                <strong className="item-owner-default">artfunkel inc.</strong>
              )
            }
          />
          <Fact label="Title" value={item.artwork.title} />
          <Fact label="Date" value={item.artwork.date} />
          <Fact label="Genre" value={item.artwork.genre} />
          <Fact label="Medium" value={item.artwork.medium} />
          <Fact
            label="Dimensions"
            value={`${item.artwork.height} × ${item.artwork.width} cm`}
          />
          <Fact
            label="Rarity"
            value={
              <span className="card-rarity-label">
                {item.artwork.rarity}
              </span>
            }
          />
          <Fact label="Promotion Level" value={item.level} />
          <Fact
            label="Condition"
            value={
              <span
                aria-label={item.mint ? "Mint condition" : undefined}
                className={item.mint ? "mint-condition" : undefined}
              >
                {item.mint ? (
                  <i aria-hidden="true" className="fa fa-leaf" />
                ) : (
                  `${Math.round(item.condition * 100)}%`
                )}
              </span>
            }
          />
          <Fact
            label="Estimated value"
            value={
              <strong className="estimated-value">
                ${item.values.actual.toLocaleString()}
              </strong>
            }
          />
          <Fact
            label="Auction minimum"
            value={`$${item.values.auction_min.toLocaleString()}`}
          />
          <Fact label="Drop chance" value={item.odds} />
          <Fact label="Roll count" value={item.roll_count} />
          <Fact
            label="Reroll spending"
            value={`$${item.reroll_spent.toLocaleString()}`}
          />
          <Fact
            label="Status"
            value={statusValue ?? item.status.replaceAll("_", " ")}
          />
          <Fact label="Source" value={item.source} />
          <Fact
            label="Tags"
            value={item.tags.length > 0 ? item.tags.join(", ") : "none"}
          />
          <Fact
            label="Authenticity"
            value={
              item.authenticity.identified
                ? item.authenticity.forgery
                  ? "known forgery"
                  : (
                      <i
                        aria-label="Authenticated"
                        className="fa fa-check item-verified"
                      />
                    )
                : "unauthenticated"
            }
          />
          {showProperties ? (
            <Fact
              label="Properties"
              value={
                properties.length > 0 ? properties.join(", ") : "standard"
              }
            />
          ) : null}
      </dl>
      {showAttributeDetails ? <AttributeDetails item={item} /> : null}
      {legendary ? (
        <div className="render-card-legendary">
          <strong>{legendary.title}</strong>
          <span>{legendary.description}</span>
          <em>&ldquo;{legendary.flavorText}&rdquo;</em>
        </div>
      ) : null}
    </div>
  );
}

export function CompactStats({
  item,
  mintDisplay = "text",
  showLotteryLevel = false,
}: Pick<ItemCardRendererProps, "item"> & {
  mintDisplay?: "text" | "leaf";
  showLotteryLevel?: boolean;
}) {
  return (
    <span className="render-card-compact-stats">
      <span>P{item.level}</span>
      {showLotteryLevel && item.lottery > 0 ? (
        <span
          aria-label={`Lottery level ${item.lottery}`}
          className="lottery-level"
        >
          L{item.lottery}
        </span>
      ) : null}
      <span
        aria-label={item.mint && mintDisplay === "leaf" ? "Mint condition" : undefined}
        className="rating-value"
        style={ratingStyle(item.condition)}
      >
        {item.mint && mintDisplay === "leaf" ? (
          <i aria-hidden="true" className="fa fa-leaf" />
        ) : item.mint ? (
          "MINT"
        ) : (
          `${Math.round(item.condition * 100)}%`
        )}
      </span>
      <span>${item.values.actual.toLocaleString()}</span>
    </span>
  );
}

function Fact({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function AttributeDetails({ item }: Pick<ItemCardRendererProps, "item">) {
  const groups = [
    ["Unlocked", item.attributes.unlocked],
    ["Locked", item.attributes.locked],
    ["Special", item.attributes.special],
  ] as const;
  return (
    <div className="render-card-attribute-details">
      {groups.map(([label, attributes]) => (
        <section key={label}>
          <strong>{label} attributes</strong>
          {attributes.length === 0 ? (
            <span>None</span>
          ) : (
            attributes.map((attribute) => (
              <span key={attribute._id}>
                {attribute.npc_name}:{" "}
                {Math.round((attribute.value ?? 0) * 100)}%
              </span>
            ))
          )}
        </section>
      ))}
    </div>
  );
}

function AttributeGroup({
  attributes,
  type,
}: {
  attributes: GameItem["attributes"]["unlocked"];
  type: "unlocked" | "locked" | "special";
}) {
  if (attributes.length === 0) return null;

  return (
    <span className={`attribute-group attribute-group-${type}`}>
      {attributes.map((attribute) => {
        const rating = Math.round((attribute.value ?? 0) * 100);
        return (
          <AttributeTooltip
            attribute={attribute}
            key={attribute._id}
            rating={rating}
            type={type}
          />
        );
      })}
    </span>
  );
}

function AttributeTooltip({
  attribute,
  rating,
  type,
}: {
  attribute: GameItem["attributes"]["unlocked"][number];
  rating: number;
  type: "unlocked" | "locked" | "special";
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <span
      className="attribute-tooltip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      ref={anchorRef}
      style={ratingStyle(attribute.value ?? 0)}
    >
      <i
        aria-label={`${attribute.npc_name}, ${rating}%, ${type}`}
        className={`fa ${attribute.icon} attribute ${type}`}
      />
      <FloatingPopover
        anchorRef={anchorRef}
        className="attribute-tooltip-text"
        open={open}
      >
        <strong>{attribute.npc_name}</strong>
        <span className="attribute-rating">{rating}%</span>
        <span className={`attribute-type ${type}`}>{type}</span>
      </FloatingPopover>
    </span>
  );
}
