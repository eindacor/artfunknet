import {
  ArtworkImage,
  AttributeIcons,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function PostcardCard(props: ItemCardRendererProps) {
  const { item, alreadyOwned } = props;
  return (
    <div className="render-card postcard-card">
      <div className="postcard-card-front">
        <ArtworkImage className="postcard-card-image" item={item} />
        <span className="postcard-card-caption render-card-artist">
          Greetings from {item.artwork.artist}
        </span>
      </div>
      <div className="postcard-card-message">
        <span className="postcard-card-stamp card-rarity-label">
          <i className="fa fa-picture-o" />
          {item.artwork.rarity}
        </span>
        <ItemStatusBadges item={item} alreadyOwned={alreadyOwned} />
        <p className="postcard-card-script">Wish you were here.</p>
        <h3>{item.artwork.title}</h3>
        <p>
          {item.artwork.date} · {item.artwork.medium}
        </p>
        <p className="postcard-card-address">
          Level {item.level}
          <br />
          Condition {Math.round(item.condition * 100)}%
          <br />${item.values.actual.toLocaleString()}
        </p>
        <AttributeIcons item={item} />
      </div>
    </div>
  );
}
