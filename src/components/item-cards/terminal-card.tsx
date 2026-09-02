import {
  ArtworkImage,
  AttributeIcons,
  ItemStatusBadges,
} from "./shared";
import type { ItemCardRendererProps } from "./types";

export default function TerminalCard(props: ItemCardRendererProps) {
  const { item, alreadyOwned } = props;
  return (
    <div className="render-card terminal-card">
      <header>
        <span>ARTFUNKEL ITEM DATABASE</span>
        <span className="terminal-card-cursor">_</span>
      </header>
      <ArtworkImage className="terminal-card-image" item={item} />
      <div className="terminal-card-copy">
        <ItemStatusBadges item={item} alreadyOwned={alreadyOwned} />
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
