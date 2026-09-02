import {
  ARTWORK_RARITIES,
  type ArtworkRarity,
  type LootData,
} from "./gameplay.ts";

export type SeasonalArtworkSelections = Record<
  ArtworkRarity,
  string | null
>;

type SeasonalArtworkCandidate = {
  _id: string;
  rarity: ArtworkRarity;
  active: boolean;
};

export function getSeasonalArtworkSelections(
  lootData: Pick<LootData, "seasonal_items">,
): SeasonalArtworkSelections {
  return Object.fromEntries(
    ARTWORK_RARITIES.map((rarity) => [
      rarity,
      lootData.seasonal_items[rarity]?.[0] ?? null,
    ]),
  ) as SeasonalArtworkSelections;
}

export function validateSeasonalArtworkSelections(
  input: unknown,
  artworks: readonly SeasonalArtworkCandidate[],
):
  | { ok: true; value: SeasonalArtworkSelections }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Seasonal artwork selections are required." };
  }

  const record = input as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter(
    (key) => !ARTWORK_RARITIES.includes(key as ArtworkRarity),
  );
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      error: `Unknown rarity: ${unknownKeys.join(", ")}.`,
    };
  }

  const candidates = new Map(artworks.map((artwork) => [artwork._id, artwork]));
  const selections = {} as SeasonalArtworkSelections;
  for (const rarity of ARTWORK_RARITIES) {
    const selection = record[rarity];
    if (selection !== null && typeof selection !== "string") {
      return {
        ok: false,
        error: `Choose a valid ${rarity} artwork or select none.`,
      };
    }
    if (selection === null || selection.length === 0) {
      selections[rarity] = null;
      continue;
    }

    const artwork = candidates.get(selection);
    if (!artwork || !artwork.active || artwork.rarity !== rarity) {
      return {
        ok: false,
        error: `The selected ${rarity} artwork is unavailable.`,
      };
    }
    selections[rarity] = artwork._id;
  }

  return { ok: true, value: selections };
}

export function toSeasonalArtworkMap(
  selections: SeasonalArtworkSelections,
): LootData["seasonal_items"] {
  return Object.fromEntries(
    ARTWORK_RARITIES.map((rarity) => [
      rarity,
      selections[rarity] ? [selections[rarity]] : [],
    ]),
  ) as LootData["seasonal_items"];
}
