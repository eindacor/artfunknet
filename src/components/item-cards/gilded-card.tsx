import {
  ArtworkImage,
  AttributeIcons,
  getActiveLegendaryAttribute,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function GildedCard(props: ItemCardRendererProps) {
  const { item, alreadyOwned, legendaryAttributes } = props;
  const legendary = getActiveLegendaryAttribute(item, legendaryAttributes);
  return (
    <div className="render-card gilded-card">
      <div className="gilded-card-corner top-left">◆</div>
      <div className="gilded-card-corner top-right">◆</div>
      <div className="gilded-card-corner bottom-left">◆</div>
      <div className="gilded-card-corner bottom-right">◆</div>
      <header>
        <span className="card-rarity-label">{item.artwork.rarity}</span>
        <h3>{item.artwork.title}</h3>
        <p className="render-card-artist">{item.artwork.artist}</p>
      </header>
      <div className="gilded-card-frame">
        <ArtworkImage className="gilded-card-image" item={item} />
      </div>
      <ItemStatusBadges item={item} alreadyOwned={alreadyOwned} />
      <div className="gilded-card-stats">
        <span>Level {item.level}</span>
        <span>{Math.round(item.condition * 100)}% condition</span>
        <span>${item.values.actual.toLocaleString()}</span>
      </div>
      <AttributeIcons item={item} />
      {legendary ? (
        <p className="gilded-card-flavor">
          &ldquo;{legendary.flavorText}&rdquo;
        </p>
      ) : null}
    </div>
  );
}
