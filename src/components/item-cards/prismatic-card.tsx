import {
  ArtworkImage,
  AttributeIcons,
  CompactStats,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function PrismaticCard(props: ItemCardRendererProps) {
  const { item, alreadyOwned, consigned, researchTarget } = props;
  return (
    <div className="render-card prismatic-card">
      <div className="prismatic-card-aura" />
      <div className="prismatic-card-sparkles" />
      <header>
        <span className="card-rarity-label">{item.artwork.rarity}</span>
        <strong>✦ {item.level} ✦</strong>
      </header>
      <div className="prismatic-card-image-frame">
        <ArtworkImage className="prismatic-card-image" item={item} />
        <div className="prismatic-card-shine" />
      </div>
      <section>
        <ItemStatusBadges
          item={item}
          alreadyOwned={alreadyOwned}
          consigned={consigned}
          researchTarget={researchTarget}
        />
        <h3>{item.artwork.title}</h3>
        <p className="render-card-artist">{item.artwork.artist}</p>
        <CompactStats item={item} />
        <AttributeIcons item={item} />
      </section>
    </div>
  );
}
