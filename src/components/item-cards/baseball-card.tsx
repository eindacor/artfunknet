import {
  ArtworkImage,
  AttributeIcons,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function BaseballCard({
  item,
  alreadyOwned,
  consigned,
  researchTarget,
}: ItemCardRendererProps) {
  const playerNumber = item.lottery || getArtworkNumber(item.artwork_id);
  const grade = item.mint
    ? "10 GEM"
    : `${Math.max(1, item.condition * 10).toFixed(1)}`;

  return (
    <div className="render-card baseball-card">
      <div className="baseball-card-slab">
        <header className="baseball-card-grade">
          <span className="baseball-card-grader">AFG</span>
          <span>
            <strong>{item.artwork.title}</strong>
            <small>{item.artwork.artist}</small>
          </span>
          <span className="baseball-card-grade-score">
            <strong>{grade}</strong>
            <small>ART GRADE</small>
          </span>
        </header>
        <div className="baseball-card-face">
          <ArtworkImage className="baseball-card-image" item={item} />
          <span
            aria-label={item.seasonal ? "Seasonal hockey card" : "Baseball card"}
            className={`baseball-card-sport-icon ${
              item.seasonal ? "hockey" : "baseball"
            }`}
          />
          <span
            className={`baseball-card-player-number ${
              item.lottery ? "lottery" : ""
            }`}
          >
            #{playerNumber}
          </span>
          <div className="baseball-card-nameplate">
            <span>
              <strong>{item.artwork.title}</strong>
              <small>{item.artwork.artist}</small>
            </span>
            <span className="baseball-card-team">
              TEAM
              <strong>
                {item.unlocked ? "FREE AGENT" : "ARTFORD ATHLETIC"}
              </strong>
            </span>
          </div>
        </div>
        <footer>
          <span>{item.artwork.rarity}</span>
          <span>PROMO {item.level}</span>
          <span>{Math.round(item.condition * 100)}%</span>
          <AttributeIcons item={item} />
        </footer>
      </div>
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

function getArtworkNumber(artworkId: string): number {
  let hash = 0;
  for (const character of artworkId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return (hash % 99) + 1;
}
