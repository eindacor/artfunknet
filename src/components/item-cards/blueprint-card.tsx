import {
  ArtworkImage,
  AttributeIcons,
  CompactStats,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function BlueprintCard({
  item,
  alreadyOwned,
}: ItemCardRendererProps) {
  return (
    <div className="render-card blueprint-card">
      <span className="blueprint-card-registration">AF-{item.level}-A</span>
      <header>
        <span>COLLECTION SPECIFICATION</span>
        <strong className="card-rarity-label">
          {item.artwork.rarity}
        </strong>
      </header>
      <div className="blueprint-card-frame">
        <ArtworkImage className="blueprint-card-image" item={item} />
        <span className="blueprint-card-measure width">
          {item.artwork.width} cm
        </span>
        <span className="blueprint-card-measure height">
          {item.artwork.height} cm
        </span>
      </div>
      <section>
        <ItemStatusBadges item={item} alreadyOwned={alreadyOwned} />
        <h3>{item.artwork.title}</h3>
        <p className="render-card-artist">{item.artwork.artist}</p>
        <p className="blueprint-card-spec">
          {item.artwork.date} / {item.artwork.medium}
        </p>
        <CompactStats item={item} />
        <AttributeIcons item={item} />
      </section>
    </div>
  );
}
