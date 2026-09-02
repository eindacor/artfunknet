import {
  ArtworkImage,
  AttributeIcons,
  getActiveLegendaryAttribute,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function ReliquaryCard({
  item,
  alreadyOwned,
  legendaryAttributes,
}: ItemCardRendererProps) {
  const legendary = getActiveLegendaryAttribute(item, legendaryAttributes);

  return (
    <div className="render-card reliquary-card">
      <div className="reliquary-card-energy" />
      <span className="reliquary-card-gem gem-left" />
      <span className="reliquary-card-gem gem-right" />
      <header>
        <span>COLLECTION RELIC</span>
        <strong className="card-rarity-label">
          {item.artwork.rarity}
        </strong>
      </header>
      <div className="reliquary-card-frame">
        <ArtworkImage className="reliquary-card-image" item={item} />
      </div>
      <section>
        <ItemStatusBadges item={item} alreadyOwned={alreadyOwned} />
        <h3>{item.artwork.title}</h3>
        <p className="render-card-artist">{item.artwork.artist}</p>
        <div className="reliquary-card-stats">
          <span>LV {item.level}</span>
          <span>{Math.round(item.condition * 100)}%</span>
          <span>${item.values.actual.toLocaleString()}</span>
        </div>
        <AttributeIcons item={item} />
        {legendary ? <em>{legendary.title}</em> : null}
      </section>
    </div>
  );
}
