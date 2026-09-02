import assert from "node:assert/strict";
import test from "node:test";

import {
  CARD_COSMETICS,
  getActiveCardCosmetics,
  getAvailableCardStyleConsumables,
  getCardStyleInventory,
} from "./catalog.ts";
import { resolveCardRendererId } from "./selection.ts";

test("card renderer selection preserves cosmetic precedence", () => {
  assert.equal(
    resolveCardRendererId({
      forcedRendererId: "museum",
      itemRendererId: "gilded",
      preferredRendererId: "arcade",
    }),
    "museum",
  );
  assert.equal(
    resolveCardRendererId({
      itemRendererId: "gilded",
      preferredRendererId: "arcade",
    }),
    "gilded",
  );
  assert.equal(
    resolveCardRendererId({ preferredRendererId: "arcade" }),
    "arcade",
  );
  assert.equal(
    resolveCardRendererId({ preferredRendererId: "not-a-renderer" }),
    "museum",
  );
});

test("active cosmetics remain available in the store", () => {
  const activeIds = ["legacy", "museum"];
  assert.deepEqual(
    getActiveCardCosmetics(activeIds).map((cosmetic) => cosmetic.id),
    ["legacy"],
  );
});

test("card style inventory keeps positive known consumable quantities", () => {
  assert.deepEqual(
    getCardStyleInventory({
      arcade: 2.8,
      museum: 5,
      unknown: 4,
      zine: 0,
    }),
    { arcade: 2 },
  );
  assert.deepEqual(
    getAvailableCardStyleConsumables({ arcade: 2, zine: 1 }).map(
      ({ id, quantity }) => ({ id, quantity }),
    ),
    [
      { id: "arcade", quantity: 2 },
      { id: "zine", quantity: 1 },
    ],
  );
});

test("card cosmetics have stable unique numbers", () => {
  assert.equal(
    new Set(CARD_COSMETICS.map((cosmetic) => cosmetic.number)).size,
    CARD_COSMETICS.length,
  );
});
