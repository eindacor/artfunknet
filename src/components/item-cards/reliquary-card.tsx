import { ArtworkImage, getActiveLegendaryAttribute } from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function ReliquaryCard({
  item,
  legendaryAttributes,
}: ItemCardRendererProps) {
  const legendary = getActiveLegendaryAttribute(item, legendaryAttributes);
  const attributes = [
    ...item.attributes.special.map((attribute) => ({
      ...attribute,
      kind: "special" as const,
    })),
    ...item.attributes.unlocked.map((attribute) => ({
      ...attribute,
      kind: "unlocked" as const,
    })),
    ...item.attributes.locked.map((attribute) => ({
      ...attribute,
      kind: "locked" as const,
    })),
  ];
  const specialItemText =
    legendary?.description ||
    item.attributes.special[0]?.description ||
    `${item.artwork.genre} forged into a singular gallery relic.`;
  const hasSpecialItemText =
    item.artwork.rarity === "legendary" ||
    item.artwork.rarity === "masterpiece";
  const titleLength = Array.from(item.artwork.title).length;

  return (
    <div
      className="render-card reliquary-card"
      data-special-item={hasSpecialItemText ? "true" : undefined}
      data-title-size={
        titleLength > 40 ? "long" : titleLength > 24 ? "medium" : "short"
      }
    >
      <span aria-hidden="true" className="reliquary-card-grid" />
      <span aria-hidden="true" className="reliquary-card-border-beam" />
      <span
        aria-hidden="true"
        className="reliquary-card-corner corner-top-left"
      />
      <span
        aria-hidden="true"
        className="reliquary-card-corner corner-top-right"
      />
      <span
        aria-hidden="true"
        className="reliquary-card-corner corner-bottom-left"
      />
      <span
        aria-hidden="true"
        className="reliquary-card-corner corner-bottom-right"
      />

      <header className="reliquary-card-header">
        <span className="reliquary-card-crest" aria-hidden="true">
          <i className="fa fa-crown" />
        </span>
        <div className="reliquary-card-heading">
          <div className="reliquary-card-kicker">
            <strong className="card-rarity-label">
              {item.artwork.rarity}
            </strong>
            <span>{item.seasonal ? "BOSS REWARD" : "ITEM"}</span>
          </div>
          <h3>{item.artwork.title}</h3>
          <p>
            <span className="render-card-artist">{item.artwork.artist}</span>
            <span aria-hidden="true"> · </span>
            {item.artwork.genre}
          </p>
        </div>
      </header>

      <div className="reliquary-card-frame">
        <ArtworkImage className="reliquary-card-image" item={item} />
        <span aria-hidden="true" className="reliquary-card-image-vignette" />
        <span aria-hidden="true" className="reliquary-card-frame-beam" />
        <span aria-hidden="true" className="reliquary-card-image-mark">
          AF
        </span>
        <div className="reliquary-card-states">
          {item.mint ? (
            <i aria-label="Mint" className="fa fa-leaf" role="img" />
          ) : null}
          {item.unlocked ? (
            <i
              aria-label="Unlocked"
              className="fa fa-unlock-alt"
              role="img"
            />
          ) : null}
          {item.foil ? (
            <i aria-label="Foil" className="fa fa-bolt" role="img" />
          ) : null}
          {item.seasonal ? (
            <i aria-label="Seasonal" className="fa fa-star" role="img" />
          ) : null}
          {item.lottery ? (
            <span aria-label={`Lottery level ${item.lottery}`}>
              <i aria-hidden="true" className="fa fa-trophy" />
              {item.lottery}
            </span>
          ) : null}
        </div>
      </div>

      <section className="reliquary-card-loot">
        <div className="reliquary-card-readout">
          <span>
            <small>CONDITION</small>
            <strong>{item.mint ? "MINT" : Math.round(item.condition * 100) + "%"}</strong>
          </span>
          <span>
            <small>VALUE</small>
            <strong>${compactValue(item.values.actual)}</strong>
          </span>
          <span>
            <small>POWER</small>
            <strong>{item.level}</strong>
          </span>
        </div>
        <div
          className="reliquary-card-attributes"
          data-attribute-count={attributes.length}
        >
          {attributes.map((attribute) => (
            <span
              className={`reliquary-card-attribute attribute-${attribute.kind}`}
              key={`${attribute.kind}:${attribute._id}`}
            >
              <i aria-hidden="true" className={`fa ${attribute.icon}`} />
              <strong>+{Math.round((attribute.value ?? 0) * 100)}%</strong>
              <span>{attribute.npc_name}</span>
              <small>{attribute.kind}</small>
            </span>
          ))}
        </div>
      </section>

      {hasSpecialItemText ? (
        <aside className="reliquary-card-special-text">
          <strong>SPECIAL ITEM</strong>
          <span>{specialItemText}</span>
        </aside>
      ) : null}

      <footer className="reliquary-card-footer">
        <span>ARTFUNKEL</span>
        <span>{item.artwork.medium}</span>
        <strong>{getReliquarySerial(item._id)}</strong>
      </footer>
    </div>
  );
}

function compactValue(value: number): string {
  return Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function getReliquarySerial(itemId: string): string {
  const serial = itemId.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase();
  return serial.padStart(6, "0");
}
