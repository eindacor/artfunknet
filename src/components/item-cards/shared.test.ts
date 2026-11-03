import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import {
  getArchiveArtStyle,
  getArchiveCategories,
} from "../../server/archive-gameplay.ts";
import type { ItemCardRendererProps } from "./types.ts";

const source = ts.createSourceFile(
  "shared.tsx",
  await readFile(new URL("./shared.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const component = source.statements.find(
  (statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === "ItemVariantBadges",
)!;
const compiled = ts.transpileModule(component.getText(source), {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const ItemVariantBadges = runInNewContext(`${compiled}\nexports.ItemVariantBadges`, {
  exports: {},
  require: createRequire(import.meta.url),
  getArchiveArtStyle,
  getArchiveCategories,
  useCardCosmetics: () => [],
}) as (props: Pick<ItemCardRendererProps, "item">) => ReactElement;

const item = {
  original: true,
  mint: false,
  foil: true,
  unlocked: false,
  seasonal: false,
  vintage: false,
  lottery: 0,
  card_renderer: "museum",
  archivedCategories: ["standard", "foil"],
  archivedArtStyles: [],
} as ItemCardRendererProps["item"];

test("item details show Original independently of archived variant badges", () => {
  const html = renderToStaticMarkup(createElement(ItemVariantBadges, { item }));
  assert.match(html, /aria-label="original" class="item-property-badge property-original">original<\/span>/);
  assert.match(html, /aria-label="foil, archived" class="item-property-badge property-foil variant-archived"/);
  assert.deepEqual(getArchiveCategories(item), ["standard", "foil"]);
});

test("item details omit Original for ordinary works", () => {
  const html = renderToStaticMarkup(createElement(ItemVariantBadges, {
    item: { ...item, original: false },
  }));
  assert.doesNotMatch(html, /property-original|aria-label="original"/);
  assert.match(html, /property-foil variant-archived/);
});
