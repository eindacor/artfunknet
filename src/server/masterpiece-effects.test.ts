import assert from "node:assert/strict";
import test from "node:test";

import type { ArtworkEffect } from "./artwork-effects.ts";
import {
  getAuctionForgeryRefund,
  getMasterpieceGalleryXpChunks,
  getNewYorkSettlementDate,
  getTransferableAuctionCommissionCoefficient,
  getVisitorGenerationPasses,
  MASTERPIECE_EFFECT_CODES,
  rollEffectChance,
  shouldApplyPerfectFirstReroll,
} from "./masterpiece-effects.ts";

function effect(
  code: string,
  parameters: Record<string, number> = {},
): ArtworkEffect {
  return {
    _id: code,
    effect_type: "masterpiece",
    title: code,
    description: code,
    flavor_text: code,
    code,
    active: true,
    linked_attributes: ["attribute"],
    parameters,
  };
}

test("masterpiece behavior decisions use configured parameters", () => {
  assert.equal(rollEffectChance(effect("COPY", { chance: 0.2 }), "chance", 0, () => 0.19), true);
  assert.equal(rollEffectChance(effect("COPY", { chance: 0.2 }), "chance", 0, () => 0.2), false);
  assert.equal(
    shouldApplyPerfectFirstReroll(
      effect(MASTERPIECE_EFFECT_CODES.perfectReroll),
      { roll_count: 0, reroll_spent: 0 },
    ),
    true,
  );
  assert.equal(
    shouldApplyPerfectFirstReroll(
      effect(MASTERPIECE_EFFECT_CODES.perfectReroll),
      { roll_count: 1, reroll_spent: 0 },
    ),
    false,
  );
  assert.equal(
    getMasterpieceGalleryXpChunks(
      effect(MASTERPIECE_EFFECT_CODES.uncommonGalleryXp, { xp_chunks: 0.5 }),
      3,
    ),
    1.5,
  );
  assert.equal(getVisitorGenerationPasses(true, true), 2);
  assert.equal(getVisitorGenerationPasses(true, false), 1);
  assert.equal(getVisitorGenerationPasses(false, true), 1);
  assert.equal(
    getAuctionForgeryRefund(
      effect(MASTERPIECE_EFFECT_CODES.auctionAuthentication, {
        refund_rate: 0.75,
      }),
      101,
    ),
    75,
  );
  assert.equal(
    getTransferableAuctionCommissionCoefficient(
      effect(MASTERPIECE_EFFECT_CODES.transferableAuction, {
        commission_rate: 0.2,
      }),
    ),
    0.2,
  );
});

test("daily settlement key changes at 7 AM New York", () => {
  assert.equal(
    getNewYorkSettlementDate(new Date("2026-10-01T10:59:59Z")),
    "2026-09-30",
  );
  assert.equal(
    getNewYorkSettlementDate(new Date("2026-10-01T11:00:00Z")),
    "2026-10-01",
  );
});
