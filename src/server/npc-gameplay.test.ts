import assert from "node:assert/strict";
import test from "node:test";

import type { ItemAttribute } from "./gameplay.ts";
import {
  aggregateGalleryAttributes,
  getNpcProcMap,
  getNpcQuality,
  type GalleryNpcItem,
} from "./npc-gameplay.ts";

const collector: ItemAttribute = {
  _id: "collector",
  title: "collector_bonus",
  type: "primary",
  description: "collector bonus",
  icon: "fa-binoculars",
  npc_name: "Art Collector",
  active: true,
  value: 0.8,
};

function item(
  rarity: GalleryNpcItem["artwork"]["rarity"],
): GalleryNpcItem {
  return {
    attributes: { locked: [], unlocked: [collector], special: [] },
    artwork: { rarity },
  };
}

test("gallery attributes aggregate matching attributes across displayed works", () => {
  const totals = aggregateGalleryAttributes([item("common"), item("rare")]);
  assert.equal(totals.get("collector")?.total, 1.6);
});

test("NPC proc map preserves the legacy rarity, level, and squared scaling", () => {
  const procs = getNpcProcMap([item("masterpiece")], 1, 50);
  assert.equal(procs.get("collector")?.chance, 0.58);
});

test("NPC quality rolls preserve the legacy weighted quality map", () => {
  assert.equal(getNpcQuality(0), "bronze");
  assert.equal(getNpcQuality(12 / 36), "silver");
  assert.equal(getNpcQuality(22 / 36), "gold");
  assert.equal(getNpcQuality(30 / 36), "platinum");
});
