import assert from "node:assert/strict";
import test from "node:test";

import type { GameItem } from "./gameplay.ts";
import {
  getPublicGalleryItemFilter,
  prepareItemForPublicViewer,
} from "./public-showcase-core.ts";

function createItem(): GameItem {
  return {
    _id: "item-1",
    artwork_id: "artwork-1",
    condition: 1,
    mint: true,
    mint_value_multiplier: 1,
    attributes: { locked: [], unlocked: [], special: [] },
    owner: "player-1",
    transaction_history: [
      {
        type: "generation",
        from_owner: null,
        to_owner: "player-1",
        occurred_at: "2026-01-01T00:00:00.000Z",
        source: "forgery",
      },
    ],
    status: "displayed",
    source: "forgery",
    date_created: "2026-01-01T00:00:00.000Z",
    date_received: "2026-01-01T00:00:00.000Z",
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
      forgery: true,
      forgery_quality: 0.75,
      liable: "player-1",
      liability_pending: false,
      identified: true,
      fee: 100,
      original_owner: "player-1",
    },
    tags: [],
    misprint: false,
    permanent: false,
    repairing: false,
    debug: false,
    odds: "forged",
    values: {
      sell: 100,
      purchase: 100,
      actual: 100,
      auction_min: 100,
      collector: 100,
      dealer: 100,
    },
    reroll_cost: 10,
  };
}

test("public galleries query displayed items owned by the requested player", () => {
  assert.deepEqual(getPublicGalleryItemFilter("player-1"), {
    owner: "player-1",
    status: "displayed",
  });
});

test("anonymous item views remove ownership and provenance", () => {
  const item = prepareItemForPublicViewer(createItem(), null);

  assert.equal(item.owner, "unknown");
  assert.equal(item.source, "unknown");
  assert.equal(item.odds, "unknown");
  assert.deepEqual(item.transaction_history, []);
  assert.deepEqual(item.authenticity, { identified: false });
});

test("owners retain authenticated item details", () => {
  const item = prepareItemForPublicViewer(createItem(), "player-1");

  assert.equal(item.owner, "player-1");
  assert.equal(item.source, "forgery");
  assert.equal(item.odds, "forged");
  assert.equal(item.transaction_history[0]?.source, "forgery");
  assert.deepEqual(item.authenticity, {
    identified: true,
    forgery: true,
  });
});
