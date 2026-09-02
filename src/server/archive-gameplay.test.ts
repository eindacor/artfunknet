import assert from "node:assert/strict";
import test from "node:test";

import {
  getArchiveCategories,
  getArchivedArtStylesByArtwork,
  getArchivedCategoriesByArtwork,
  getArchiveSignature,
} from "./archive-gameplay.ts";

const standard = {
  foil: false,
  unlocked: false,
  seasonal: false,
  lottery: 0,
  vintage: false,
};

test("archive signatures preserve the original modifier order", () => {
  assert.equal(getArchiveSignature(standard), "standard");
  assert.equal(
    getArchiveSignature({
      ...standard,
      foil: true,
      unlocked: true,
      seasonal: true,
      lottery: 4,
      vintage: true,
    }),
    "fuslv",
  );
  assert.deepEqual(
    getArchiveCategories({
      ...standard,
      foil: true,
      seasonal: true,
    }),
    ["foil", "seasonal"],
  );
});

test("archive indicators include only active non-displaced copies", () => {
  const categories = getArchivedCategoriesByArtwork([
    {
      ...standard,
      artwork_id: "artwork",
      status: "archived",
      displaced: false,
    },
    {
      ...standard,
      artwork_id: "artwork",
      status: "archived",
      displaced: true,
      foil: true,
    },
    {
      ...standard,
      artwork_id: "artwork",
      status: "archived",
      unlocked: true,
    },
  ]);

  assert.deepEqual(categories.get("artwork"), ["standard", "unlocked"]);
});

test("archive art styles include each active archived style", () => {
  const styles = getArchivedArtStylesByArtwork([
    {
      artwork_id: "artwork",
      card_renderer: "legacy",
      status: "archived",
      displaced: false,
    },
    {
      artwork_id: "artwork",
      card_renderer: "abstract",
      status: "archived",
    },
    {
      artwork_id: "artwork",
      card_renderer: "legacy",
      status: "archived",
    },
    {
      artwork_id: "artwork",
      card_renderer: "circle",
      status: "archived",
      displaced: true,
    },
    {
      artwork_id: "default-style",
      status: "archived",
    },
  ]);

  assert.deepEqual(styles.get("artwork"), ["legacy", "abstract"]);
  assert.deepEqual(styles.get("default-style"), ["museum"]);
});
