import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminCreatedItem,
  type AdminItemCustomization,
} from "./admin-item-creator.ts";
import type { Artwork, ItemAttribute, LootData } from "./gameplay.ts";

const artwork: Artwork = {
  _id: "inactive-artwork",
  artist_id: "artist",
  artist: "Artist",
  title: "Artwork",
  date: 2000,
  genre: "Genre",
  medium: "Medium",
  rarity: "rare",
  value_scale: 0.5,
  height: 10,
  width: 10,
  active: false,
};
const attributes: ItemAttribute[] = [
  {
    _id: "attribute-1",
    title: "Attribute 1",
    type: "type",
    description: "Description",
    icon: "fa-star",
    npc_name: "Attribute 1",
    active: true,
  },
  {
    _id: "attribute-2",
    title: "Attribute 2",
    type: "type",
    description: "Description",
    icon: "fa-star",
    npc_name: "Attribute 2",
    active: true,
  },
];
const lootData: LootData = {
  rarity_values: {
    common: { min: 1, max: 10 },
    uncommon: { min: 10, max: 20 },
    rare: { min: 20, max: 30 },
    legendary: { min: 30, max: 40 },
    masterpiece: { min: 40, max: 50 },
  },
  basic_crate_cost: 1,
  items_per_basic_crate: 1,
  crate_expense_per_masterpiece: 1,
  seasonal_items: {
    common: [],
    uncommon: [],
    rare: [],
    legendary: [],
    masterpiece: [],
  },
  global_foil_chance: 0,
  global_patreon_chance: 0,
  global_unlocked_chance: 0,
  global_misprint_chance: 0,
};
const customization: AdminItemCustomization = {
  condition: 0.4,
  mint: true,
  level: 5,
  rollCount: 3,
  rerollSpent: 100,
  foil: true,
  unlocked: true,
  seasonal: false,
  lottery: 0,
  original: false,
  patreon: false,
  vintage: true,
  permanent: true,
  debug: false,
  cardRenderer: "legacy",
  source: "admin grant",
  tags: ["reward", "reward"],
  misprint: false,
  forgery: true,
  forgeryQuality: 0.25,
  forgeryIdentified: false,
  attributes: {
    locked: [],
    unlocked: [
      { attributeId: "attribute-1", value: 0.75 },
      { attributeId: "attribute-2", value: 0.65 },
    ],
    special: [],
  },
};

test("admin-created items accept inactive catalog data and exact custom values", () => {
  const item = buildAdminCreatedItem({
    artwork,
    attributes,
    customization,
    lootData,
    mintValueMultiplier: 2,
    owner: "player",
    now: new Date("2026-10-01T12:00:00.000Z"),
  });

  assert.equal(item.artwork_id, artwork._id);
  assert.equal(item.condition, 1);
  assert.equal(item.attributes.unlocked[0].value, 0.75);
  assert.equal(item.attributes.unlocked[0].active, true);
  assert.deepEqual(item.tags, ["reward"]);
  assert.equal(item.artwork_overrides, undefined);
  assert.equal(item.mint_value_multiplier, 2);
  assert.equal(item.authenticity.fee, 0);
  assert.equal(item.authenticity.forgery_quality, 0.25);
  assert.equal(item.owner, "player");
});

test("admin-created items accept negative roll counts", () => {
  const item = buildAdminCreatedItem({
    artwork,
    attributes,
    customization: { ...customization, rollCount: -25 },
    lootData,
    mintValueMultiplier: 2,
    owner: "player",
  });

  assert.equal(item.roll_count, -25);
});

test("admin-created items reject duplicate attributes", () => {
  assert.throws(
    () =>
      buildAdminCreatedItem({
        artwork,
        attributes,
        customization: {
          ...customization,
          attributes: {
            locked: [{ attributeId: "attribute-1", value: 0.5 }],
            unlocked: [{ attributeId: "attribute-1", value: 0.75 }],
            special: [],
          },
        },
        lootData,
        mintValueMultiplier: 2,
        owner: "player",
      }),
    /selected more than once/,
  );
});

test("admin-created items require drop-valid attribute counts", () => {
  assert.throws(
    () =>
      buildAdminCreatedItem({
        artwork,
        attributes,
        customization: {
          ...customization,
          attributes: {
            locked: [],
            unlocked: [{ attributeId: "attribute-1", value: 0.75 }],
            special: [],
          },
        },
        lootData,
        mintValueMultiplier: 2,
        owner: "player",
      }),
    /normally generated item/,
  );
});
