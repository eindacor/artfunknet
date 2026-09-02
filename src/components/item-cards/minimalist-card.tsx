import {
  ArtworkImage,
  AttributeIcons,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function MinimalistCard({
  item,
  alreadyOwned,
  consigned,
  researchTarget,
}: ItemCardRendererProps) {
  const marks = [
    item.mint ? ["mint", "Mint"] : null,
    item.lottery ? ["lottery", `Raffle potency tier ${item.lottery}`] : null,
    item.unlocked ? ["unlocked", "Unlocked"] : null,
    item.seasonal ? ["seasonal", "Seasonal"] : null,
    item.foil ? ["foil", "Foil"] : null,
    item.original ? ["original", "Original"] : null,
    item.vintage ? ["vintage", "Vintage"] : null,
  ].filter((mark): mark is string[] => mark !== null);

  return (
    <div className="render-card minimalist-card">
      <ArtworkImage className="minimalist-card-image" item={item} />
      <div className="minimalist-card-shade" />
      <header>
        <span className="minimalist-card-artist">
          <i aria-hidden="true" className="minimalist-card-rarity-mark" />
          {item.artwork.artist}
        </span>
        <span>{item.artwork.date}</span>
      </header>
      <section>
        <h3>{item.artwork.title}</h3>
        <p>{item.artwork.medium}</p>
      </section>
      <footer>
        <span className="minimalist-card-marks">
          {marks.map(([key, label]) => (
            <i
              aria-label={label}
              className={`minimalist-mark minimalist-mark-${key}`}
              key={key}
            />
          ))}
        </span>
        <span className="minimalist-card-level">L{item.level}</span>
        <AttributeIcons item={item} />
      </footer>
      <ItemStatusBadges
        alreadyOwned={alreadyOwned}
        consigned={consigned}
        item={item}
        researchTarget={researchTarget}
        showFoil={false}
        showMint={false}
        showUnlocked={false}
      />
    </div>
  );
}
