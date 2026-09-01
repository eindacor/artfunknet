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
}: ItemCardRendererProps) {
  return (
    <div className="render-card celestial-card">
      <div className="celestial-card-stars" />
      <div className="celestial-card-orbit orbit-one" />
      <div className="celestial-card-orbit orbit-two" />
      <header>
        <span className="card-rarity-label">{item.artwork.rarity}</span>
        <strong>ORBIT {item.level}</strong>
      </header>
      <div className="celestial-card-image-frame">
        <ArtworkImage className="celestial-card-image" item={item} />
      </div>
      <section>
        <ItemStatusBadges item={item} alreadyOwned={alreadyOwned} />
        <h3>{item.artwork.title}</h3>
        <p>{item.artwork.artist}</p>
        <CompactStats item={item} />
        <AttributeIcons item={item} />
      </section>
    </div>
  );
}
