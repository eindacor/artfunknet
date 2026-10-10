import {
  ArtworkImage,
  AttributeIcons,
  getActiveLegendaryAttribute,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function CollectibleCard({
  item,
  legendaryAttributes,
}: ItemCardRendererProps) {
  const conditionPercent = Math.round(item.condition * 100);
  const highRarity =
    item.artwork.rarity === "legendary" ||
    item.artwork.rarity === "masterpiece";
  const artworkPower = highRarity
    ? getActiveLegendaryAttribute(item, legendaryAttributes)
    : undefined;

  return (
    <div
      className="render-card collectible-card"
      data-artwork-power={artworkPower ? "true" : undefined}
      data-lottery={item.lottery > 0 ? item.lottery : undefined}
      data-mint={item.mint ? "true" : undefined}
      data-seasonal={item.seasonal ? "true" : undefined}
    >
      <div className="collectible-card-sparkles" aria-hidden="true" />
      <header>
        <span className="collectible-card-series">COLLECTOR SERIES</span>
        <span className="collectible-card-level">L{item.level}</span>
      </header>
      <div className="collectible-card-title-row">
        <h3>{item.artwork.title}</h3>
        <strong className="card-rarity-label">{item.artwork.rarity}</strong>
      </div>
      <div className="collectible-card-art-frame">
        <ArtworkImage className="collectible-card-image" item={item} />
        <span className="collectible-card-holo" aria-hidden="true" />
      </div>
      <section className="collectible-card-rules">
        <p className="render-card-artist">ILLUSTRATED BY {item.artwork.artist}</p>
        <div className="collectible-card-rules-heading">
          <strong>Fire Painting. Height: {item.artwork.height}cm, Weight: ???</strong>
        </div>
        <p className="collectible-card-rules-copy">
          <strong>Artwork Power:  </strong>
          This level {item.level}{" "}
          <span className={`rarity-text ${item.artwork.rarity}`}>
            {item.artwork.rarity}
          </span>{" "}
          work has a <strong>${item.values.actual.toLocaleString()}</strong>{" "}
          appraisal. It is {item.artwork.medium}.
          {item.lottery
            ? ` Lottery mark: level ${item.lottery}.`
            : ""}
        </p>
        {artworkPower ? (
          <p className="collectible-card-rules-copy collectible-card-artwork-power">
            <strong>{artworkPower.title}: </strong>
            {artworkPower.description}
          </p>
        ) : null}
        <div className="collectible-card-rules-stats">
          <AttributeIcons item={item} />
          <span className="collectible-card-condition">
            {item.unlocked ? (
              <i
                aria-label="Unlocked"
                className="fa fa-unlock-alt"
                role="img"
              />
            ) : null}
            {conditionPercent} HP
          </span>
        </div>
      </section>
      {item.lottery ? (
        <span className="collectible-card-lottery-mark">
          <small>PRIZE DRAW</small>
          <strong>L{item.lottery}</strong>
        </span>
      ) : null}
      <footer>
        <span>AF / {item.artwork.date}</span>
      </footer>
      {item.mint ? (
        <span
          aria-label="Mint protective sleeve"
          className="collectible-card-sleeve"
          role="img"
        >
          <span
            aria-hidden="true"
            className="collectible-card-sleeve-sticker"
          >
            <i className="fa fa-leaf" />
          </span>
        </span>
      ) : null}
    </div>
  );
}
