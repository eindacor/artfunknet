import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import type { HydratedGameItem } from "../server/item-artwork.ts";
import type FeaturedWorksPanelComponent from "./featured-works-panel.tsx";

const require = createRequire(import.meta.url);
const sharedSource = ts.createSourceFile("shared.tsx",
  await readFile(new URL("./item-cards/shared.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const ratingColorSource = sharedSource.statements.find(statement =>
  ts.isFunctionDeclaration(statement) && statement.name?.text === "ratingColor",
)!;
const ratingColor = runInNewContext(`${ts.transpileModule(ratingColorSource.getText(sharedSource), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText}\nratingColor`, { exports: {} }) as (value: number) => string;

async function load(relative: string, dependencies: Record<string, unknown> = {}) {
  const code = ts.transpileModule(await readFile(new URL(relative, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return runInNewContext(`${code}\nexports`, {
    exports: {},
    require: (id: string) => {
      if (id === "react" || id === "react/jsx-runtime") return require(id);
      assert.ok(id in dependencies, `Unexpected component dependency: ${id}`);
      return dependencies[id];
    },
  });
}
const attributeModule = await load("./attribute/attribute.tsx", {
  "@/components/item-cards/shared": { ratingColor },
});
const FeaturedWorksPanel = (await load("./featured-works-panel.tsx", {
  "./info-panel/info-panel": await load("./info-panel/info-panel.tsx", {
    "./info-panel.module.css": { default: { panel: "panel" } },
    "./info-panel.brash.module.css": { default: { panel: "brash" } },
  }),
  "./gallery-stats/gallery-stats": await load("./gallery-stats/gallery-stats.tsx"),
  "./gallery-stat/gallery-stat": await load("./gallery-stat/gallery-stat.tsx"),
  "./item-cards/shared": { ratingColor },
  "./attribute/attribute": attributeModule,
})).default as typeof FeaturedWorksPanelComponent;

test("featured slots remain visible for empty, partially filled, fully unlocked, and legacy collections", () => {
  for (const [count, capacity, empty, locked] of [
    [0, 5, 5, 5], [3, 7, 4, 3], [4, 5, 1, 5], [5, 5, 0, 5],
    [10, 10, 0, 0], [11, 10, 0, 0], [0, 12, 12, 0],
  ]) {
    const items = Array.from({ length: count }, (_, index) => ({ _id: `item-${index}` })) as HydratedGameItem[];
    const html = renderToStaticMarkup(React.createElement(FeaturedWorksPanel, {
      items, displayCapacity: capacity, maxDisplayCapacity: 10,
      rates: { value: 0, moneyPerHour: 0, xpPerHour: 0 }, attributeScore: 0, attributes: [], visitorTypes: [], actions: null,
      renderItem: item => React.createElement("article", { "data-featured-item": item._id }),
    }));
    assert.equal((html.match(/data-featured-item=/g) ?? []).length, count);
    assert.equal((html.match(/aria-label="Empty feature slot /g) ?? []).length, empty);
    assert.equal((html.match(/aria-label="Locked feature slot /g) ?? []).length, locked);
    const warning = html.match(/<p class="home-featured-warning" role="status">([\s\S]*?)<\/p>/)?.[1];
    if (empty > 0) {
      assert.ok(warning);
      assert.ok(warning.includes(`${empty} unoccupied feature ${empty === 1 ? "slot" : "slots"}.`));
      assert.match(warning, /Fill all available slots to attract more visitors and earn money and XP\./);
    } else {
      assert.equal(warning, undefined, "Locked slots and over-capacity collections must not trigger warnings");
    }
  }
});

test("featured information shows earnings, value, visitor attraction score, visitor help, and gallery actions", () => {
  const html = renderToStaticMarkup(React.createElement(FeaturedWorksPanel, {
    items: [], displayCapacity: 5, maxDisplayCapacity: 10,
    rates: { value: 15_000, moneyPerHour: 125, xpPerHour: 42 }, attributeScore: 1_234,
    attributes: [{
      id: "visitor", title: "Art Collector", icon: "fa-eye", type: "npc",
      count: 2, totalRating: 1.5, effectiveRating: 0.3,
    }],
    visitorTypes: [{ id: "visitor", name: "Art Collector", icon: "fa-eye" }],
    actions: React.createElement("button", null, "Go to your gallery"),
    renderItem: () => null,
  }));
  for (const value of ["Money per hour", "$125", "XP per hour", "42", "Total featured value", "$15,000", "Visitor attraction score", "1,234"]) {
    assert.ok(html.includes(value), value);
  }
  assert.match(html, /Art Collector: 2 works, 30% effective attraction \(150 total \u00f7 5 display slots\)/);
  assert.match(html, /Go to your gallery/);
  assert.match(html, /Effective attraction/);
  const helpButton = html.match(/<button[^>]*aria-label="How featuring attracts visitors"[^>]*>/)?.[0];
  const descriptionId = helpButton?.match(/aria-describedby="([^"]+)"/)?.[1];
  assert.ok(descriptionId, "The help control describes itself using the tooltip");
  assert.ok(html.includes(`id="${descriptionId}" role="tooltip"`));
  assert.match(html, /symbols on each card show which visitor types are attracted/);
  assert.match(html, /Visitors in your own gallery\s+give bigger bonuses!/);
});

test("the attraction chart joins every active visitor to its effective rating on a fixed percent scale", () => {
  const visitorTypes = [
    { id: "collector", name: "Art Collector", icon: "fa-binoculars" },
    { id: "dealer", name: "Art Dealer", icon: "fa-shopping-cart" },
    { id: "donor", name: "Art Donor", icon: "fa-share-square" },
    { id: "expert", name: "Art Expert", icon: "fa-info" },
  ];
  const base = { type: "primary", count: 2, totalRating: 1.5, icon: "fa-tag" };
  const attributes = [
    { ...base, id: "dealer", title: "Dealer bonus", effectiveRating: 0.875 },
    { ...base, id: "inactive", title: "Inactive visitor", effectiveRating: 0.9 },
    { ...base, id: "expert", title: "Expert bonus", effectiveRating: 1.2 },
    { ...base, id: "collector", title: "Collector bonus", effectiveRating: 0.214 },
  ];
  for (const empty of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(FeaturedWorksPanel, {
      items: [], displayCapacity: 7, maxDisplayCapacity: 10,
      rates: { value: 0, moneyPerHour: 0, xpPerHour: 0 }, attributeScore: 0,
      attributes: empty ? [] : attributes, visitorTypes, actions: null, renderItem: () => null,
    }));
    const columns = [...html.matchAll(/<li\b[^>]*class="home-featured-chart-column"[\s\S]*?<\/li>/g)].map(match => match[0]);
    assert.equal(columns.length, visitorTypes.length, "Unrepresented visitor types must not disappear");
    assert.match(html, /100%<\/span><span>50%<\/span><span>0%<\/span>/);
    assert.ok(!html.includes("Inactive visitor"), "Only the active visitor catalog defines chart columns");
    for (const [index, column] of columns.entries()) {
      const effectiveRating = empty ? 0 : [0.214, 0.875, 0, 1][index];
      const percentage = Math.round(effectiveRating * 100);
      assert.ok(column.includes(`aria-label="${visitorTypes[index].name}: `));
      assert.ok(column.includes(`${percentage}% effective attraction`));
      assert.match(column, /tabindex="0"/, "Visitor values must be keyboard-accessible");
      assert.ok(column.includes(`class="fa ${visitorTypes[index].icon}"`));
      assert.equal((column.match(/style="color:([^"]+)"/g) ?? []).length, 2);
      assert.equal((column.match(/style="color:([^"]+)"/g) ?? []).every(style =>
        style === `style="color:${ratingColor(effectiveRating)}"`), true, "The bar and icon share the existing rating gradient");
      const height = Number.parseFloat(column.match(/class="home-featured-chart-bar" style="height:([^"]+)"/)![1]);
      assert.ok(Math.abs(height - effectiveRating * 100) < 0.001, "Bars use effective attraction, not raw rating or a relative maximum");
    }
  }
});

test("bars and icons share the full original attribute hover text, including single-work and zero-attraction details", () => {
  for (const scenario of [
    { attributes: [{ id: "collector", title: "Collector bonus", icon: "fa-eye", type: "primary",
      count: 1, totalRating: 0.75, effectiveRating: 0.15 }],
      expected: "Art Collector: 1 work, 15% effective attraction (75 total \u00f7 5 display slots)" },
    { attributes: [],
      expected: "Art Collector: 0 works, 0% effective attraction (0 total \u00f7 5 display slots)" },
  ]) {
    const html = renderToStaticMarkup(React.createElement(FeaturedWorksPanel, {
      items: [], displayCapacity: 5, maxDisplayCapacity: 10,
      rates: { value: 0, moneyPerHour: 0, xpPerHour: 0 }, attributeScore: 0,
      attributes: scenario.attributes, visitorTypes: [{ id: "collector", name: "Art Collector", icon: "fa-eye" }],
      actions: null, renderItem: () => null,
    }));
    const column = html.match(/<li\b[^>]*class="home-featured-chart-column"[^>]*>/)![0];
    const icon = html.match(/<i\b[^>]*class="fa fa-eye"[^>]*>/)![0];
    for (const element of [column, icon]) {
      assert.ok(element.includes(`title="${scenario.expected}"`), "Both hover targets show the complete rating breakdown");
      assert.ok(element.includes(`aria-label="${scenario.expected}"`), "Keyboard and screen reader users get the same details");
    }
  }
});

test("the attraction chart handles an empty active visitor catalog without inventing visitor types", () => {
  const html = renderToStaticMarkup(React.createElement(FeaturedWorksPanel, {
    items: [], displayCapacity: 5, maxDisplayCapacity: 10,
    rates: { value: 0, moneyPerHour: 0, xpPerHour: 0 }, attributeScore: 0,
    attributes: [], visitorTypes: [], actions: null, renderItem: () => null,
  }));
  assert.match(html, /No active visitor types\./);
  assert.ok(!html.includes("home-featured-chart-column"));
});
