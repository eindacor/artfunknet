import {
  ArtworkImage,
  AttributeIcons,
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
        <div className="museum-card-main">
          <div className="museum-card-info">
            <span className="museum-card-number card-rarity-label">
              AF · {item.artwork.rarity}
            </span>
            <h3>{item.artwork.title}</h3>
            <p className="render-card-artist">{item.artwork.artist}</p>
            <p className="museum-card-workline">
              {item.artwork.date}, {item.artwork.medium}
              {item.unlocked ? (
                <span aria-label="Unlocked" className="museum-card-unlocked">
                  <i aria-hidden="true" className="fa fa-unlock-alt" />
                </span>
              ) : null}
            </p>
          </div>
          <AttributeIcons item={item} />
        </div>
        <ItemStatusBadges
          alreadyOwned={alreadyOwned}
          collectorSaleLabel="for sale"
          item={item}
          showMint={false}
          showOwned={false}
        />
        <CompactStats
          item={item}
          mintDisplay="leaf"
          showLotteryLevel
        />
      </div>
    </div>
  );
}
