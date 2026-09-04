import assert from "node:assert/strict";
import test from "node:test";

import type { GameItem, ItemAttribute } from "./gameplay.ts";
import { buildGalleryMetadataSnapshot } from "./gallery-metadata-core.ts";

function attribute(
  id: string,
  title: string,
  value: number,
): ItemAttribute {
  return {
    _id: id,
    title,
    type: "unlocked",
    description: "",
    icon: "fa-star",
    npc_name: "",
    active: true,
    value,
  };
}

function item(
  id: string,
  artworkId: string,
  value: number,
  attributes: ItemAttribute[],
): GameItem {
  return {
    _id: id,
    artwork_id: artworkId,
    condition: 1,
    mint: false,
    mint_value_multiplier: 1,
    attributes: { locked: [], unlocked: attributes, special: [] },
    active_unique_attribute: id === "item-2" ? "legendary-1" : undefined,
    owner: "player-1",
    transaction_history: [],
    status: "displayed",
    source: "test",
    date_created: "",
    date_received: "",
    level: 1,
    roll_count: 0,
    reroll_spent: 0,
    foil: false,
    unlocked: false,
    seasonal: false,
    lottery: 0,
    original: false,
    patreon: false,
    vintage: false,
    authenticity: {
      forgery: false,
      forgery_quality: 0,
      liable: "",
      liability_pending: false,
      identified: false,
      fee: 0,
      original_owner: "",
    },
    tags: [],
    misprint: false,
    permanent: false,
    repairing: false,
    debug: false,
    odds: "",
    values: {
      sell: value,
      purchase: value,
      actual: value,
      auction_min: value,
      collector: value,
      dealer: value,
    },
    reroll_cost: 0,
  };
}

test("gallery metadata aggregates values, attributes, and featured artwork", () => {
  const snapshot = buildGalleryMetadataSnapshot(
    [
      item("item-1", "art-1", 100, [
        attribute("a", "Curious", 0.4),
        attribute("b", "Bold", 0.7),
      ]),
      item("item-2", "art-2", 350, [attribute("a", "Curious", 0.8)]),
    ],
    new Map([
      ["art-1", "common"],
      ["art-2", "legendary"],
    ]),
  );

  assert.equal(snapshot.value, 450);
  assert.equal(snapshot.score, 190);
  assert.equal(snapshot.display_count, 2);
  assert.equal(snapshot.featured_item_id, "item-2");
  assert.equal(snapshot.featured_artwork_id, "art-2");
  assert.deepEqual(snapshot.active_unique_attributes, ["legendary-1"]);
  assert.deepEqual(snapshot.display_rarities, ["legendary", "common"]);
  assert.deepEqual(snapshot.attributes, [
    {
      id: "a",
      title: "Curious",
      icon: "fa-star",
      type: "unlocked",
      count: 2,
      totalRating: 1.2,
    },
    {
      id: "b",
      title: "Bold",
      icon: "fa-star",
      type: "unlocked",
      count: 1,
      totalRating: 0.7,
    },
  ]);
});
