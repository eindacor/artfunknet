import assert from "node:assert/strict";
import test from "node:test";

import { evaluateDonorQuestItemChance } from "./donor-quest-item.ts";
import type { LegendaryAttribute } from "./legendary-attributes.ts";

const createMockEffect = (chance = 0.2): LegendaryAttribute => ({
  _id: "attr-donor-quest",
  code: "DONOR_QUEST_ITEM_CHANCE",
  title: "Donor Quest Item Chance",
  description: "Art Donors have an increased chance to offer quest items.",
  flavor_text: "Seeing it first hand is truly an overpowering experience.",
  active: true,
  parameters: { chance },
  linked_attributes: ["Yk2kk2mZtHetvbrY5", "Z7wY5jXkDeckwfFLs"],
  linked_pair: "Yk2kk2mZtHetvbrY5:Z7wY5jXkDeckwfFLs",
});

test("evaluateDonorQuestItemChance returns null when effect is not active", async () => {
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

test("evaluateDonorQuestItemChance returns null when roll exceeds chance", async () => {
  const effect = createMockEffect(0.2);
  const mockDb: any = {};

  const result = await evaluateDonorQuestItemChance(mockDb, "player-1", {
    questItemEffect: effect,
    rollOverride: 0.5,
  });

  assert.equal(result, null);
});

test("evaluateDonorQuestItemChance returns null when player has no active quests", async () => {
  const effect = createMockEffect(0.2);
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
  const effect = createMockEffect(0.2);
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
