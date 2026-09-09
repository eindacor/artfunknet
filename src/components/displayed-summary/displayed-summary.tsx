import type { ArtworkRarity } from "@/server/gameplay";

import styles from "./displayed-summary.module.css";
import stylesBrash from './displayed-summary.brash.module.css';

export default function DisplayedSummary({
  flavor,
  theme,
  rarities,
  displayCapacity,
}: {
  flavor?: 'brash'
  theme?: 'museum';
  rarities: ArtworkRarity[];
  displayCapacity: number;
}) {
  const emptySlots = Math.max(0, displayCapacity - rarities.length);
  const styling = flavor ? stylesBrash : styles;
  const gap = flavor ? 'gap-1.5' : 'gap-1';

  return (
    <div aria-label="Displayed artwork rarities" className={`inline-flex flex-wrap ${gap}`}>
      {rarities.map((rarity, index) => (
        <span
          aria-label={`${rarity} artwork`}
          className={styling.square}
          data-rarity={rarity}
          key={`${rarity}-${index}`}
          role="img"
          title={rarity}
        />
      ))}
      {Array.from({ length: emptySlots }, (_, index) => (
        <span
          aria-label="Available slot"
          className={styling.square}
          key={`empty-${index}`}
          role="img"
          title="Empty display slot"
          data-theme={theme}
        />
      ))}
    </div>
  );
}
