import assert from "node:assert/strict";
import test from "node:test";

import {
  getCommunityReactionKarmaDelta,
  isCommunityReactionTarget,
} from "./community-reactions-core.ts";

test("heart reactions add and remove Karma", () => {
  assert.equal(getCommunityReactionKarmaDelta("heart", true), 1);
  assert.equal(getCommunityReactionKarmaDelta("heart", false), -1);
});

test("angry reactions subtract and restore Karma", () => {
  assert.equal(getCommunityReactionKarmaDelta("angry", true), -1);
  assert.equal(getCommunityReactionKarmaDelta("angry", false), 1);
});

test("other reactions do not change Karma", () => {
  assert.equal(getCommunityReactionKarmaDelta("fire", true), 0);
  assert.equal(getCommunityReactionKarmaDelta("artfunkel", false), 0);
});

test("artworks are supported reaction targets", () => {
  assert.equal(isCommunityReactionTarget("artwork"), true);
});
