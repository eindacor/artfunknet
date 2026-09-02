import type { CardRendererId } from "./types.ts";

export type CardCosmetic = {
  number: number;
  id: CardRendererId;
  name: string;
  description: string;
  price: number;
};

export type CardRendererPriceMap = Partial<
  Record<CardRendererId, number>
>;

export const CARD_COSMETICS: CardCosmetic[] = [
  {
    number: 1,
    id: "legacy",
    name: "OG",
    description: "The original. The best one.",
    price: 10_000_000_000,
  },
  {
    number: 2,
    id: "museum",
    name: "Museum Label",
    description: "Quiet, borderless editorial presentation.",
    price: 0,
  },
  {
    number: 3,
    id: "terminal",
    name: "Archive Terminal",
    description: "Minimal monochrome database readout.",
    price: 40_000,
  },
  {
    number: 4,
    id: "postcard",
    name: "Artist Postcard",
    description: "Landscape travel card with handwritten details.",
    price: 60_000,
  },
  {
    number: 5,
    id: "gilded",
    name: "Gilded Salon",
    description: "Ornate frame, classical typography, and provenance.",
    price: 125_000,
  },
  {
    number: 6,
    id: "arcade",
    name: "Neon Inventory",
    description: "Animated game-inventory HUD with scanlines.",
    price: 175_000,
  },
  {
    number: 7,
    id: "prismatic",
    name: "Prismatic Showcase",
    description: "Animated holographic foil and layered light.",
    price: 300_000,
  },
  {
    number: 8,
    id: "blueprint",
    name: "Curator Blueprint",
    description: "Measured drafting lines and a rarity-coded inspection seal.",
    price: 75_000,
  },
  {
    number: 9,
    id: "zine",
    name: "Downtown Zine",
    description: "Photocopied collage, torn labels, tape, and loud rarity ink.",
    price: 110_000,
  },
  {
    number: 10,
    id: "celestial",
    name: "Celestial Orbit",
    description: "A star chart with rarity-colored constellations and motion.",
    price: 250_000,
  },
  {
    number: 11,
    id: "reliquary",
    name: "Boss Reliquary",
    description: "An elaborate game-reward frame that escalates with rarity.",
    price: 400_000,
  },
];

export function getCardCosmetic(id: string): CardCosmetic | undefined {
  return CARD_COSMETICS.find((cosmetic) => cosmetic.id === id);
}

export function getOwnedCardRendererIds(
  rendererIds: readonly string[] | undefined,
): CardRendererId[] {
  return [
    ...new Set([
      "museum" as CardRendererId,
      ...(rendererIds ?? [])
        .map((id) => getCardCosmetic(id)?.id)
        .filter((id): id is CardRendererId => Boolean(id)),
    ]),
  ];
}

export function getActiveCardCosmetics(
  activeRendererIds: readonly string[],
  rendererPrices: CardRendererPriceMap = {},
): CardCosmetic[] {
  const active = new Set(activeRendererIds);
  return CARD_COSMETICS.filter((cosmetic) => active.has(cosmetic.id)).map(
    (cosmetic) => ({
      ...cosmetic,
      price: rendererPrices[cosmetic.id] ?? cosmetic.price,
    }),
  );
}

export function getSelectableCardCosmetics(
  activeRendererIds: readonly string[],
  ownedRendererIds: readonly string[] | undefined,
  rendererPrices: CardRendererPriceMap = {},
): CardCosmetic[] {
  const active = new Set(activeRendererIds);
  const owned = new Set(getOwnedCardRendererIds(ownedRendererIds));
  return CARD_COSMETICS.filter(
    (cosmetic) => active.has(cosmetic.id) || owned.has(cosmetic.id),
  ).map((cosmetic) => ({
    ...cosmetic,
    price: rendererPrices[cosmetic.id] ?? cosmetic.price,
  }));
}
