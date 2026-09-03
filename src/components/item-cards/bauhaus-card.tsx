import {
  ArtworkImage,
  AttributeIcons,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function BauhausCard({
  item,
  alreadyOwned,
  consigned,
  researchTarget,
}: ItemCardRendererProps) {
  return (
    <div className="render-card bauhaus-card">
      <span className="bauhaus-shape bauhaus-circle" />
      <span className="bauhaus-shape bauhaus-square" />
      <span className="bauhaus-shape bauhaus-line" />
      <header>
        <strong>AF</strong>
        <span>{item.artwork.rarity}</span>
        <span>{item.level.toString().padStart(2, "0")}</span>
      </header>
      <div className="bauhaus-card-image-frame">
        <ArtworkImage className="bauhaus-card-image" item={item} />
      </div>
      <section>
        <p>{item.artwork.artist}</p>
        <h3>{item.artwork.title}</h3>
        <span>
          {item.artwork.date} / {item.artwork.medium}
        </span>
      </section>
      <div className="bauhaus-card-states">
        {item.mint ? <i aria-label="Mint" className="fa fa-circle" /> : null}
        {item.unlocked ? (
          <i aria-label="Unlocked" className="fa fa-square" />
        ) : null}
        {item.lottery ? (
          <strong aria-label={`Lottery level ${item.lottery}`}>
            L{item.lottery}
          </strong>
        ) : null}
      </div>
      <AttributeIcons item={item} />
      <ItemStatusBadges
        alreadyOwned={alreadyOwned}
        consigned={consigned}
        item={item}
        researchTarget={researchTarget}
        showMint={false}
        showUnlocked={false}
      />
    </div>
  );
}
