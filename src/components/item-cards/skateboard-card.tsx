import {
  ArtworkImage,
  AttributeIcons,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function SkateboardCard({
  item,
  alreadyOwned,
  consigned,
  researchTarget,
}: ItemCardRendererProps) {
  return (
    <div className="render-card skateboard-card">
      <div className="skateboard-card-deck">
        <ArtworkImage className="skateboard-card-image" item={item} />
        <span className="skateboard-card-grip" aria-hidden="true" />
        {item.seasonal ? (
          <span className="skateboard-card-scuffs" aria-label="Seasonal scuffs" />
        ) : null}
        <SkateboardTruck
          position="front"
          raffle={Boolean(item.lottery)}
        />
        <SkateboardTruck
          position="back"
          raffle={Boolean(item.lottery)}
        />
        <section className="skateboard-card-label">
          <h3>{item.artwork.title}</h3>
          <p className="render-card-artist">{item.artwork.artist}</p>
        </section>
        <div className="skateboard-card-stickers">
          <AttributeIcons item={item} />
        </div>
        {item.unlocked ? (
          <span
            className="skateboard-card-unlocked"
            aria-label="Unlocked"
            role="img"
          >
            <i aria-hidden="true" className="fa fa-unlock-alt" />
          </span>
        ) : null}
        {item.mint ? (
          <span className="skateboard-card-mint" aria-label="Mint" role="img">
            <i aria-hidden="true" className="fa fa-leaf" />
          </span>
        ) : null}
        <ItemStatusBadges
          alreadyOwned={alreadyOwned}
          consigned={consigned}
          item={item}
          researchTarget={researchTarget}
          showMint={false}
          showUnlocked={false}
        />
      </div>
    </div>
  );
}

function SkateboardTruck({
  position,
  raffle,
}: {
  position: "front" | "back";
  raffle: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`skateboard-card-truck skateboard-card-truck-${position}${
        raffle ? " lottery" : ""
      }`}
    >
      <span className="skateboard-card-wheel wheel-left" />
      <span className="skateboard-card-truck-hanger" />
      <span className="skateboard-card-truck-baseplate" />
      <span className="skateboard-card-truck-kingpin" />
      <span className="skateboard-card-wheel wheel-right" />
    </span>
  );
}
