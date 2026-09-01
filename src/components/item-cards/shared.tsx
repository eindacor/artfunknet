import type { GameItem } from "@/server/gameplay";

import type {
  CardLegendaryAttribute,
  ItemCardRendererProps,
} from "./types";

export function ratingColor(value: number): string {
  const red = Math.round(255 * (1 - value));
  return `rgb(${red}, 0, 0)`;
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
      className={className}
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
}: Pick<ItemCardRendererProps, "item" | "alreadyOwned">) {
  return (
    <span className="render-card-badges">
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

export function AttributeIcons({
  item,
}: Pick<ItemCardRendererProps, "item">) {
  return (
    <span className="render-card-attribute-icons">
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
}: Pick<ItemCardRendererProps, "item" | "legendaryAttributes">) {
  const legendary = getActiveLegendaryAttribute(item, legendaryAttributes);
  const properties = [
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
          <Fact label="Rarity" value={item.artwork.rarity} />
          <Fact label="Level" value={item.level} />
          <Fact
            label="Condition"
            value={`${Math.round(item.condition * 100)}%`}
          />
          <Fact
            label="Estimated value"
            value={`$${item.values.actual.toLocaleString()}`}
          />
          <Fact
            label="Sell value"
            value={`$${item.values.sell.toLocaleString()}`}
          />
          <Fact
            label="Dealer value"
            value={`$${item.values.dealer.toLocaleString()}`}
          />
          <Fact
            label="Collector value"
            value={`$${item.values.collector.toLocaleString()}`}
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
                  : "verified"
                : "unidentified"
            }
          />
          <Fact
            label="Properties"
            value={properties.length > 0 ? properties.join(", ") : "standard"}
          />
      </dl>
      <AttributeDetails item={item} />
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
}: Pick<ItemCardRendererProps, "item">) {
  return (
    <span className="render-card-compact-stats">
      <span>LVL {item.level}</span>
      <span style={{ color: ratingColor(item.condition) }}>
        {Math.round(item.condition * 100)}%
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
  value: string | number;
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
          <span className="attribute-tooltip" key={attribute._id}>
            <i
              aria-label={`${attribute.npc_name}, ${rating}% attraction, ${type}`}
              className={`fa ${attribute.icon} attribute ${type}`}
              style={{ color: ratingColor(attribute.value ?? 0) }}
            />
            <span className="attribute-tooltip-text">
              <strong>{attribute.npc_name}</strong>
              <span>{rating}% attraction</span>
              <span>{type}</span>
            </span>
          </span>
        );
      })}
    </span>
  );
}
