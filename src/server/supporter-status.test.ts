import assert from "node:assert/strict";
import test from "node:test";

import { isPlayerSupporter } from "./supporter-status.ts";

const player = {
  _id: "player-1",
  active: true,
};

test("active Patreon supporters are supporters", () => {
  assert.equal(
    isPlayerSupporter({
      ...player,
      patreon: {
        is_supporter: true,
        requires_reauthorization: false,
      },
    }),
    true,
  );
});

test("missing and inactive Patreon memberships are not supporters", () => {
  assert.equal(isPlayerSupporter(player), false);
  assert.equal(
    isPlayerSupporter({
      ...player,
      patreon: { is_supporter: false },
    }),
    false,
  );
});

test("Patreon accounts requiring reauthorization are not supporters", () => {
  assert.equal(
    isPlayerSupporter({
      ...player,
      patreon: {
        is_supporter: true,
        requires_reauthorization: true,
      },
    }),
    false,
  );
});
