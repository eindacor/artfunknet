
import {
  ArtworkImage,
  AttributeIcons,
} from "./shared";
import type { CSSProperties } from "react";
import type { ItemCardRendererProps } from "./types";

export default function PrismaticCard({
  item,
  alreadyOwned,
  consigned,
  researchTarget,
}: ItemCardRendererProps) {
  return (
    <div className="render-card comic-card">
      <div
        className="comic-card-cover"
        data-rarity={item.artwork.rarity}
        data-seasonal={item.seasonal ? "true" : undefined}
        data-mint={item.mint ? "true" : undefined}
        data-vintage={item.vintage ? "true" : undefined}
        data-owned={alreadyOwned ? "true" : undefined}
        data-consigned={consigned ? "true" : undefined}
        data-research-target={researchTarget ? "true" : undefined}
        style={
          {
            "--comic-wear": Math.max(
              0,
              Math.min(1, 1 - item.condition),
            ),
            "--comic-art": `url("/api/artwork/${item.artwork_id}/image?variant=card")`,
          } as CSSProperties
        }
      >
        {/* Printed cover artwork */}
        <div className="comic-card-art">
          <ArtworkImage
            className="comic-card-image"
            item={item}
          />
          <span
            className="comic-card-art-tint"
            aria-hidden="true"
          />
          <span
            className="comic-card-halftone"
            aria-hidden="true"
          />
        </div>

        {/* Aged paper, worn ink, and cover finish */}
        <span className="comic-card-paper" aria-hidden="true" />
        <span className="comic-card-mint" aria-hidden="true" />
        <span className="comic-card-vintage" aria-hidden="true" />
        <span className="comic-card-seasonal" aria-hidden="true" />
        <span className="comic-card-wear" aria-hidden="true" />

        {/* Publisher masthead */}
        <header className="comic-card-masthead">
          <span className="comic-card-publisher">
            ART FUNKEL
          </span>
          <div className="comic-card-issue">
            <span>{item.seasonal ? "LIMITED" : "COLLECTOR"}</span>
            <strong>EDITION</strong>
            <span>{item.mint ? ("NO. 001") : "NO. 657"}</span>
          </div>
        </header>

        {/* Main title treatment */}
        <section className="comic-card-title-block">
          <p className="comic-card-kicker">
            THE ARTWORK COLLECTION
          </p>
          <h3 className="comic-card-title">
            {item.artwork.title}
          </h3>
          <p className="comic-card-artist">
            BY {item.artwork.artist}
          </p>
        </section>

        {/* Classic comic-book burst */}
        <div
          className="comic-card-burst"
          data-unlocked={item.unlocked ? "true" : undefined}
          aria-hidden="true"
        >
          {item.unlocked ? (
            <span className="comic-card-burst-unlocked">
              <i className="fa fa-lock" />
              <strong>!</strong>
            </span>
          ) : (
            <strong>ART!</strong>
          )}
        </div>

        {/* Price and issue metadata */}
        <div className="comic-card-price">
          <strong>
            ${item.values.actual.toLocaleString()}
          </strong>
        </div>

        <div className="comic-card-bottom">
          <span
            className={`comic-card-rarity rarity-text ${item.artwork.rarity}`}
          >
            {item.artwork.rarity}
          </span>
          <span className="comic-card-condition">
            {Math.round(item.condition * 100)}% CONDITION
          </span>
        </div>

        {/* Existing item attributes */}
        <div className="comic-card-attributes">
          <AttributeIcons item={item} />
        </div>

        {item.mint ? (
          <span className="comic-card-new">
            MINT!
          </span>
        ) : null}

        {item.lottery ? (
          <span
            className="comic-card-lottery"
            aria-label={`Lottery level ${item.lottery}`}
          >
            L{item.lottery}
          </span>
        ) : null}
      </div>
    </div>
  );
}
