import {
  ArtworkImage,
  AttributeIcons,
  ItemPropertyBadges,
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
        <div className="postcard-card-stamps">
          <AttributeIcons item={item} />
        </div>
        <ItemStatusBadges
          alreadyOwned={alreadyOwned}
          collectorSaleLabel="for sale"
          item={item}
          showMint={false}
          showOwned={false}
        />
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
        <div className="postcard-card-properties">
          <ItemPropertyBadges item={item} />
        </div>
        {item.unlocked ? (
          <i
            aria-label="Unlocked"
            className="fa fa-unlock-alt postcard-card-unlocked"
          />
        ) : null}
      </div>
    </div>
  );
}
