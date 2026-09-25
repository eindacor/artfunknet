import assert from "node:assert/strict";
import { test } from "node:test";

import {
  itemMatchesQualifierQuery,
  type HallOfFameQualifier,
} from "./hall-of-fame.ts";
import type { GameItem } from "./gameplay.ts";

test("itemMatchesQualifierQuery matches masterpiece mint query correctly", () => {
  const sampleItem: Partial<GameItem> = {
    mint: true,
    foil: false,
    unlocked: false,
    seasonal: false,
    original: false,
    values: { sell: 100, purchase: 150, actual: 120, auction_min: 80, collector: 140, dealer: 100 },
  };

  const isMatched = itemMatchesQualifierQuery(sampleItem as GameItem, "masterpiece", {
    rarity: "masterpiece",
    mint: true,
  });

  assert.equal(isMatched, true);
});

test("itemMatchesQualifierQuery rejects non-matching rarity or mint condition", () => {
  const sampleItem: Partial<GameItem> = {
    mint: false,
    foil: true,
    unlocked: true,
    values: { sell: 100, purchase: 150, actual: 120, auction_min: 80, collector: 140, dealer: 100 },
  };

  const isMatched = itemMatchesQualifierQuery(sampleItem as GameItem, "rare", {
    rarity: "masterpiece",
    mint: true,
  });

  assert.equal(isMatched, false);
});

test("itemMatchesQualifierQuery checks value ceilings", () => {
  const sampleItem: Partial<GameItem> = {
    mint: true,
    foil: true,
    values: { sell: 8000000, purchase: 15000000, actual: 12000000, auction_min: 6000000, collector: 14000000, dealer: 10000000 },
  };

  const matches10m = itemMatchesQualifierQuery(sampleItem as GameItem, "masterpiece", {
    minActualValue: 10_000_000,
  });
  const matches100m = itemMatchesQualifierQuery(sampleItem as GameItem, "masterpiece", {
    minActualValue: 100_000_000,
  });

  assert.equal(matches10m, true);
  assert.equal(matches100m, false);
});
