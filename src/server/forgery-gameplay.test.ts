import assert from "node:assert/strict";
import test from "node:test";

import {
  BASE_FORGERY_QUALITY,
  calculateAuthenticationCost,
  calculateForgeCost,
  calculateForgeryHeat,
  calculateForgeryOffloadXpMultiplier,
  getAuthenticationPermission,
  getForgedDisplayRewardMultiplier,
  getForgeryValueEstimate,
  getUndetectedForgeryExitRecipient,
  getPlayerFacingRedemptionPermission,
  getRedemptionPermission,
  punishForgeryQuality,
  sanitizePlayerFacingAuthenticity,
  shouldDestroyDetectedForgery,
  validateForgerySelection,
} from "./forgery-gameplay.ts";
import type { GameItem } from "./gameplay.ts";
import type { PlayerArtworkArchive } from "./archive-gameplay.ts";

const authenticity = {
  forgery: true,
  forgery_quality: 0.5,
  liable: "former",
  liability_pending: true,
  identified: false,
  fee: 100,
  original_owner: "forger",
};

test("only previously known detected forgeries are destroyed", () => {
  assert.equal(
    shouldDestroyDetectedForgery({
      authenticity: { ...authenticity, identified: true },
    }),
    true,
  );
  assert.equal(
    shouldDestroyDetectedForgery({
      authenticity: { ...authenticity, identified: false },
    }),
    false,
  );
  assert.equal(
    shouldDestroyDetectedForgery({
      authenticity: {
        ...authenticity,
        forgery: false,
        identified: true,
      },
    }),
    false,
  );
});

test("only another player's undetected forgery earns an exit reward", () => {
  assert.equal(
    getUndetectedForgeryExitRecipient({ authenticity }, "collector"),
    "forger",
  );
  assert.equal(
    getUndetectedForgeryExitRecipient({ authenticity }, "forger"),
    null,
  );
  assert.equal(
    getUndetectedForgeryExitRecipient(
      { authenticity: { ...authenticity, identified: true } },
      "collector",
    ),
    null,
  );
  assert.equal(
    getUndetectedForgeryExitRecipient(
      { authenticity: { ...authenticity, forgery: false } },
      "collector",
    ),
    null,
  );
});

test("forgery formulas use quality, context ranges, and rounding", () => {
  const item = {
    mint: false,
    foil: false,
    unlocked: false,
    seasonal: false,
    vintage: false,
    lottery: 0,
    level: 1,
    authenticity,
    artwork: { rarity: "common" as const },
  };
  assert.equal(calculateForgeryHeat(item, "sell"), 0.04);
  assert.equal(calculateForgeryHeat(item, "display"), 0.008);
  assert.equal(
    calculateForgeryHeat(
      { ...item, lottery: 10, authenticity: { ...authenticity, identified: true } },
      "collector",
    ),
    0.725,
  );
  assert.equal(BASE_FORGERY_QUALITY, 0.5);
  assert.equal(calculateForgeCost(1_000), 720);
  assert.ok(calculateForgeCost(1_000) < Math.floor(1_000 * 0.8));
  assert.equal(calculateAuthenticationCost(99), 19);
  assert.ok(
    calculateAuthenticationCost(10_000) >
      calculateAuthenticationCost(1_000),
  );
  assert.equal(getForgedDisplayRewardMultiplier(0.5), 0.7);
  assert.equal(punishForgeryQuality(0.15), 0.1);
});

test("forgery value estimates use neutral condition and attribute values", () => {
  const attributes = {
    locked: [{ _id: "locked", value: 0.1 }],
    unlocked: [{ _id: "unlocked", value: 0.9 }],
    special: [{ _id: "special", value: 1 }],
  } as GameItem["attributes"];
  const estimate = getForgeryValueEstimate({
    condition: 0.93,
    mint: false,
    mint_value_multiplier: 1,
    attributes,
    foil: false,
    seasonal: false,
    lottery: 0,
    original: false,
    vintage: false,
    unlocked: true,
    level: 1,
  });

  assert.equal(estimate.condition, 0.5);
  assert.deepEqual(
    [
      ...estimate.attributes.locked,
      ...estimate.attributes.unlocked,
      ...estimate.attributes.special,
    ].map((attribute) => attribute.value),
    [0.5, 0.5, 0.5],
  );
});

test("every forgeable modifier increases forgery heat", () => {
  const base = {
    mint: false,
    foil: false,
    unlocked: false,
    seasonal: false,
    vintage: false,
    lottery: 0,
    level: 1,
    authenticity: { ...authenticity, identified: true },
    artwork: { rarity: "common" as const },
  };
  const baseline = calculateForgeryHeat(base, "sell");
  assert.ok(calculateForgeryHeat({ ...base, mint: true }, "sell") > baseline);
  assert.ok(calculateForgeryHeat({ ...base, foil: true }, "sell") > baseline);
  assert.ok(
    calculateForgeryHeat({ ...base, unlocked: true }, "sell") > baseline,
  );
  assert.ok(
    calculateForgeryHeat({ ...base, seasonal: true }, "sell") > baseline,
  );
  assert.ok(
    calculateForgeryHeat({ ...base, vintage: true }, "sell") > baseline,
  );
  assert.ok(calculateForgeryHeat({ ...base, lottery: 1 }, "sell") > baseline);
});

test("forgery heat and offload XP increase with artwork rarity", () => {
  const base = {
    mint: false,
    foil: false,
    unlocked: false,
    seasonal: false,
    vintage: false,
    lottery: 0,
    level: 1,
    authenticity,
  };
  const common = { ...base, artwork: { rarity: "common" as const } };
  const masterpiece = {
    ...base,
    artwork: { rarity: "masterpiece" as const },
  };

  assert.ok(
    calculateForgeryHeat(masterpiece, "sell") >
      calculateForgeryHeat(common, "sell"),
  );
  assert.ok(
    calculateForgeryOffloadXpMultiplier(masterpiece, "sale") >
      calculateForgeryOffloadXpMultiplier(common, "sale"),
  );
});

test("forgery selection is limited to represented archive features", () => {
  const archive: Pick<PlayerArtworkArchive, "entries"> = {
    entries: [
      {
        source_item_id: "item",
        modifiers: ["standard", "foil"],
        art_style: "gallery",
        value: 1,
        archived_at: "",
      },
    ],
  };
  assert.deepEqual(validateForgerySelection(archive, ["foil"], "gallery"), {
    modifiers: ["foil"],
    artStyle: "gallery",
  });
  assert.deepEqual(validateForgerySelection(archive, [], "museum"), {
    modifiers: [],
    artStyle: "museum",
  });
  assert.throws(() => validateForgerySelection(archive, ["standard"], "museum"));
  assert.throws(() => validateForgerySelection(archive, ["foil", "foil"], "museum"));
  assert.throws(() => validateForgerySelection(archive, [], "unknown"));
});

test("authentication, reporting, and sanitization preserve privacy", () => {
  const item = {
    owner: "claimant",
    status: "claimed",
    source: "forgery",
    odds: "forged",
    transaction_history: [
      {
        type: "generation",
        from_owner: null,
        to_owner: "claimant",
        occurred_at: "2026-09-04T12:00:00.000Z",
        source: "forgery",
      },
    ],
    authenticity,
  } as GameItem;
  assert.deepEqual(getAuthenticationPermission(item, "claimant"), {
    allowed: true,
    cost: 20,
  });
  assert.deepEqual(getRedemptionPermission(item, "claimant"), { allowed: true });
  const sanitized = sanitizePlayerFacingAuthenticity(item);
  assert.deepEqual(sanitized.authenticity, { identified: false });
  assert.equal(sanitized.source, "unknown");
  assert.equal(sanitized.odds, "unknown");
  assert.equal(sanitized.transaction_history[0].source, "unknown");
  assert.deepEqual(
    getPlayerFacingRedemptionPermission(item, "claimant"),
    { allowed: true },
  );
  const identified = sanitizePlayerFacingAuthenticity({
    ...item,
    authenticity: { ...authenticity, identified: true },
  });
  assert.deepEqual(identified.authenticity, {
    identified: true,
    forgery: true,
  });
  assert.equal(identified.source, "forgery");
  assert.equal(identified.odds, "forged");
  assert.equal(identified.transaction_history[0].source, "forgery");
});

test("forced masking hides provenance even for authenticated items", () => {
  const sanitized = sanitizePlayerFacingAuthenticity(
    {
      source: "generated auction",
      odds: "1 in 200",
      transaction_history: [
        {
          type: "generation",
          from_owner: null,
          to_owner: "system:auction-house",
          occurred_at: "2026-09-04T12:00:00.000Z",
          source: "generated auction",
        },
      ],
      authenticity: {
        ...authenticity,
        forgery: false,
        identified: true,
      },
    } as GameItem,
    true,
  );

  assert.deepEqual(sanitized.authenticity, { identified: false });
  assert.equal(sanitized.source, "unknown");
  assert.equal(sanitized.odds, "1 in 200");
  assert.equal(sanitized.transaction_history[0].source, "unknown");
});
