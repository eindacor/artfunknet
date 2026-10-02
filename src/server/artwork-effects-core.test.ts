import assert from "node:assert/strict";
import test from "node:test";

import {
  selectLeastRepresentedEffect,
  validateArtworkEffectLinks,
} from "./artwork-effects-core.ts";
import { deriveLegendaryAttributeIds } from "./legendary-attributes-core.ts";
import {
  getItemAttributes,
  type Artwork,
  type ItemAttribute,
} from "./gameplay.ts";

test("effect cardinality enforces two legendary and one masterpiece attribute", () => {
  assert.deepEqual(validateArtworkEffectLinks("legendary", ["b", "a"]), [
    "a",
    "b",
  ]);
  assert.deepEqual(validateArtworkEffectLinks("masterpiece", ["a"]), ["a"]);
  assert.throws(() => validateArtworkEffectLinks("legendary", ["a"]));
  assert.throws(() => validateArtworkEffectLinks("legendary", ["a", "a"]));
  assert.throws(() => validateArtworkEffectLinks("masterpiece", ["a", "b"]));
});

test("duplicate legendary pairs remain distinct effects", () => {
  const effects = [
    {
      _id: "first",
      active: true,
      linked_attributes: ["a", "b"] as [string, string],
    },
    {
      _id: "second",
      active: true,
      linked_attributes: ["b", "a"] as [string, string],
    },
  ];
  assert.deepEqual(deriveLegendaryAttributeIds(["a", "b"], effects), [
    "first",
    "second",
  ]);
});

test("least represented assignment randomizes only among tied effects", () => {
  const effects = [{ _id: "a" }, { _id: "b" }, { _id: "c" }];
  const counts = new Map([
    ["a", 4],
    ["b", 1],
    ["c", 1],
  ]);
  assert.equal(selectLeastRepresentedEffect(effects, counts, () => 0)?._id, "b");
  assert.equal(
    selectLeastRepresentedEffect(effects, counts, () => 0.999)?._id,
    "c",
  );
});

test("masterpiece generation always produces five total attributes", () => {
  const attributes = Array.from({ length: 10 }, (_, index) => ({
    _id: `attribute-${index}`,
    title: `Attribute ${index}`,
    type: "primary",
    description: "",
    icon: "",
    npc_name: `NPC ${index}`,
    active: true,
  })) satisfies ItemAttribute[];
  const artwork = {
    _id: "artwork",
    rarity: "masterpiece",
  } as Artwork;
  const effect = {
    effect_type: "masterpiece" as const,
    linked_attributes: ["attribute-0"] as [string],
  };
  const normal = getItemAttributes(artwork, false, attributes, effect);
  assert.equal(normal.special.length, 1);
  assert.equal(normal.unlocked.length, 3);
  assert.equal(normal.locked.length, 1);
  assert.equal(
    normal.special.length + normal.unlocked.length + normal.locked.length,
    5,
  );
  const unlocked = getItemAttributes(artwork, true, attributes, effect);
  assert.equal(unlocked.special.length, 1);
  assert.equal(unlocked.unlocked.length, 4);
  assert.equal(unlocked.locked.length, 0);
  assert.equal(
    unlocked.special.length +
      unlocked.unlocked.length +
      unlocked.locked.length,
    5,
  );
});
