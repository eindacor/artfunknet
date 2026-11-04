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
const compiled = ts.transpileModule(await readFile(new URL("./d3-card.tsx", import.meta.url), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const RelicCard = runInNewContext(`${compiled}\nexports.default`, {
  exports: {},
  require: (id: string) => id === "./shared"
    ? {
      ArtworkImage: () => null,
      AttributeIcons: () => createElement("span", { "data-primary-attributes": true }, "Attributes"),
    }
    : require(id),
}) as (props: ItemCardRendererProps) => ReactElement;

function render(lottery: number) {
  return renderToStaticMarkup(createElement(RelicCard, {
    item: {
      artwork: { title: "Test work", artist: "Test artist", rarity: "common", medium: "Oil", genre: "Abstract" },
      condition: 1, lottery,
    } as ItemCardRendererProps["item"],
    alreadyOwned: false,
    legendaryAttributes: [],
  }));
}

test("Nephalem Relic shows the actual lottery level as a gray diamond stat below Primary attributes", () => {
  for (const lottery of [1, 7, 23]) {
    const html = render(lottery);
    const primary = html.slice(html.indexOf("Primary"), html.indexOf("Secondary"));
    const text = `Critical Hit Chance Increased by ${lottery}%`;
    assert.ok(primary.includes(`<span aria-hidden="true" class="d3-gray-diamond"></span>${text}`));
    assert.ok(primary.indexOf("data-primary-attributes") < primary.indexOf(text));
  }
});

test("Nephalem Relic omits the critical hit stat for non-lottery items", () => {
  const html = render(0);
  assert.doesNotMatch(html, /Critical Hit Chance Increased by|d3-gray-diamond/);
});
