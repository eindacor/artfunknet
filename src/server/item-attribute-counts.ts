import type { ArtworkRarity } from "./gameplay.ts";

export type ItemAttributeCounts = {
  locked: number;
  unlocked: number;
};

export function getItemAttributeCounts(
  rarity: ArtworkRarity,
  itemIsUnlocked: boolean,
): ItemAttributeCounts {
  if (rarity === "masterpiece") {
    return {
      locked: itemIsUnlocked ? 0 : 1,
      unlocked: itemIsUnlocked ? 4 : 3,
    };
  }
  return {
    locked: rarity === "common" || itemIsUnlocked ? 0 : 1,
    unlocked: rarity === "common" || !itemIsUnlocked ? 1 : 2,
  };
}
