import {
  ArtworkImage,
  AttributeIcons,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function ArcadeCard(props: ItemCardRendererProps) {
  const { item, alreadyOwned, researchTarget } = props;
  return (
    <div className={`render-card arcade-card arcade-${item.artwork.rarity}`}>
      <div className="arcade-card-grid" />
      <header>
        <span className="card-rarity-label">
          ITEM_{item.artwork.rarity.toUpperCase()}
        </span>
        <strong>LV.{item.level.toString().padStart(2, "0")}</strong>
      </header>
      <ArtworkImage className="arcade-card-image" item={item} />
      <div className="arcade-card-scanline" />
      <section>
        <ItemStatusBadges
          item={item}
          alreadyOwned={alreadyOwned}
          researchTarget={researchTarget}
        />
        <h3>{item.artwork.title}</h3>
        <p className="render-card-artist">{item.artwork.artist}</p>
        <div className="arcade-card-bars">
          <span>
            COND
            <i style={{ width: `${Math.round(item.condition * 100)}%` }} />
          </span>
          <span>
            VALUE
            <strong>${item.values.actual.toLocaleString()}</strong>
          </span>
        </div>
        <AttributeIcons item={item} />
      </section>
    </div>
  );
}
