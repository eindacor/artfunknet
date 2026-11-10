import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import {
  ArtHistorianQuestLimitError,
  calculateHistorianClaimXp,
  calculateHistorianConditionSubmissionBonus,
  calculateHistorianReward,
  calculateMarketExpertMoneyMultiplier,
  getUnfulfilledHistorianTargetIds,
  isHistorianSpecialItem,
} from "./art-historian-gameplay.ts";

test("a full Historian quest list returns a successful no-result meeting", async () => {
  const source = ts.createSourceFile(
    "route.ts",
    await readFile(
      new URL("../app/api/play/npcs/[id]/meet/route.ts", import.meta.url),
      "utf8",
    ),
    ts.ScriptTarget.Latest,
    true,
  );
  let historian: ts.IfStatement | undefined;
  function visit(node: ts.Node) {
    if (
      ts.isIfStatement(node) &&
      node.expression.getText(source) ===
        "npc.attribute_id === ART_HISTORIAN_ATTRIBUTE_ID"
    ) {
      historian = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(historian);
  const code = ts.transpileModule(
    `async function meetHistorian() { ${historian.getText(source)} }\nmeetHistorian`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const loggedErrors: unknown[] = [];
  const response = await (runInNewContext(code, {
    ART_HISTORIAN_ATTRIBUTE_ID: "historian",
    ArtHistorianQuestLimitError,
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
    },
    console: { error: (...args: unknown[]) => loggedErrors.push(args) },
    createArtHistorianQuest: async () => {
      throw new ArtHistorianQuestLimitError();
    },
    database: {},
    getArtHistorianQuestViews: async () => [],
    getNpcInteractionRollbackUpdate: () => ({}),
    now: new Date(),
    npc: {
      _id: "historian",
      attribute_id: "historian",
      npc_name: "Art Historian",
      quality: "bronze",
    },
    player: { _id: "player" },
    socialBatteryCost: 5,
  }) as () => Promise<Response>)();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    socialBatteryCost: 5,
    message:
      "The Art Historian has a new objective, but your quest list is full.",
  });
  assert.deepEqual(loggedErrors, []);
});

test("Historian condition bonus requires condition strictly above the threshold", () => {
  assert.equal(
    calculateHistorianConditionSubmissionBonus({
      condition: 0.6,
      questMoney: 1_000,
      conditionMinimum: 0.6,
      rewardCoefficient: 0.1,
    }),
    0,
  );
  assert.equal(
    calculateHistorianConditionSubmissionBonus({
      condition: 0.61,
      questMoney: 1_000,
      conditionMinimum: 0.6,
      rewardCoefficient: 0.1,
    }),
    100,
  );
  assert.equal(
    calculateHistorianConditionSubmissionBonus({
      condition: 0.8,
      questMoney: 1_000,
      conditionMinimum: 0.6,
      rewardCoefficient: 0.25,
    }),
    250,
  );
});

test("Art Historian rewards preserve original rarity multipliers", () => {
  const common = calculateHistorianReward({
    averageDropValue: 1_000,
    playerLevel: 0,
    questRarity: "common",
  });
  const masterpiece = calculateHistorianReward({
    averageDropValue: 1_000,
    playerLevel: 0,
    questRarity: "masterpiece",
  });

  assert.equal(common.money, 2_000);
  assert.equal(common.xp, 60);
  assert.equal(masterpiece.money, 3_600);
  assert.equal(masterpiece.xp, 100);
  assert.deepEqual(masterpiece.item, {
    rarity: "legendary",
    foil: true,
  });
});

test("calculateMarketExpertMoneyMultiplier scales with winning auction count", () => {
  assert.equal(calculateMarketExpertMoneyMultiplier(0), 1.0);
  assert.equal(calculateMarketExpertMoneyMultiplier(3), 1.3);
  assert.equal(calculateMarketExpertMoneyMultiplier(5), 1.5);
  assert.equal(calculateMarketExpertMoneyMultiplier(-2), 1.0);
});

test("calculateHistorianReward applies moneyMultiplier correctly", () => {
  const baseReward = calculateHistorianReward({
    averageDropValue: 1_000,
    playerLevel: 0,
    questRarity: "common",
    moneyMultiplier: 1.0,
  });
  const boostedReward = calculateHistorianReward({
    averageDropValue: 1_000,
    playerLevel: 0,
    questRarity: "common",
    moneyMultiplier: calculateMarketExpertMoneyMultiplier(3),
  });

  assert.equal(baseReward.money, 2_000);
  assert.equal(boostedReward.money, 2_600);
});

test("calculateHistorianReward stacks xpMultiplier and moneyMultiplier independently", () => {
  const stackedReward = calculateHistorianReward({
    averageDropValue: 1_000,
    playerLevel: 0,
    questRarity: "common",
    xpMultiplier: 1.5,
    moneyMultiplier: calculateMarketExpertMoneyMultiplier(3),
  });

  assert.equal(stackedReward.money, 2_600);
  assert.equal(stackedReward.xp, 90);
  assert.equal(stackedReward.xp_chunk_percentage, 0.9);
});

test("Art Historian claims reward extra and special targets", () => {
  assert.equal(calculateHistorianClaimXp(100, 3, 3, 0), 100);
  assert.equal(calculateHistorianClaimXp(100, 4, 3, 2), 180);
});

test("Art Historian special targets preserve original property list", () => {
  const baseItem = {
    foil: false,
    unlocked: false,
    seasonal: false,
    original: false,
    vintage: false,
    lottery: 0,
  };
  assert.equal(isHistorianSpecialItem(baseItem), false);
  assert.equal(
    isHistorianSpecialItem({ ...baseItem, seasonal: true }),
    true,
  );
});

test("Art Historian matching uses raw unfulfilled target ids", () => {
  assert.deepEqual(
    getUnfulfilledHistorianTargetIds({
      target: ["artwork-a", "artwork-b"],
      fulfilled_targets: [
        {
          artwork_id: "artwork-a",
        },
      ],
    }),
    ["artwork-b"],
  );
});
