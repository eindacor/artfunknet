import assert from "node:assert/strict";
import test from "node:test";

import { getMintStateAfterAction } from "./item-mint.ts";
import { MASTERPIECE_EFFECT_CODES } from "./masterpiece-effects.ts";

const mintItem = {
  condition: 1,
  mint: true,
  mint_value_multiplier: 2,
};

test("preservation Mint survives every action except art-style changes", () => {
  for (const action of ["display", "level", "reroll"] as const) {
    assert.deepEqual(
      getMintStateAfterAction(
        mintItem,
        MASTERPIECE_EFFECT_CODES.preservationMint,
        action,
      ),
      mintItem,
    );
  }

  assert.deepEqual(
    getMintStateAfterAction(
      mintItem,
      MASTERPIECE_EFFECT_CODES.preservationMint,
      "art-style",
    ),
    {
      condition: 1,
      mint: false,
      mint_value_multiplier: 1,
    },
  );
});

test("other effects do not preserve Mint during item mutations", () => {
  assert.deepEqual(
    getMintStateAfterAction(mintItem, "MP_OTHER_EFFECT", "reroll"),
    {
      condition: 1,
      mint: false,
      mint_value_multiplier: 1,
    },
  );
});
