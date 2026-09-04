import {
  ArtworkImage,
  AttributeIcons,
  ItemStatusBadges,
} from "./shared";
import type { CSSProperties } from "react";
import type { ItemCardRendererProps } from "./types";

export default function AlbumCard({
  item,
  alreadyOwned,
  consigned,
  researchTarget,
}: ItemCardRendererProps) {
  return (
    <div className="render-card album-card">
      <div className="album-card-object">
        <div
          className="album-card-record"
          aria-label={`Vinyl record, ${Math.round(item.condition * 100)}% condition`}
          style={
            {
              "--album-art": `url("/api/artwork/${item.artwork_id}/image?variant=card")`,
              "--vinyl-wear": Math.max(
                0,
                Math.min(1, 1 - item.condition),
              ),
            } as CSSProperties
          }
        >
          <span className="album-card-record-foil" aria-hidden="true" />
          <span className="album-card-record-scratches" aria-hidden="true" />
          <span className="album-card-record-label">
            <AttributeIcons item={item} />
          </span>
        </div>
        <div className="album-card-sleeve">
          <ArtworkImage className="album-card-image" item={item} />
          <span className="album-card-sleeve-print" aria-hidden="true" />
          <section className="album-card-cover-copy">
            <h3>{item.artwork.title}</h3>
            <p className="render-card-artist">{item.artwork.artist}</p>
          </section>
          <span className="album-card-price-tag">
            ${item.values.actual.toLocaleString()}
          </span>
          {item.mint ? (
            <span className="album-card-new-sticker">NEW</span>
          ) : null}
          <ItemStatusBadges
            alreadyOwned={alreadyOwned}
            consigned={consigned}
            item={item}
            researchTarget={researchTarget}
            showMint={false}
            showUnlocked={false}
          />
          {item.unlocked ? (
            <span
              aria-label="Unlocked"
              className="album-card-unlocked"
              role="img"
            >
              ♫
            </span>
          ) : null}
          {item.lottery ? (
            <span
              aria-label={`Lottery level ${item.lottery}`}
              className="album-card-lottery"
            >
              L{item.lottery}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
