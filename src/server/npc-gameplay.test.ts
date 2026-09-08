import assert from "node:assert/strict";
import test from "node:test";

import type { ItemAttribute } from "./gameplay.ts";
import {
  aggregateGalleryAttributes,
  getGalleryNpcs,
  getNpcProcMap,
  getNpcQuality,
  refreshNpcSpawns,
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

test("NPC attraction is divided by total display capacity", () => {
  const procs = getNpcProcMap([item("masterpiece")], 10, 50);
  assert.equal(procs.get("collector")?.chance, 0.01);
});

test("NPC quality rolls preserve the legacy weighted quality map", () => {
  assert.equal(getNpcQuality(0), "bronze");
  assert.equal(getNpcQuality(12 / 36), "silver");
  assert.equal(getNpcQuality(22 / 36), "gold");
  assert.equal(getNpcQuality(30 / 36), "platinum");
});

test("refreshNpcSpawns removes expired NPCs and getGalleryNpcs omits expired NPCs", async () => {
  const expiredNpc = {
    _id: "expired_1",
    owner_id: "player_1",
    expiration: new Date(Date.now() - 1000),
  };
  const activeNpc = {
    _id: "active_1",
    owner_id: "player_1",
    expiration: new Date(Date.now() + 60000),
  };

  const npcsCollection = {
    docs: [expiredNpc, activeNpc],
    async deleteMany(filter: any) {
      this.docs = this.docs.filter((doc: any) => {
        const matchesOwner = !filter.owner_id || doc.owner_id === filter.owner_id;
        const matchesExp = filter.$or?.some((cond: any) => {
          if (cond.expiration?.$lte) {
            const limit = new Date(cond.expiration.$lte).getTime();
            return new Date(doc.expiration).getTime() <= limit;
          }
          return false;
        });
        return !(matchesOwner && matchesExp);
      });
      return { deletedCount: 1 };
    },
    async bulkWrite() { return {}; },
    find(filter: any) {
      const now = filter.$or?.[0]?.expiration?.$gt;
      const filtered = this.docs.filter((doc: any) => {
        if (doc.owner_id !== filter.owner_id) return false;
        if (!now) return true;
        return new Date(doc.expiration).getTime() > new Date(now).getTime();
      });
      return {
        sort() {
          return {
            async toArray() {
              return filtered;
            },
          };
        },
      };
    },
  };

  const db = {
    collection(name: string) {
      if (name === "npcs") return npcsCollection as any;
      return {
        find() { return { project() { return { toArray() { return []; } }; }, toArray() { return []; } }; },
      } as any;
    },
  } as any;

  const activeVisitors = await getGalleryNpcs(db, "player_1");
  assert.equal(activeVisitors.length, 1);
  assert.equal(activeVisitors[0]._id, "active_1");
});

