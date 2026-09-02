import type { CSSProperties } from "react";

import {
  ArtworkImage,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function CircleCard({
  item,
  alreadyOwned,
  consigned,
  researchTarget,
}: ItemCardRendererProps) {
  const attributes = [
    ...item.attributes.unlocked.map((attribute) => ({
      ...attribute,
      type: "unlocked",
    })),
    ...item.attributes.locked.map((attribute) => ({
      ...attribute,
      type: "locked",
    })),
    ...item.attributes.special.map((attribute) => ({
      ...attribute,
      type: "special",
    })),
  ];

  return (
    <div className="render-card circle-card">
      <div className="circle-card-system">
        <span className="circle-card-ring ring-outer" />
        <span className="circle-card-ring ring-middle" />
        <span className="circle-card-ring ring-inner" />
        {attributes.map((attribute, index) => (
          <span
            className={`circle-card-attribute-ring ${
              index % 2 === 0 ? "orbit-clockwise" : "orbit-counterclockwise"
            }`}
            key={`${attribute.type}-${attribute._id}`}
            style={
              {
                "--circle-attribute-inset": `${Math.max(
                  5,
                  54 - index * 8,
                )}px`,
                "--circle-attribute-duration": `${90 + index * 18}s`,
              } as CSSProperties
            }
          >
            <i
              aria-label={`${attribute.npc_name}, ${Math.round(
                (attribute.value ?? 0) * 100,
              )}%, ${attribute.type}`}
              className={`fa ${attribute.icon} attribute ${attribute.type}`}
            />
          </span>
        ))}
        <span className="circle-card-rarity">{item.artwork.rarity}</span>
        <span className="circle-card-level">LEVEL {item.level}</span>
        <div className="circle-card-image-frame">
          <ArtworkImage className="circle-card-image" item={item} />
        </div>
        {item.mint ? (
          <span className="circle-card-orbiter orbiter-mint">
            <i aria-label="Mint" className="fa fa-leaf" />
          </span>
        ) : null}
        {item.unlocked ? (
          <span className="circle-card-orbiter orbiter-unlocked">
            <i aria-label="Unlocked" className="fa fa-unlock-alt" />
          </span>
        ) : null}
        {item.lottery ? (
          <span
            aria-label={`Raffle potency tier ${item.lottery}`}
            className="circle-card-lottery"
          >
            L{item.lottery}
          </span>
        ) : null}
      </div>
      <section>
        <h3>{item.artwork.title}</h3>
        <p>{item.artwork.artist}</p>
        <small>
          {item.artwork.date} · {Math.round(item.condition * 100)}%
        </small>
      </section>
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
