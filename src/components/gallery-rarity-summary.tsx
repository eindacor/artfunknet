import type { ArtworkRarity } from "@/server/gameplay";

export default function GalleryRaritySummary({ rarities }: { rarities: readonly ArtworkRarity[] }) {
  return <div aria-label="Featured artwork rarities" className="gallery-rarity-summary">
    {rarities.map((rarity, index) => <span aria-label={`${rarity} artwork`} className="gallery-rarity-square"
      data-rarity={rarity} key={`${rarity}-${index}`} role="img" title={rarity} />)}
  </div>;
}
