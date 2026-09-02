import {
  ArtworkImage,
  AttributeIcons,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function AbstractCard({
  item,
  alreadyOwned,
  consigned,
  researchTarget,
}: ItemCardRendererProps) {
  return (
    <div className="render-card abstract-card">
      <span className="abstract-shape abstract-shape-one" />
      <span className="abstract-shape abstract-shape-two" />
      <span className="abstract-shape abstract-shape-three" />
      <div className="abstract-card-image-slice">
        <ArtworkImage className="abstract-card-image" item={item} />
      </div>
      <header>
        <span
          aria-label={`${item.artwork.rarity} rarity`}
          className="abstract-rarity-shape"
        />
        <strong>{item.level}</strong>
      </header>
      <section>
        <h3>{item.artwork.title}</h3>
        <p>{item.artwork.artist}</p>
        <small>{item.artwork.medium}</small>
      </section>
      <div className="abstract-card-symbols">
        {item.mint ? (
          <i aria-label="Mint" className="fa fa-compass" />
        ) : null}
        {item.unlocked ? (
          <i aria-label="Unlocked" className="fa fa-key" />
        ) : null}
        {item.lottery ? (
          <span aria-label={`Raffle potency tier ${item.lottery}`}>
            <i aria-hidden="true" className="fa fa-trophy" />
            {item.lottery}
          </span>
        ) : null}
        {item.seasonal ? (
          <i aria-label="Seasonal" className="fa fa-adjust" />
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
