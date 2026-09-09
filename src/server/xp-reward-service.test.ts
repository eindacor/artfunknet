import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_XP_REWARD_SCALARS } from "./game-settings.ts";
import { XpRewardService } from "./xp-reward-service.ts";

test("XP reward service applies named chunk scalars", () => {
  const rewards = new XpRewardService({
    ...DEFAULT_XP_REWARD_SCALARS,
    artExpert: 1.5,
  });

  assert.equal(rewards.getChunks("artExpert", 0.2), 0.3);
  assert.equal(rewards.getAmount("artExpert", 0, 0.2), 30);
  assert.equal(rewards.getAmount("galleryDisplay", 0, 0.2), 20);
  assert.equal(rewards.getAmount("forgeryOffload", 0, 1), 80);
});
