import type { GameItem } from "@/server/gameplay";
import type { CSSProperties } from "react";

import type {
  CardLegendaryAttribute,
  ItemCardRendererProps,
} from "./types";

export function ratingColor(value: number): string {
  const red = Math.round(255 * (1 - value));
  return `rgb(${red}, 0, 0)`;
}

export function ratingColorOnDark(value: number): string {
  const light = Math.round(255 * value);
  return `rgb(255, ${light}, ${light})`;
}

function ratingStyle(value: number): CSSProperties {
  return {
    "--rating-color-light": ratingColor(value),
    "--rating-color-dark": ratingColorOnDark(value),
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
        backgroundImage: `url("/api/artwork/${item.artwork_id}/image")`,
      }}
    />
  );
}

export function ItemStatusBadges({
  item,
  alreadyOwned,
  showFoil = false,
  showMintIcon = true,
  showUnlocked = false,
}: Pick<ItemCardRendererProps, "item" | "alreadyOwned"> & {
  showFoil?: boolean;
  showMintIcon?: boolean;
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
      {item.mint ? (
        <span className="mint-indicator">
          {showMintIcon ? (
            <i aria-hidden="true" className="fa fa-leaf" />
          ) : null}
          mint
        </span>
      ) : null}
      {item.status === "claimed" && item.tags.includes("for sale") ? (
        <span className="collector-sale-indicator">for collectors</span>
      ) : null}
      {item.status === "unclaimed" ? (
        <span
          className={`artwork-ownership-indicator ${
            alreadyOwned ? "owned" : "new"
          }`}
        >
          {alreadyOwned ? "owned" : "new"}
        </span>
      ) : null}
    </span>
  );
}

export function ItemPropertyBadges({
  item,
}: Pick<ItemCardRendererProps, "item">) {
  const properties = [
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
}: Pick<ItemCardRendererProps, "item" | "legendaryAttributes"> & {
  showAttributeDetails?: boolean;
  showProperties?: boolean;
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
          <Fact label="Level" value={item.level} />
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
          <Fact label="Status" value={item.status.replaceAll("_", " ")} />
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
                  ? "identified forgery"
                  : (
                      <i
                        aria-label="Verified"
                        className="fa fa-check item-verified"
                      />
                    )
                : "unidentified"
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
      <span>LVL {item.level}</span>
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
    <span className="attribute-group">
      {attributes.map((attribute) => {
        const rating = Math.round((attribute.value ?? 0) * 100);
        return (
          <span
            className="attribute-tooltip"
            key={attribute._id}
            style={ratingStyle(attribute.value ?? 0)}
          >
            <i
              aria-label={`${attribute.npc_name}, ${rating}%, ${type}`}
              className={`fa ${attribute.icon} attribute ${type}`}
            />
            <span className="attribute-tooltip-text">
              <strong>{attribute.npc_name}</strong>
              <span className="attribute-rating">{rating}%</span>
              <span className={`attribute-type ${type}`}>{type}</span>
            </span>
          </span>
        );
      })}
    </span>
  );
}
