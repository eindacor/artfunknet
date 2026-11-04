import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import type { ItemCardRendererProps } from "./types.ts";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(await readFile(new URL("./skateboard-card.tsx", import.meta.url), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const SkateboardCard = runInNewContext(`${compiled}\nexports.default`, {
  exports: {},
  require: (id: string) => id === "./shared"
    ? { ArtworkImage: () => null, AttributeIcons: () => null }
    : require(id),
}) as (props: ItemCardRendererProps) => ReactElement;

const item = {
  artwork: { title: "Test work", artist: "Test artist" },
  mint: false, unlocked: false, seasonal: false, lottery: 0,
} as ItemCardRendererProps["item"];

function render(variants: Partial<ItemCardRendererProps["item"]>) {
  return renderToStaticMarkup(createElement(SkateboardCard, {
    item: { ...item, ...variants }, alreadyOwned: false, legendaryAttributes: [],
  }));
}

test("unlocked Deck variants lose exactly one front wheel while keeping both trucks and the rear wheels", () => {
  for (const mint of [false, true]) {
    for (const unlocked of [false, true]) {
      const html = render({ mint, unlocked });
      assert.equal((html.match(/class="skateboard-card-wheel /g) ?? []).length, unlocked ? 3 : 4);
      const rear = html.indexOf("skateboard-card-truck-back");
      assert.ok(rear > 0);
      assert.equal(html.slice(0, rear).includes("wheel-right"), !unlocked);
      assert.equal((html.slice(rear).match(/class="skateboard-card-wheel /g) ?? []).length, 2);
      assert.equal((html.match(/class="skateboard-card-truck-hanger"/g) ?? []).length, 2);
      assert.equal((html.match(/class="skateboard-card-truck-baseplate"/g) ?? []).length, 2);
    }
  }
});

test("Deck gold trucks follow seasonal status independently of lottery and unlocked variants", () => {
  for (const seasonal of [false, true]) {
    for (const lottery of [0, 4]) {
      for (const unlocked of [false, true]) {
        const html = render({ seasonal, lottery, unlocked });
        const trucks = [...html.matchAll(/class="skateboard-card-truck skateboard-card-truck-(front|back)([^"]*)"/g)];
        assert.equal(trucks.length, 2);
        assert.ok(trucks.every(truck => truck[2] === (seasonal ? " seasonal" : "")));
        assert.doesNotMatch(html, /\blottery\b/);
      }
    }
  }
});
