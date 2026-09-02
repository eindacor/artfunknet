import {
  ArtworkImage,
  AttributeIcons,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function ZineCard({
  item,
  alreadyOwned,
}: ItemCardRendererProps) {
  return (
    <div className="render-card zine-card">
      <span className="zine-card-tape" />
      <span className="zine-card-state-stickers">
        {item.mint ? (
          <i
            aria-label="Mint"
            className="fa fa-leaf zine-state-sticker zine-state-mint"
          />
        ) : null}
        {item.unlocked ? (
          <i
            aria-label="Unlocked"
            className="fa fa-unlock-alt zine-state-sticker zine-state-unlocked"
          />
        ) : null}
        {item.lottery > 0 ? (
          <span
            aria-label={`Lottery level ${item.lottery}`}
            className="zine-state-sticker zine-state-lottery"
          >
            L{item.lottery}
          </span>
        ) : null}
      </span>
      <header>
        <span>ISSUE #{item.level.toString().padStart(2, "0")}</span>
        <strong className="card-rarity-label">
          {item.artwork.rarity}
        </strong>
      </header>
      <div className="zine-card-image-wrap">
        <ArtworkImage className="zine-card-image" item={item} />
        <span className="zine-card-value">
          ${item.values.actual.toLocaleString()}
        </span>
      </div>
      <section>
        <ItemStatusBadges
          alreadyOwned={alreadyOwned}
          collectorSaleLabel="for sale"
          item={item}
          showMint={false}
          showOwned={false}
        />
        <h3>{item.artwork.title}</h3>
        <p className="render-card-artist">ART BY {item.artwork.artist}</p>
        <p>
          {item.artwork.genre} / {Math.round(item.condition * 100)}% COND.
        </p>
      </section>
      <AttributeIcons item={item} />
    </div>
  );
}
