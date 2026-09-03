import {
  ArtworkImage,
  AttributeIcons,
  CompactStats,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function MuseumCard(props: ItemCardRendererProps) {
  const { item, alreadyOwned, consigned, researchTarget } = props;
  return (
    <div className="render-card museum-card">
      <ArtworkImage className="museum-card-image" item={item} />
      <div className="museum-card-label">
        <span className="museum-card-number card-rarity-label">
          AF · {item.artwork.rarity}
        </span>
        <div className="museum-card-middle">
          <div className="museum-card-info">
            <h3>
              <span>{item.artwork.title}</span>
            </h3>
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
        {/*<ItemStatusBadges TODO AI this is unused, remove references or logic elsewhere that might have once used this
          alreadyOwned={alreadyOwned}
          collectorSaleLabel="for sale"
          consigned={consigned}
          item={item}
          researchTarget={researchTarget}
          showMint={false}
        />*/}
        {item.archivePermission?.allowed ? (
          <span className="item-property-badges museum-card-properties">
            <span className="item-property-badge property-archivable">
              archivable
            </span>
          </span>
        ) : null}
        <CompactStats
          item={item}
          mintDisplay="leaf"
          showLotteryLevel
        />
      </div>
    </div>
  );
}
