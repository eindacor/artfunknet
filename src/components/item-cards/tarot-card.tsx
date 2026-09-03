import {
  ArtworkImage,
  AttributeIcons,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function TarotCard({
  item,
  alreadyOwned,
  consigned,
  researchTarget,
}: ItemCardRendererProps) {
  return (
    <div className="render-card tarot-card">
      <span className="tarot-card-corner tarot-card-corner-top" aria-hidden="true">
        ✦
      </span>
      <span className="tarot-card-corner tarot-card-corner-bottom" aria-hidden="true">
        ✦
      </span>
      <div className="tarot-card-pattern" aria-hidden="true" />
      <header>
        <span className="tarot-card-arcana">ARCANA {item.level.toString().padStart(2, "0")}</span>
        <strong className="card-rarity-label">{item.artwork.rarity}</strong>
      </header>
      <div className="tarot-card-art-frame">
        <ArtworkImage className="tarot-card-image" item={item} />
        <span className="tarot-card-art-oval" aria-hidden="true" />
      </div>
      <section>
        <ItemStatusBadges
          alreadyOwned={alreadyOwned}
          consigned={consigned}
          item={item}
          researchTarget={researchTarget}
          showMint={false}
          showUnlocked={false}
        />
        <h3>{item.artwork.title}</h3>
        <p className="render-card-artist">{item.artwork.artist}</p>
        <span className="tarot-card-meta">
          {item.artwork.genre} · {Math.round(item.condition * 100)}% condition
        </span>
        <AttributeIcons item={item} />
      </section>
      <div className="tarot-card-state-icons">
        {item.mint ? (
          <span aria-label="Mint condition" role="img">
            ★
          </span>
        ) : null}
        {item.unlocked ? (
          <span aria-label="Unlocked" role="img">
            ★
          </span>
        ) : null}
      </div>
    </div>
  );
}
