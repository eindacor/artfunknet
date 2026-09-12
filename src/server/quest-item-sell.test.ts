import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateQuestItemSellBonus,
  getActiveQuestTargetIds,
} from "./quest-item-sell.ts";
import type { LegendaryAttribute } from "./legendary-attributes.ts";

const createMockEffect = (sell_multiplier = 2): LegendaryAttribute => ({
  _id: "attr-quest-sell",
  code: "QUEST_ITEM_SELL_BONUS",
  title: "Quest Item Sell Bonus",
  description: "Selling quest items gives double the selling fee.",
  flavor_text: "A truly brilliant piece.",
  active: true,
  parameters: { sell_multiplier },
  linked_attributes: ["Lacw8fkPYvSQrmpQN", "nwMiN3DFBgsKBNSar"],
  linked_pair: "Lacw8fkPYvSQrmpQN:nwMiN3DFBgsKBNSar",
});

test("getActiveQuestTargetIds returns empty set when no active quests exist", async () => {
  const mockDb: any = {
    collection: (name: string) => {
      if (name === "quests") {
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

  const targets = await getActiveQuestTargetIds(mockDb, "player-1");
  assert.equal(targets.size, 0);
});

test("getActiveQuestTargetIds aggregates target artwork IDs from active quests", async () => {
  const mockDb: any = {
    collection: (name: string) => {
      if (name === "quests") {
        return {
          find: (query: any) => {
            assert.equal(query.owner_id, "player-1");
            return {
              project: () => ({
                toArray: async () => [
                  { target: ["art-1", "art-2"] },
                  { target: ["art-2", "art-3"] },
                ],
              }),
            };
          },
        };
      }
      return {};
    },
  };

  const targets = await getActiveQuestTargetIds(mockDb, "player-1");
  assert.equal(targets.size, 3);
  assert.ok(targets.has("art-1"));
  assert.ok(targets.has("art-2"));
  assert.ok(targets.has("art-3"));
});

test("evaluateQuestItemSellBonus returns 1x multiplier when QUEST_ITEM_SELL_BONUS effect is not active", async () => {
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

  const result = await evaluateQuestItemSellBonus(mockDb, "player-1", "art-1");
  assert.equal(result.effect, null);
  assert.equal(result.multiplier, 1);
});

test("evaluateQuestItemSellBonus returns 1x multiplier when item is not a quest target", async () => {
  const effect = createMockEffect(2);
  const activeQuestTargetIds = new Set(["art-2", "art-3"]);
  const mockDb: any = {};

  const result = await evaluateQuestItemSellBonus(mockDb, "player-1", "art-1", {
    questSellEffect: effect,
    activeQuestTargetIds,
  });

  assert.equal(result.effect, effect);
  assert.equal(result.multiplier, 1);
});

test("evaluateQuestItemSellBonus returns multiplier parameter when item is a quest target", async () => {
  const effect = createMockEffect(2);
  const activeQuestTargetIds = new Set(["art-1", "art-2"]);
  const mockDb: any = {};

  const result = await evaluateQuestItemSellBonus(mockDb, "player-1", "art-1", {
    questSellEffect: effect,
    activeQuestTargetIds,
  });

  assert.equal(result.effect, effect);
  assert.equal(result.multiplier, 2);
});
