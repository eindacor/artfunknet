import assert from "node:assert/strict";
import test from "node:test";

import { getSupporterPromptState } from "./supporter-prompt.ts";
import { SUPPORTER_STATUSES } from "./supporter-status.ts";

const player = { _id: "player", active: true };
const november = new Date("2026-11-01T00:00:00.000Z");

test("new and unacknowledged non-supporters receive the monthly prompt", () => {
  for (const supporter_prompt_acknowledged_at of [undefined, null, "", "invalid", new Date(NaN)]) {
    assert.deepEqual(getSupporterPromptState({
      ...player, profile: { supporter_prompt_acknowledged_at },
    }, november), { period: "2026-11", required: true });
  }
  assert.equal(getSupporterPromptState({ ...player, active: false }, november).required, false);
});

test("acknowledgment expires at the next UTC calendar month, not after thirty days", () => {
  const october = { ...player, profile: {
    supporter_prompt_acknowledged_at: new Date("2026-10-31T23:59:59.999Z"),
  } };
  assert.equal(getSupporterPromptState(october, new Date("2026-10-31T23:59:59.999Z")).required, false);
  assert.equal(getSupporterPromptState(october, november).required, true);
  const acknowledged = { ...player, profile: {
    supporter_prompt_acknowledged_at: "2026-11-01T00:00:00.000Z",
  } };
  assert.equal(getSupporterPromptState(acknowledged, new Date("2026-11-30T23:59:59.999Z")).required, false);
  assert.equal(getSupporterPromptState(acknowledged, new Date("2026-12-01T00:00:00.000Z")).required, true);
});

test("UTC month comparison handles year boundaries, offsets and newer acknowledgments", () => {
  assert.equal(getSupporterPromptState({ ...player, profile: {
    supporter_prompt_acknowledged_at: "2026-12-31T23:59:59.999Z",
  } }, new Date("2027-01-01T00:00:00.000Z")).required, true);
  assert.equal(getSupporterPromptState({ ...player, profile: {
    supporter_prompt_acknowledged_at: "2026-10-31T20:30:00-05:00",
  } }, november).required, false);
  assert.equal(getSupporterPromptState({ ...player, profile: {
    supporter_prompt_acknowledged_at: "2026-12-01T00:00:00.000Z",
  } }, november).required, false);
});

test("every resolved supporter tier and active paid Patreon membership is excluded", () => {
  for (const status of SUPPORTER_STATUSES) {
    assert.equal(getSupporterPromptState({
      ...player, supporter: { admin_override: status },
    }, november).required, false);
    assert.equal(getSupporterPromptState({
      ...player, patreon: { is_supporter: true, tier_name: status },
    }, november).required, false);
  }
  assert.equal(getSupporterPromptState({
    ...player, patreon: { is_supporter: true, requires_reauthorization: true },
  }, november).required, false);
  assert.equal(getSupporterPromptState({
    ...player, patreon: { is_supporter: false, tier_name: "Rare", requires_reauthorization: true },
  }, november).required, true);
});
