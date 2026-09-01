import {
  AttributeIcons,
  getActiveLegendaryAttribute,
  ItemStatusBadges,
  ratingColor,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function LegacyCard({
  item,
  legendaryAttributes,
  alreadyOwned,
}: ItemCardRendererProps) {
  const activeLegendaryAttribute = getActiveLegendaryAttribute(
    item,
    legendaryAttributes,
  );
  const cardTypes = [
    item.unlocked ? "card-effect-unlocked" : "",
    item.foil ? "card-effect-foil" : "",
    item.seasonal ? "card-effect-seasonal" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`card-container ${item.artwork.rarity}-item`}
      style={{
        backgroundImage: `url("/api/artwork/${item.artwork_id}/image")`,
      }}
    >
      <div className={`card-header ${cardTypes}`}>
        <p className="item-title">
          {item.artwork.title}
          <ItemStatusBadges item={item} alreadyOwned={alreadyOwned} />
        </p>
        <p>{item.artwork.artist}</p>
        <div className="header-details">
          <p>{item.artwork.date}</p>
          <CardSignature item={item} />
          <p>{item.artwork.genre}</p>
          <p>{item.artwork.medium}</p>
          <p>
            {item.artwork.height} × {item.artwork.width} cm
          </p>
          <p>drop chance: {item.odds}</p>
          <p>
            condition:{" "}
            <span style={{ color: ratingColor(item.condition) }}>
              {Math.round(item.condition * 100)}%
            </span>
          </p>
          <p>estimated value: ${item.values.actual.toLocaleString()}</p>
          {activeLegendaryAttribute ? (
            <p className="legendary-flavor-text">
              &ldquo;{activeLegendaryAttribute.flavorText}&rdquo;
            </p>
          ) : null}
          <p className="verified-text">✓ verified</p>
        </div>
      </div>
      <div className={`card-footer ${cardTypes}`}>
        <div className="attribute-area">
          <AttributeIcons item={item} />
        </div>
        <strong>lvl {item.level}</strong>
      </div>
    </div>
  );
}

function CardSignature({ item }: Pick<ItemCardRendererProps, "item">) {
  return (
    <p className="card-signature" aria-label="Card signature">
      <strong className={`signature-${item.artwork.rarity}`}>
        {item.artwork.rarity}
      </strong>
      {item.foil ? <span className="signature-foil"> foil</span> : null}
      {item.seasonal ? (
        <span className="signature-seasonal"> seasonal</span>
      ) : null}
      {item.lottery ? (
        <span className="signature-lottery"> lottery {item.lottery}</span>
      ) : null}
      {item.original ? (
        <span className="signature-original"> original</span>
      ) : null}
      {item.vintage ? (
        <span className="signature-vintage"> vintage</span>
      ) : null}
      {item.unlocked ? (
        <span className="signature-unlocked"> unlocked</span>
      ) : null}
      {item.patreon ? (
        <span className="signature-patreon"> patreon</span>
      ) : null}
    </p>
  );
}
