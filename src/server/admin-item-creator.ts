import { randomUUID } from "node:crypto";

import {
  calculateItemValues,
  type Artwork,
  type GameItem,
  type ItemAttribute,
  type LootData,
} from "./gameplay.ts";
import type { ArtworkEffect } from "./artwork-effects-core.ts";
import { getItemAttributeCounts } from "./item-attribute-counts.ts";
import { getRerollCost } from "./item-reroll.ts";

export type AdminItemAttributeInput = {
  attributeId: string;
  value: number;
};

export type AdminItemCustomization = {
  condition: number;
  mint: boolean;
  level: number;
  rollCount: number;
  rerollSpent: number;
  foil: boolean;
  unlocked: boolean;
  seasonal: boolean;
  lottery: number;
  original: boolean;
  patreon: boolean;
  vintage: boolean;
  permanent: boolean;
  debug: boolean;
  cardRenderer: string;
  source: string;
  tags: string[];
  misprint: boolean;
  forgery: boolean;
  forgeryQuality: number;
  forgeryIdentified: boolean;
  attributes: {
    locked: AdminItemAttributeInput[];
    unlocked: AdminItemAttributeInput[];
    special: AdminItemAttributeInput[];
  };
};

export function buildAdminCreatedItem({
  artwork,
  attributes,
  customization,
  effect,
  lootData,
  mintValueMultiplier,
  owner,
  now = new Date(),
}: {
  artwork: Artwork;
  attributes: ItemAttribute[];
  customization: AdminItemCustomization;
  effect?: Pick<ArtworkEffect, "effect_type" | "linked_attributes"> | null;
  lootData: LootData;
  mintValueMultiplier: number;
  owner: string;
  now?: Date;
}): GameItem {
  const attributeById = new Map(
    attributes.map((attribute) => [attribute._id, attribute]),
  );
  const usedAttributeIds = new Set<string>();
  const resolveAttributes = (
    inputs: AdminItemAttributeInput[],
  ): ItemAttribute[] =>
    inputs.map((input) => {
      const attribute = attributeById.get(input.attributeId);
      if (!attribute) {
        throw new Error(`Attribute ${input.attributeId} is unavailable.`);
      }
      if (usedAttributeIds.has(attribute._id)) {
        throw new Error(`Attribute ${attribute.title} is selected more than once.`);
      }
      usedAttributeIds.add(attribute._id);
      return { ...attribute, value: input.value };
    });
  const itemAttributes: GameItem["attributes"] = {
    locked: resolveAttributes(customization.attributes.locked),
    unlocked: resolveAttributes(customization.attributes.unlocked),
    special: resolveAttributes(customization.attributes.special),
  };
  validateDropAttributeStructure(
    artwork,
    effect,
    itemAttributes,
    customization.unlocked,
  );
  const artworkOverrides = customization.misprint
    ? getMisprintOverrides(artwork)
    : {};
  const timestamp = now.toISOString();
  const condition = customization.mint ? 1 : customization.condition;
  const base = {
    _id: randomUUID(),
    artwork_id: artwork._id,
    condition,
    mint: customization.mint,
    mint_value_multiplier: customization.mint
      ? mintValueMultiplier
      : 1,
    attributes: itemAttributes,
    card_renderer: customization.cardRenderer,
    owner,
    transaction_history: [
      {
        type: "generation" as const,
        from_owner: null,
        to_owner: owner,
        occurred_at: timestamp,
        source: customization.source,
      },
    ],
    status: "claimed" as const,
    source: customization.source,
    date_created: timestamp,
    date_received: timestamp,
    level: customization.level,
    roll_count: customization.rollCount,
    reroll_spent: customization.rerollSpent,
    foil: customization.foil,
    unlocked: customization.unlocked,
    seasonal: customization.seasonal,
    lottery: customization.lottery,
    original: customization.original,
    patreon: customization.patreon,
    vintage: customization.vintage,
    authenticity: {
      forgery: customization.forgery,
      forgery_quality: customization.forgeryQuality,
      liable: owner,
      liability_pending: false,
      identified: customization.forgeryIdentified,
      fee: 0,
      original_owner: owner,
    },
    tags: [...new Set(customization.tags)],
    ...(Object.keys(artworkOverrides).length > 0
      ? { artwork_overrides: artworkOverrides }
      : {}),
    misprint: customization.misprint,
    permanent: customization.permanent,
    repairing: false,
    debug: customization.debug,
    odds: "Admin created",
  };
  const renderedArtwork = { ...artwork, ...artworkOverrides };
  return {
    ...base,
    values: calculateItemValues(base, renderedArtwork, lootData),
    reroll_cost: getRerollCost(base, artwork.rarity, lootData),
  };
}

function validateDropAttributeStructure(
  artwork: Artwork,
  effect: Pick<ArtworkEffect, "effect_type" | "linked_attributes"> | null | undefined,
  attributes: GameItem["attributes"],
  unlocked: boolean,
) {
  const expectedSpecialIds =
    effect &&
    ((artwork.rarity === "legendary" && effect.effect_type === "legendary") ||
      (artwork.rarity === "masterpiece" &&
        effect.effect_type === "masterpiece"))
      ? effect.linked_attributes
      : artwork.special_attributes ?? [];
  const specialIds = attributes.special.map((attribute) => attribute._id);
  if (
    specialIds.length !== expectedSpecialIds.length ||
    expectedSpecialIds.some((attributeId) => !specialIds.includes(attributeId))
  ) {
    throw new Error(
      "Special attributes must match the selected artwork's effect.",
    );
  }

  const {
    locked: expectedLockedCount,
    unlocked: expectedUnlockedCount,
  } = getItemAttributeCounts(artwork.rarity, unlocked);
  if (
    attributes.locked.length !== expectedLockedCount ||
    attributes.unlocked.length !== expectedUnlockedCount
  ) {
    throw new Error(
      "Attribute counts must match a normally generated item.",
    );
  }
}

function getMisprintOverrides(artwork: Artwork) {
  const field = Math.random() < 0.5 ? "artist" : "title";
  const value = artwork[field];
  if (!value) return {};
  const index = Math.floor(Math.random() * value.length);
  return {
    [field]: value.slice(0, index) + value.slice(index + 1),
  };
}
