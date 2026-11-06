import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { ARTWORK_EDITOR_RARITIES } from "../../../components/artwork-editor/types.ts";
import { getArtworkBaseGenerationWeight } from "../../../server/artwork-generation-weight.ts";

const require = createRequire(import.meta.url);
const code = ts.transpileModule(await readFile(new URL("./artwork-value-distribution.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
function load(react = React) {
  return runInNewContext(`${code}\n({ Chart: exports.default, Dot: ValueScaleDot })`, {
    exports: {},
    require: (id: string) => id === "react" ? react : id === "@/components/artwork-editor/types"
      ? { ARTWORK_EDITOR_RARITIES } : id === "@/server/artwork-generation-weight"
        ? { getArtworkBaseGenerationWeight } : require(id),
  });
}
const artwork = { _id: "art", title: "The Bed", rarity: "common", active: true, value_scale: 0.537 };

test("the collapsed loot pool distribution shows every rarity and only active artwork, with accessible distinct overlapping dots", () => {
  const { Chart } = load();
  const html = renderToStaticMarkup(React.createElement(Chart, {
    artworks: [artwork, { ...artwork, _id: "overlap", title: "Second work" }, { ...artwork, _id: "inactive", title: "Hidden", active: false }],
    pending: false, onSave: async () => true,
  }));
  assert.match(html, /<details(?![^>]*\bopen\b)/);
  for (const rarity of ARTWORK_EDITOR_RARITIES) assert.match(html, new RegExp(`data-value-scale-rarity="${rarity}"`));
  assert.equal((html.match(/role="slider"/g) ?? []).length, 2);
  assert.match(html, /title="The Bed \(value scale: 0.54, weight: 73\)"/);
  assert.doesNotMatch(html, /Hidden/);
  assert.match(html, /top:13px/);
  assert.match(html, /top:39px/);
});

test("rarity totals sum exact weights of active artwork and refresh after edits without tier counts", () => {
  const { Chart } = load();
  const artworks = [0, 0.0001, 0.499, 0.5, 0.5001, 0.98, 0.9801, 1].map((value_scale, index) => ({
    ...artwork, _id: `common-${index}`, value_scale,
  }));
  artworks.push(
    { ...artwork, _id: "rare", rarity: "rare", value_scale: 0.5 },
    { ...artwork, _id: "inactive", active: false, value_scale: 0.5 },
  );
  const render = () => renderToStaticMarkup(React.createElement(Chart, {
    artworks, pending: false, onSave: async () => true,
  }));
  const total = (html: string, rarity: string) =>
    Number(html.match(new RegExp(`data-value-scale-total-weight="${rarity}">Total weight: (\\d+)</span>`))?.[1]);
  const html = render();
  assert.equal(total(html, "common"), 574);
  assert.equal(total(html, "rare"), 75);
  for (const rarity of ["uncommon", "legendary", "masterpiece"]) assert.equal(total(html, rarity), 0);
  assert.doesNotMatch(html, /drop-weight tier counts|Empty tiers|<ul/);
  assert.match(html, /title="The Bed \(value scale: 0.00, weight: 100\)"/);
  assert.match(html, /title="The Bed \(value scale: 1.00, weight: 50\)"/);

  artworks[3] = { ...artworks[3], value_scale: 1 };
  const updated = render();
  assert.equal(total(updated, "common"), 549);
  assert.equal(total(updated, "rare"), 75);
});

test("dragging and keyboard adjustments save on release, clamp endpoints, cancel safely and avoid duplicate saves", async () => {
  const refs: { current: unknown }[] = [];
  const state: unknown[] = [];
  let hook = 0;
  const saves: number[] = [];
  let finish: (() => void) | undefined;
  const { Dot } = load({
    ...React,
    useRef: (value: unknown) => {
      const index = hook++;
      return refs[index] ??= { current: value };
    },
    useState: (initial: unknown) => {
      const index = hook++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value: unknown) => { state[index] = value; }];
    },
  } as typeof React);
  const render = () => {
    hook = 0;
    return Dot({ artwork, lane: 0, disabled: false, onSave: async (_artwork: unknown, value: number) => {
      saves.push(value);
      await new Promise<void>(resolve => { finish = resolve; });
    } }).props;
  };
  const target = { parentElement: { getBoundingClientRect: () => ({ width: 200 }) }, focus() {}, setPointerCapture() {}, releasePointerCapture() {} };
  const pointer = (clientX: number, pointerId = 1) => ({ clientX, pointerId, button: 0, currentTarget: target, preventDefault() {} });
  render().onPointerDown(pointer(100));
  render().onPointerUp(pointer(100));
  assert.deepEqual(saves, [], "A click must not round or save an untouched scale");
  render().onPointerDown(pointer(100));
  render().onPointerMove(pointer(180));
  assert.equal(render()["aria-valuenow"], 0.94);
  assert.equal(render().title, "The Bed (value scale: 0.94, weight: 53)");
  assert.deepEqual(saves, []);
  render().onPointerMove(pointer(1000, 2));
  assert.equal(render()["aria-valuenow"], 0.94, "Ignore unrelated pointers");
  render().onPointerUp(pointer(1000));
  render().onLostPointerCapture();
  render().onBlur();
  assert.deepEqual(saves, [1]);
  assert.equal(render()["aria-valuenow"], 1, "Keep the optimistic position until the save completes");
  finish!();
  await new Promise(resolve => setImmediate(resolve));
  render().onPointerDown(pointer(100));
  render().onPointerMove(pointer(-1000));
  assert.equal(render()["aria-valuenow"], 0);
  render().onPointerCancel();
  assert.equal(render()["aria-valuenow"], artwork.value_scale);
  assert.equal(render().title, "The Bed (value scale: 0.54, weight: 73)");
  assert.deepEqual(saves, [1]);
  const key = (key: string) => ({ key, shiftKey: false, preventDefault() {} });
  render().onKeyDown(key("ArrowRight"));
  assert.equal(render()["aria-valuenow"], 0.55);
  render().onKeyDown(key("Escape"));
  render().onKeyUp(key("ArrowRight"));
  assert.deepEqual(saves, [1]);
  render().onKeyDown(key("Home"));
  render().onKeyUp(key("Home"));
  assert.deepEqual(saves, [1, 0]);
  finish!();
  await new Promise(resolve => setImmediate(resolve));
});
