
import {
  ArtworkImage,
  AttributeIcons,
  useArtworkImageSource,
} from "./shared";
import type { CSSProperties } from "react";
import type { ItemCardRendererProps } from "./types";

function getComicTitleLayout(title: string) {
  const characters = Array.from(title.trim().toUpperCase());
  const widthUnits = Math.max(
    1,
    characters.reduce((total, character) => {
      if (/\s/.test(character)) return total + 0.45;
      if (/[MW@%&]/.test(character)) return total + 1.25;
      if (/[I1JL]/.test(character)) return total + 0.6;
      return total + 1;
    }, 0),
  );
  const lines = widthUnits <= 16 ? 1 : 2;
  const fontSizeCqw = Math.min(
    lines === 1 ? 60 : 15,
    Math.max(lines === 1 ? 8.5 : 5.2, (lines === 1 ? 154 : 300) / widthUnits),
  );
  const letterSpacingEm =
    lines === 1 && widthUnits < 10
      ? Math.min(0.18, (10 - widthUnits) * 0.025)
      : -0.025;
  const estimatedLineWidth =
    (
      widthUnits * 0.6 * fontSizeCqw +
      Math.max(0, characters.length - 1) *
        letterSpacingEm *
        fontSizeCqw
    ) / lines;
  const scaleX = Math.min(
    lines === 1 ? 2.5 : 1.2,
    Math.max(0.85, 92 / Math.max(1, estimatedLineWidth)),
  );
  const estimatedHeight =
    fontSizeCqw * (lines === 1 ? 0.8 : 0.86) * lines;
  const scaleY = Math.min(
    2.35,
    Math.max(0.45, 22 / Math.max(1, estimatedHeight)),
  );

  return { fontSizeCqw, letterSpacingEm, lines, scaleX, scaleY };
}

export default function PrismaticCard({
  item,
  alreadyOwned,
  consigned,
  researchTarget,
}: ItemCardRendererProps) {
  const sourceUrl = useArtworkImageSource(item.artwork_id, item.artwork.image);
  const titleLayout = getComicTitleLayout(item.artwork.title);

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
            "--comic-art": `url("${sourceUrl}")`,
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
            <span>{item.seasonal ? "LIMITED EDITION | " : null}</span>
            <span>{item.mint ? ("NO. 001") : "NO. 657"}</span>
          </div>
        </header>

        {/* Main title treatment */}
        <section data-rarity={item.artwork.rarity} className="comic-card-title-block">
          <h3
            className="comic-card-title"
            data-title={item.artwork.title}
            data-title-lines={titleLayout.lines}
            style={
              {
                "--comic-title-font-size": `${titleLayout.fontSizeCqw}cqw`,
                "--comic-title-letter-spacing": `${titleLayout.letterSpacingEm}em`,
                "--comic-title-scale-x": titleLayout.scaleX,
                "--comic-title-scale-y": titleLayout.scaleY,
              } as CSSProperties
            }
          >
            <span>{item.artwork.title}</span>
          </h3>
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

        <div className="comic-card-lower-left">
          <p className="comic-card-byline">
            by {item.artwork.artist}
          </p>
          {/* Existing item attributes */}
          <div className="comic-card-attributes">
            <AttributeIcons item={item} />
          </div>
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
