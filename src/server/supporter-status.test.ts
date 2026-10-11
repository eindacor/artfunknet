import assert from "node:assert/strict";
import test from "node:test";

import {
  getPatreonSupporterStatus,
  isPlayerSupporter,
  normalizeSupporterStatus,
  resolvePlayerSupporterStatus,
} from "./supporter-status.ts";

const player = {
  _id: "player-1",
  active: true,
};

test("normalizes supporter status values", () => {
  assert.equal(normalizeSupporterStatus(" Legendary "), "legendary");
  assert.equal(normalizeSupporterStatus("ultimate"), null);
  assert.equal(normalizeSupporterStatus(null), null);
});

test("active Patreon supporters use the highest recognized tier", () => {
  const supporter = {
    ...player,
    patreon: {
      is_supporter: true,
      requires_reauthorization: false,
      tier_name: "Rare Tier",
      tiers: [
        { title: "Legendary Tier" },
        { title: "Common Tier" },
      ],
    },
  };

  assert.equal(getPatreonSupporterStatus(supporter), "legendary");
  assert.equal(resolvePlayerSupporterStatus(supporter), "legendary");
  assert.equal(isPlayerSupporter(supporter), true);
});

test("unrecognized paid Patreon tiers fall back to common", () => {
  assert.equal(
    getPatreonSupporterStatus({
      ...player,
      patreon: {
        is_supporter: true,
        requires_reauthorization: false,
        tier_name: "Founding Patron",
      },
    }),
    "common",
  );
});

test("admin overrides persist without active Patreon support", () => {
  const supporter = {
    ...player,
    supporter: { admin_override: "rare" as const },
    patreon: {
      is_supporter: false,
      requires_reauthorization: true,
      tier_name: "Masterpiece Tier",
    },
  };

  assert.equal(resolvePlayerSupporterStatus(supporter), "rare");
  assert.equal(isPlayerSupporter(supporter), true);
});

test("the highest status wins across admin and Patreon sources", () => {
  assert.equal(
    resolvePlayerSupporterStatus({
      ...player,
      supporter: { admin_override: "uncommon" },
      patreon: {
        is_supporter: true,
        requires_reauthorization: false,
        tier_name: "Masterpiece Tier",
      },
    }),
    "masterpiece",
  );
  assert.equal(
    resolvePlayerSupporterStatus({
      ...player,
      supporter: { admin_override: "legendary" },
      patreon: {
        is_supporter: true,
        requires_reauthorization: false,
        tier_name: "Rare Tier",
      },
    }),
    "legendary",
  );
});

test("missing, inactive, and reauthorization-required Patreon memberships are not supporters", () => {
  assert.equal(resolvePlayerSupporterStatus(player), null);
  assert.equal(
    resolvePlayerSupporterStatus({
      ...player,
      patreon: { is_supporter: false, tier_name: "Masterpiece Tier" },
    }),
    null,
  );
  assert.equal(
    resolvePlayerSupporterStatus({
      ...player,
      patreon: {
        is_supporter: true,
        requires_reauthorization: true,
        tier_name: "Masterpiece Tier",
      },
    }),
    null,
  );
});
