import {
  ArtworkImage,
  AttributeIcons,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function TerminalCard(props: ItemCardRendererProps) {
  const { item, alreadyOwned, consigned, researchTarget } = props;
  return (
    <div
      className={`render-card terminal-card ${
        item.unlocked ? "terminal-card-unlocked" : ""
      }`}
    >
      <header>
        <span>
          {item.seasonal
            ? `/root/artfunkel/archive/${item._id.slice(-8)}`
            : "ARTFUNKEL ITEM"}
        </span>
        <span className="terminal-card-cursor">_</span>
      </header>
      {item.unlocked ? (
        <div className="terminal-card-state-readout">
          <span className="terminal-card-state terminal-card-state-unlocked">
            <i aria-hidden="true" className="fa fa-unlock-alt" />
            SECURITY BREACH // ACCESS OVERRIDE
          </span>
        </div>
      ) : null}
      <ArtworkImage className="terminal-card-image" item={item} />
      <div className="terminal-card-copy">
        <ItemStatusBadges
          item={item}
          alreadyOwned={alreadyOwned}
          consigned={consigned}
          researchTarget={researchTarget}
        />
        <p>&gt; TITLE: {item.artwork.title}</p>
        <p className="render-card-artist">
          &gt; ARTIST: {item.artwork.artist}
        </p>
        <p>&gt; MEDIUM: {item.artwork.medium}</p>
        <p>&gt; DATE: {item.artwork.date}</p>
        <p className="card-rarity-label">
          &gt; CLASS: {item.artwork.rarity.toUpperCase()}
        </p>
        <p>&gt; LVL: {item.level}</p>
        <p>&gt; CONDITION: {Math.round(item.condition * 100)}%</p>
        <p>&gt; VALUE: ${item.values.actual.toLocaleString()}</p>
        <AttributeIcons item={item} />
      </div>
    </div>
  );
}
