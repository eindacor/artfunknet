import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateDealerQuestItemChance,
  evaluateDonorQuestItemChance,
  evaluateNpcQuestItemChance,
} from "./npc-quest-item.ts";
import type { LegendaryAttribute } from "./legendary-attributes.ts";

const createMockEffect = (code: string, chance = 0.2): LegendaryAttribute => ({
  _id: `attr-${code.toLowerCase()}`,
  code,
  title: `${code} Perk`,
  description: "Increased chance to offer quest items.",
  flavor_text: "A grand display.",
  active: true,
  parameters: { chance },
  linked_attributes: ["attr1", "attr2"],
  linked_pair: "",
});

test("evaluateNpcQuestItemChance returns null when effect is not active", async () => {
  const mockDb: any = {
    collection: (name: string) => {
      if (name === "items") {
        return {
          find: () => ({
            project: () => ({
              toArray: async () => [],
            }),
          }),
        };
      }
      return {};
    },
  };

  const result = await evaluateDonorQuestItemChance(mockDb, "player-1");
  assert.equal(result, null);
});

test("evaluateNpcQuestItemChance returns null when roll exceeds chance", async () => {
  const effect = createMockEffect("DONOR_QUEST_ITEM_CHANCE", 0.2);
  const mockDb: any = {};

  const result = await evaluateDonorQuestItemChance(mockDb, "player-1", {
    questItemEffect: effect,
    rollOverride: 0.5,
  });

  assert.equal(result, null);
});

test("evaluateNpcQuestItemChance returns null when player has no active quests", async () => {
  const effect = createMockEffect("DONOR_QUEST_ITEM_CHANCE", 0.2);
  const mockDb: any = {
    collection: (name: string) => {
      if (name === "quests") {
        return {
          find: () => ({
            toArray: async () => [],
          }),
        };
      }
      return {};
    },
  };

  const result = await evaluateDonorQuestItemChance(mockDb, "player-1", {
    questItemEffect: effect,
    rollOverride: 0.1,
  });

  assert.equal(result, null);
});

test("evaluateDonorQuestItemChance returns quest target artwork ID when effect triggers", async () => {
  const effect = createMockEffect("DONOR_QUEST_ITEM_CHANCE", 0.2);
  const mockDb: any = {
    collection: (name: string) => {
      if (name === "quests") {
        return {
          find: (query: any) => {
            assert.equal(query.owner_id, "player-1");
            return {
              toArray: async () => [
                {
                  _id: "quest-1",
                  owner_id: "player-1",
                  target: ["art-target-100", "art-target-101"],
                },
              ],
            };
          },
        };
      }
      return {};
    },
  };

  const result = await evaluateDonorQuestItemChance(mockDb, "player-1", {
    questItemEffect: effect,
    rollOverride: 0.1,
  });

  assert.ok(["art-target-100", "art-target-101"].includes(result!));
});

test("evaluateDealerQuestItemChance returns quest target artwork ID when effect triggers", async () => {
  const effect = createMockEffect("DEALER_QUEST_ITEM_CHANCE", 0.2);
  const mockDb: any = {
    collection: (name: string) => {
      if (name === "quests") {
        return {
          find: (query: any) => {
            assert.equal(query.owner_id, "player-1");
            return {
              toArray: async () => [
                {
                  _id: "quest-2",
                  owner_id: "player-1",
                  target: ["art-target-200"],
                },
              ],
            };
          },
        };
      }
      return {};
    },
  };

  const result = await evaluateDealerQuestItemChance(mockDb, "player-1", {
    questItemEffect: effect,
    rollOverride: 0.15,
  });

  assert.equal(result, "art-target-200");
});
