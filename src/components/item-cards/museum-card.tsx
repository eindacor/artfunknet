import {
  ArtworkImage,
  CompactStats,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function MuseumCard(props: ItemCardRendererProps) {
  const { item, alreadyOwned } = props;
  return (
    <div className="render-card museum-card">
      <ArtworkImage className="museum-card-image" item={item} />
      <div className="museum-card-label">
        <span className="museum-card-number card-rarity-label">
          AF · {item.artwork.rarity}
        </span>
        <h3>{item.artwork.title}</h3>
        <p>{item.artwork.artist}</p>
        <p className="museum-card-workline">
          {item.artwork.date}, {item.artwork.medium}
        </p>
        <ItemStatusBadges item={item} alreadyOwned={alreadyOwned} />
        <CompactStats item={item} />
      </div>
    </div>
  );
}
