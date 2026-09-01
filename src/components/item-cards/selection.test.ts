import assert from "node:assert/strict";
import test from "node:test";

import {
  CARD_COSMETICS,
  getActiveCardCosmetics,
  getOwnedCardRendererIds,
  getSelectableCardCosmetics,
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
    "legacy",
  );
});

test("inactive cosmetics remain selectable only for existing owners", () => {
  const activeIds = ["legacy", "museum"];
  assert.deepEqual(
    getActiveCardCosmetics(activeIds).map((cosmetic) => cosmetic.id),
    ["legacy", "museum"],
  );
  assert.deepEqual(
    getSelectableCardCosmetics(activeIds, ["arcade"]).map(
      (cosmetic) => cosmetic.id,
    ),
    ["legacy", "museum", "arcade"],
  );
});

test("card cosmetics have stable unique numbers and legacy ownership", () => {
  assert.equal(
    new Set(CARD_COSMETICS.map((cosmetic) => cosmetic.number)).size,
    CARD_COSMETICS.length,
  );
  assert.deepEqual(getOwnedCardRendererIds(undefined), ["legacy"]);
  assert.deepEqual(
    getOwnedCardRendererIds(["arcade", "unknown", "arcade"]),
    ["legacy", "arcade"],
  );
});
