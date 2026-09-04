import {
  ArtworkImage,
  AttributeIcons,
  CompactStats,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function CollectibleCard({
  item,
  alreadyOwned,
  consigned,
  researchTarget,
}: ItemCardRendererProps) {
  return (
    <div className="render-card collectible-card">
      <div className="collectible-card-sparkles" aria-hidden="true" />
      <header>
        <span className="collectible-card-series">ARTIFACT SERIES</span>
        <span className="collectible-card-level">PROMO {item.level}</span>
      </header>
      <div className="collectible-card-title-row">
        <h3>{item.artwork.title}</h3>
        <strong className="card-rarity-label">{item.artwork.rarity}</strong>
      </div>
      <div className="collectible-card-art-frame">
        <ArtworkImage className="collectible-card-image" item={item} />
        <span className="collectible-card-holo" aria-hidden="true" />
      </div>
      <section>
        <p className="render-card-artist">ILLUSTRATED BY {item.artwork.artist}</p>
        <CompactStats item={item} mintDisplay="leaf" />
        <AttributeIcons item={item} />
      </section>
      <footer>
        <span>AF / {item.artwork.date}</span>
        <ItemStatusBadges
          alreadyOwned={alreadyOwned}
          consigned={consigned}
          item={item}
          researchTarget={researchTarget}
          showMint={false}
          showUnlocked={false}
        />
      </footer>
    </div>
  );
}
