import assert from "node:assert/strict";
import test from "node:test";

import {
  ARCHIVE_FILTER_CATEGORIES,
  createArchiveEntry,
  filterAndSortArchiveEntries,
  getDefaultArchiveBrowseFilters,
  getArchiveCategories,
  getArchivePropertyOptions,
  getArchivePropertyProgress,
  getArchiveRecordArtStyles,
  getArchiveRecordModifiers,
  getUnarchivedArchiveData,
} from "./archive-gameplay.ts";

const standard = {
  mint: false,
  foil: false,
  unlocked: false,
  seasonal: false,
  lottery: 0,
  vintage: false,
};

test("archive categories preserve the original modifier order", () => {
  assert.deepEqual(
    getArchiveCategories({
      ...standard,
      foil: true,
      seasonal: true,
    }),
    ["standard", "foil", "seasonal"],
  );
  assert.deepEqual(
    getArchiveCategories({ ...standard, mint: true }),
    ["standard", "mint"],
  );
});

test("archive records aggregate modifiers, styles, and values", () => {
  const first = createArchiveEntry(
    {
      _id: "first",
      ...standard,
      card_renderer: "legacy",
      values: { actual: 120 },
    },
    "2026-09-02T00:00:00.000Z",
  );
  const second = createArchiveEntry(
    {
      _id: "second",
      ...standard,
      foil: true,
      seasonal: true,
      card_renderer: "abstract",
      values: { actual: 240 },
    },
    "2026-09-02T01:00:00.000Z",
  );
  const archive = { entries: [first, second] };

  assert.deepEqual(getArchiveRecordModifiers(archive), [
    "standard",
    "foil",
    "seasonal",
  ]);
  assert.deepEqual(getArchiveRecordArtStyles(archive), [
    "legacy",
    "abstract",
  ]);
  assert.equal(first.value + second.value, 360);
});

test("unarchived data detects new modifiers and art styles independently", () => {
  assert.deepEqual(
    getUnarchivedArchiveData(
      { ...standard, foil: true, card_renderer: "legacy" },
      ["standard", "foil"],
      ["legacy"],
    ),
    { modifiers: [], artStyles: [] },
  );
  assert.deepEqual(
    getUnarchivedArchiveData(
      { ...standard, foil: true, seasonal: true, card_renderer: "abstract" },
      ["foil"],
      ["legacy"],
    ),
    { modifiers: ["seasonal"], artStyles: ["abstract"] },
  );
  assert.deepEqual(
    getUnarchivedArchiveData(
      { ...standard, card_renderer: undefined },
      ["foil"],
      ["legacy"],
    ),
    { modifiers: [], artStyles: [] },
  );
});

test("archive property progress includes possible and historical variants", () => {
  assert.deepEqual(
    getArchivePropertyProgress(
      {
        modifiers: ["standard", "foil"],
        artStyles: ["legacy", "retired-style"],
      },
      {
        activeArtStyles: ["museum", "legacy", "zine"],
        seasonalEligible: false,
      },
    ),
    { archived: 4, total: 9 },
  );
  assert.deepEqual(
    getArchivePropertyProgress(
      {
        modifiers: ["standard", "seasonal"],
        artStyles: [],
      },
      {
        activeArtStyles: [],
        seasonalEligible: false,
      },
    ),
    { archived: 2, total: 7 },
  );
});

test("archive property options expose incomplete variants", () => {
  assert.deepEqual(
    getArchivePropertyOptions(
      {
        modifiers: ["standard"],
        artStyles: ["retired-style"],
      },
      {
        activeArtStyles: ["museum", "legacy"],
        seasonalEligible: true,
      },
    ),
    {
      modifiers: [
        "standard",
        "mint",
        "foil",
        "unlocked",
        "seasonal",
        "vintage",
        "lottery",
      ],
      artStyles: ["legacy", "retired-style"],
    },
  );
});

test("archive browsing filters unlocked variants and art styles", () => {
  const filters = getDefaultArchiveBrowseFilters();
  filters.artStyle = "legacy";
  filters.variants.foil = "only";
  filters.variants.vintage = "exclude";

  const matching = createBrowseEntry({
    id: "matching",
    modifiers: ["standard", "foil"],
    artStyles: ["legacy"],
  });
  const wrongStyle = createBrowseEntry({
    id: "wrong-style",
    modifiers: ["standard", "foil"],
    artStyles: ["zine"],
  });
  const vintage = createBrowseEntry({
    id: "vintage",
    modifiers: ["standard", "foil", "vintage"],
    artStyles: ["legacy"],
  });

  assert.deepEqual(
    filterAndSortArchiveEntries([wrongStyle, vintage, matching], filters).map(
      (entry) => entry.archive._id,
    ),
    ["matching"],
  );
  assert.deepEqual(ARCHIVE_FILTER_CATEGORIES, [
    "mint",
    "foil",
    "unlocked",
    "seasonal",
    "vintage",
    "lottery",
  ]);
});

test("archive browsing sorts by progress, value, and archive date", () => {
  const filters = getDefaultArchiveBrowseFilters();
  const older = createBrowseEntry({
    id: "older",
    value: 900,
    archived: 5,
    total: 10,
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  const newer = createBrowseEntry({
    id: "newer",
    value: 500,
    archived: 4,
    total: 5,
    updatedAt: "2026-02-01T00:00:00.000Z",
  });

  filters.sort = "progress-high";
  assert.equal(filterAndSortArchiveEntries([older, newer], filters)[0], newer);
  filters.sort = "value-high";
  assert.equal(filterAndSortArchiveEntries([older, newer], filters)[0], older);
  filters.sort = "newest";
  assert.equal(filterAndSortArchiveEntries([older, newer], filters)[0], newer);
});

function createBrowseEntry({
  id,
  modifiers = ["standard"],
  artStyles = [],
  value = 100,
  archived = 1,
  total = 10,
  updatedAt = "2026-01-01T00:00:00.000Z",
}: {
  id: string;
  modifiers?: Array<
    "standard" | "mint" | "foil" | "unlocked" | "seasonal" | "vintage" | "lottery"
  >;
  artStyles?: string[];
  value?: number;
  archived?: number;
  total?: number;
  updatedAt?: string;
}) {
  return {
    archive: {
      _id: id,
      modifiers,
      artStyles,
      combined_value: value,
      archived_count: 1,
      updated_at: updatedAt,
      artwork: {
        title: id,
        artist: "Artist",
        rarity: "common" as const,
        date: 2026,
      },
    },
    progress: { archived, total },
    complete: archived >= total,
  };
}
