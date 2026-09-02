import {
  CARD_RENDERER_IDS,
  type CardRendererId,
} from "./types.ts";

export type CardCosmetic = {
  number: number;
  id: CardRendererId;
  name: string;
  description: string;
};

export type CardStyleInventory = Partial<Record<CardRendererId, number>>;
export type DroppableCardRendererId = Exclude<CardRendererId, "museum">;

export const DROPPABLE_CARD_RENDERER_IDS = CARD_RENDERER_IDS.filter(
  (id): id is DroppableCardRendererId => id !== "museum",
);

export const CARD_COSMETICS: CardCosmetic[] = [
  {
    number: 1,
    id: "legacy",
    name: "OG",
    description: "The original. The best one.",
  },
  {
    number: 2,
    id: "museum",
    name: "Museum Label",
    description: "Quiet, borderless editorial presentation.",
  },
  {
    number: 3,
    id: "terminal",
    name: "Archive Terminal",
    description: "Minimal monochrome database readout.",
  },
  {
    number: 4,
    id: "postcard",
    name: "Artist Postcard",
    description: "Landscape travel card with handwritten details.",
  },
  {
    number: 5,
    id: "gilded",
    name: "Gilded Salon",
    description: "Ornate frame, classical typography, and provenance.",
  },
  {
    number: 6,
    id: "arcade",
    name: "Neon Inventory",
    description: "Animated game-inventory HUD with scanlines.",
  },
  {
    number: 7,
    id: "prismatic",
    name: "Prismatic Showcase",
    description: "Animated holographic foil and layered light.",
  },
  {
    number: 8,
    id: "blueprint",
    name: "Curator Blueprint",
    description: "Measured drafting lines and a rarity-coded inspection seal.",
  },
  {
    number: 9,
    id: "zine",
    name: "Downtown Zine",
    description: "Photocopied collage, torn labels, tape, and loud rarity ink.",
  },
  {
    number: 10,
    id: "celestial",
    name: "Celestial Orbit",
    description: "A star chart with rarity-colored constellations and motion.",
  },
  {
    number: 11,
    id: "reliquary",
    name: "Boss Reliquary",
    description: "An elaborate game-reward frame that escalates with rarity.",
  },
  {
    number: 12,
    id: "baseball",
    name: "Gallery All-Star",
    description: "A graded sports card slab for museum-league standouts.",
  },
  {
    number: 13,
    id: "minimalist",
    name: "Full Bleed",
    description: "A nearly borderless artwork view with restrained state marks.",
  },
  {
    number: 14,
    id: "bauhaus",
    name: "Bauhaus",
    description: "Primary geometry, disciplined type, and asymmetric structure.",
  },
  {
    number: 15,
    id: "abstract",
    name: "Near Meaning",
    description: "Broken shapes, angled type, and deliberately approximate symbols.",
  },
  {
    number: 16,
    id: "circle",
    name: "Concentric",
    description: "Artwork and information arranged as a system of orbiting circles.",
  },
];

export function getCardCosmetic(id: string): CardCosmetic | undefined {
  return CARD_COSMETICS.find((cosmetic) => cosmetic.id === id);
}

export function getCardStyleInventory(
  inventory: Readonly<Record<string, unknown>> | undefined,
): CardStyleInventory {
  return Object.fromEntries(
    Object.entries(inventory ?? {}).flatMap(([id, quantity]) => {
      const cosmetic = getCardCosmetic(id);
      if (
        !cosmetic ||
        cosmetic.id === "museum" ||
        typeof quantity !== "number" ||
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        return [];
      }
      return [[cosmetic.id, Math.floor(quantity)]];
    }),
  );
}

export function getActiveCardCosmetics(
  activeRendererIds: readonly string[],
): CardCosmetic[] {
  const active = new Set(activeRendererIds);
  return CARD_COSMETICS.filter(
    (cosmetic) =>
      cosmetic.id !== "museum" && active.has(cosmetic.id),
  );
}

export function getAvailableCardStyleConsumables(
  inventory: Readonly<Record<string, unknown>> | undefined,
): Array<CardCosmetic & { quantity: number }> {
  const available = getCardStyleInventory(inventory);
  return CARD_COSMETICS.flatMap((cosmetic) => {
    const quantity = available[cosmetic.id] ?? 0;
    return quantity > 0 ? [{ ...cosmetic, quantity }] : [];
  });
}
