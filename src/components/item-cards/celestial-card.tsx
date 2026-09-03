import {
  ArtworkImage,
  AttributeIcons,
  CompactStats,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function CelestialCard({
  item,
  alreadyOwned,
  consigned,
  researchTarget,
}: ItemCardRendererProps) {
  return (
    <div className="render-card celestial-card">
      <div className="celestial-card-stars" />
      <div className="celestial-card-orbit orbit-one" />
      <div className="celestial-card-orbit orbit-two" />
      {item.seasonal ? (
        <div className="celestial-card-seasonal" aria-hidden="true">
          <i className="fa fa-rocket" />
          <span className="asteroid asteroid-one" />
          <span className="asteroid asteroid-two" />
          <span className="asteroid asteroid-three" />
        </div>
      ) : null}
      <header>
        <span className="card-rarity-label">{item.artwork.rarity}</span>
        {item.lottery > 0 ? (
          <span
            aria-label={`Lottery level ${item.lottery}`}
            className="celestial-card-lottery"
          >
            <i aria-hidden="true" className="fa fa-star" />
            L{item.lottery}
            <i aria-hidden="true" className="fa fa-star" />
          </span>
        ) : null}
        <strong>ORBIT {item.level}</strong>
      </header>
      <div className="celestial-card-image-frame">
        <ArtworkImage className="celestial-card-image" item={item} />
      </div>
      <section>
        <ItemStatusBadges
          item={item}
          alreadyOwned={alreadyOwned}
          consigned={consigned}
          researchTarget={researchTarget}
          showMint={false}
        />
        <h3>{item.artwork.title}</h3>
        <p className="render-card-artist">{item.artwork.artist}</p>
        <CompactStats item={item} />
        <AttributeIcons item={item} />
      </section>
      {item.mint || item.unlocked ? (
        <div className="celestial-card-state-icons">
          {item.mint ? (
            <i aria-label="Mint condition" className="fa fa-leaf" />
          ) : null}
          {item.unlocked ? (
            <i aria-label="Unlocked" className="fa fa-unlock-alt" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
