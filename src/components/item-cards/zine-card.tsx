import {
  ArtworkImage,
  AttributeIcons,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function ZineCard({
  item,
  alreadyOwned,
}: ItemCardRendererProps) {
  return (
    <div className="render-card zine-card">
      <span className="zine-card-tape" />
      <header>
        <span>ISSUE #{item.level.toString().padStart(2, "0")}</span>
        <strong className="card-rarity-label">
          {item.artwork.rarity}
        </strong>
      </header>
      <div className="zine-card-image-wrap">
        <ArtworkImage className="zine-card-image" item={item} />
        <span className="zine-card-value">
          ${item.values.actual.toLocaleString()}
        </span>
      </div>
      <section>
        <ItemStatusBadges item={item} alreadyOwned={alreadyOwned} />
        <h3>{item.artwork.title}</h3>
        <p className="render-card-artist">ART BY {item.artwork.artist}</p>
        <p>
          {item.artwork.genre} / {Math.round(item.condition * 100)}% COND.
        </p>
        <AttributeIcons item={item} />
      </section>
    </div>
  );
}
