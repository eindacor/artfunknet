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
async function load(relative: string, dependencies: Record<string, unknown> = {}) {
  const code = ts.transpileModule(await readFile(new URL(relative, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return runInNewContext(`${code}\nexports.default`, {
    exports: {},
    require: (id: string) => {
      if (id === "react" || id === "react/jsx-runtime") return require(id);
      assert.ok(id in dependencies, `Unexpected component dependency: ${id}`);
      return dependencies[id];
    },
  });
}
const FeaturedWorksPanel = await load("./featured-works-panel.tsx", {
  "./info-panel/info-panel": { default: await load("./info-panel/info-panel.tsx", {
    "./info-panel.module.css": { default: { panel: "panel" } },
    "./info-panel.brash.module.css": { default: { panel: "brash" } },
  }) },
  "./gallery-stats/gallery-stats": { default: await load("./gallery-stats/gallery-stats.tsx") },
  "./gallery-stat/gallery-stat": { default: await load("./gallery-stat/gallery-stat.tsx") },
  "./attribute/attribute": { default: await load("./attribute/attribute.tsx", {
    "@/components/item-cards/shared": { ratingColor: () => "#123456" },
  }) },
}) as typeof FeaturedWorksPanelComponent;

test("featured slots remain visible for empty, partially filled, fully unlocked, and legacy collections", () => {
  for (const [count, capacity, empty, locked] of [
    [0, 5, 5, 5], [3, 7, 4, 3], [4, 5, 1, 5], [5, 5, 0, 5],
    [10, 10, 0, 0], [11, 10, 0, 0], [0, 12, 12, 0],
  ]) {
    const items = Array.from({ length: count }, (_, index) => ({ _id: `item-${index}` })) as HydratedGameItem[];
    const html = renderToStaticMarkup(React.createElement(FeaturedWorksPanel, {
      items, displayCapacity: capacity, maxDisplayCapacity: 10,
      rates: { value: 0, moneyPerHour: 0, xpPerHour: 0 }, attributeScore: 0, attributes: [], actions: null,
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

test("featured information shows earnings, value, attribute score, visitor help, and gallery actions", () => {
  const html = renderToStaticMarkup(React.createElement(FeaturedWorksPanel, {
    items: [], displayCapacity: 5, maxDisplayCapacity: 10,
    rates: { value: 15_000, moneyPerHour: 125, xpPerHour: 42 }, attributeScore: 1_234,
    attributes: [{
      id: "visitor", title: "Art Collector", icon: "fa-eye", type: "npc",
      count: 2, totalRating: 1.5, effectiveRating: 0.3,
    }],
    actions: React.createElement("button", null, "Go to my gallery"),
    renderItem: () => null,
  }));
  for (const value of ["Money per hour", "$125", "XP per hour", "42", "Total featured value", "$15,000", "Attribute score", "1,234"]) {
    assert.ok(html.includes(value), value);
  }
  assert.match(html, /Art Collector: 2 works, 30% effective attraction \(150 total \u00f7 5 display slots\)/);
  assert.match(html, /Go to my gallery/);
  assert.match(html, /Visitors you attract/);
  const helpButton = html.match(/<button[^>]*aria-label="How featuring attracts visitors"[^>]*>/)?.[0];
  const descriptionId = helpButton?.match(/aria-describedby="([^"]+)"/)?.[1];
  assert.ok(descriptionId, "The help control describes itself using the tooltip");
  assert.ok(html.includes(`id="${descriptionId}" role="tooltip"`));
  assert.match(html, /averaged across all unlocked feature slots, so empty slots dilute attraction/);
  assert.match(html, /artwork rarity and your level also matter/);
});
