import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveLegendaryAttributeIds,
  normalizeLegendaryPair,
  selectActiveLegendaryAttribute,
} from "./legendary-attributes-core.ts";

test("legendary pairs are unordered and reject invalid links", () => {
  assert.equal(normalizeLegendaryPair(["b", "a"]), "a:b");
  assert.throws(() => normalizeLegendaryPair(["a", "a"]));
  assert.throws(() => normalizeLegendaryPair(["a"]));
});

test("legendary and masterpiece special attributes derive one and three effects", () => {
  const attributes = [
    { _id: "ab", active: true, linked_pair: "a:b" },
    { _id: "ac", active: true, linked_pair: "a:c" },
    { _id: "bc", active: true, linked_pair: "b:c" },
  ];
  assert.deepEqual(deriveLegendaryAttributeIds(["a", "b"], attributes), [
    "ab",
  ]);
  assert.deepEqual(
    deriveLegendaryAttributeIds(["a", "b", "c"], attributes),
    ["ab", "ac", "bc"],
  );
});

test("inactive effects are excluded and active selections are preserved", () => {
  const attributes = [
    { _id: "ab", active: false, linked_pair: "a:b" },
    { _id: "ac", active: true, linked_pair: "a:c" },
  ];
  const eligible = deriveLegendaryAttributeIds(["a", "b", "c"], attributes);
  assert.deepEqual(eligible, ["ac"]);
  assert.equal(selectActiveLegendaryAttribute("ac", eligible), "ac");
  assert.equal(selectActiveLegendaryAttribute("missing", eligible), "ac");
  assert.equal(selectActiveLegendaryAttribute(undefined, []), undefined);
});
