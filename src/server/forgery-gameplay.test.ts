import assert from "node:assert/strict";
import test from "node:test";

import {
  BASE_FORGERY_QUALITY,
  calculateAuthenticationCost,
  calculateForgeCost,
  calculateForgeryHeat,
  getAuthenticationPermission,
  getForgedDisplayRewardMultiplier,
  getPlayerFacingRedemptionPermission,
  getRedemptionPermission,
  punishForgeryQuality,
  sanitizePlayerFacingAuthenticity,
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
  assert.equal(calculateAuthenticationCost(99), 19);
  assert.ok(
    calculateAuthenticationCost(10_000) >
      calculateAuthenticationCost(1_000),
  );
  assert.equal(getForgedDisplayRewardMultiplier(0.5), 0.7);
  assert.equal(punishForgeryQuality(0.15), 0.1);
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
    authenticity,
  } as GameItem;
  assert.deepEqual(getAuthenticationPermission(item, "claimant"), {
    allowed: true,
    cost: 20,
  });
  assert.deepEqual(getRedemptionPermission(item, "claimant"), { allowed: true });
  const sanitized = sanitizePlayerFacingAuthenticity(item);
  assert.deepEqual(sanitized.authenticity, { identified: false });
  assert.deepEqual(
    getPlayerFacingRedemptionPermission(item, "claimant"),
    { allowed: true },
  );
  assert.deepEqual(
    sanitizePlayerFacingAuthenticity({
      ...item,
      authenticity: { ...authenticity, identified: true },
    }).authenticity,
    { identified: true, forgery: true },
  );
});
