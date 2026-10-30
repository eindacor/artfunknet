import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PLAYER_VIEW_SETTINGS,
  getPlayerViewSettings,
} from "./player-view-settings.ts";

test("player view settings use stable defaults", () => {
  assert.deepEqual(getPlayerViewSettings(undefined), DEFAULT_PLAYER_VIEW_SETTINGS);
});

test("player view settings preserve valid saved choices", () => {
  assert.deepEqual(
    getPlayerViewSettings({
      gallerySort: "name",
      galleryView: "list",
      inventorySort: "condition",
      offersSort: "drop-chance",
      offersSortDirection: "asc",
      bulkSaleProtections: {
        keepArtStyles: true,
        keepRares: true,
        keepLegendaries: true,
        keepMasterpieces: true,
        keepUnfoundQuestTargets: true,
        keepUnarchived: true,
      },
    }),
    {
      gallerySort: "name",
      galleryView: "list",
      inventorySort: "condition",
      offersSort: "drop-chance",
      offersSortDirection: "asc",
      bulkSaleProtections: {
        keepArtStyles: true,
        keepRares: true,
        keepLegendaries: true,
        keepMasterpieces: true,
        keepUnfoundQuestTargets: true,
        keepUnarchived: true,
      },
    },
  );
});

test("player view settings replace invalid values with safe defaults", () => {
  assert.deepEqual(
    getPlayerViewSettings({
      gallerySort: "popularity",
      galleryView: "tiles",
      inventorySort: "random",
      offersSort: "title",
      offersSortDirection: "sideways",
      bulkSaleProtections: {
        keepArtStyles: "yes",
        keepLegendaries: 1,
      },
    }),
    DEFAULT_PLAYER_VIEW_SETTINGS,
  );
});

test("player view settings restore both Inventory drop-chance sort directions", () => {
  for (const inventorySort of ["drop-chance-high", "drop-chance-low"]) {
    assert.deepEqual(getPlayerViewSettings({ inventorySort }), {
      ...DEFAULT_PLAYER_VIEW_SETTINGS,
      inventorySort,
    });
  }
});

test("legacy view settings receive Offers defaults without losing saved bulk choices", () => {
  const settings = getPlayerViewSettings({
    inventorySort: "value-low",
    bulkSaleProtections: { keepRares: false, keepArtStyles: false },
  });
  assert.equal(settings.offersSort, "value");
  assert.equal(settings.offersSortDirection, "desc");
  assert.equal(settings.inventorySort, "value-low");
  assert.equal(settings.bulkSaleProtections.keepRares, false);
  assert.equal(settings.bulkSaleProtections.keepArtStyles, false);
});
