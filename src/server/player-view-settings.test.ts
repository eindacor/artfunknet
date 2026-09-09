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
      bulkSaleProtections: {
        keepArtStyles: true,
        keepLegendaries: true,
        keepMasterpieces: false,
        keepUnfoundQuestTargets: true,
        keepUnarchived: false,
      },
    }),
    {
      gallerySort: "name",
      galleryView: "list",
      inventorySort: "condition",
      bulkSaleProtections: {
        keepArtStyles: true,
        keepLegendaries: true,
        keepMasterpieces: false,
        keepUnfoundQuestTargets: true,
        keepUnarchived: false,
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
      bulkSaleProtections: {
        keepArtStyles: "yes",
        keepLegendaries: 1,
      },
    }),
    DEFAULT_PLAYER_VIEW_SETTINGS,
  );
});
