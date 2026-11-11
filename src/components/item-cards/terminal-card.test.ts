import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import { formatItemSerialNumber } from "../../server/item-serial-format.ts";
import type { ItemCardRendererProps } from "./types.ts";

const require = createRequire(import.meta.url);
const atmosphereCompiled = ts.transpileModule(
  await readFile(new URL("./vaporwave-atmosphere.tsx", import.meta.url), "utf8"),
  {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const VaporwaveAtmosphere = runInNewContext(`${atmosphereCompiled}\nexports.default`, {
  exports: {},
  require,
});
const compiled = ts.transpileModule(
  await readFile(new URL("./terminal-card.tsx", import.meta.url), "utf8"),
  {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const VaporwaveCard = runInNewContext(`${compiled}\nexports.default`, {
  exports: {},
  require: (id: string) =>
    id === "./shared"
      ? {
          ArtworkImage: ({ className }: { className: string }) =>
            createElement("div", { className, "data-artwork": true }),
          AttributeIcons: () => createElement("span", { "data-attributes": true }),
        }
      : id === "./vaporwave-atmosphere"
        ? { default: VaporwaveAtmosphere }
        : id === "@/server/item-serial-format"
          ? { formatItemSerialNumber }
          : require(id),
}) as (props: ItemCardRendererProps) => ReactElement;

const item = {
  artwork_id: "a1b2c3d4e5f6",
  serial_number: 42,
  serial_prefix: 123,
  artwork: {
    title: "The Great Wave",
    artist: "Katsushika Hokusai",
    date: 1831,
    medium: "Woodblock print",
    rarity: "legendary",
  },
  level: 7,
  condition: 0.95,
  values: { actual: 1200 },
  seasonal: false,
  unlocked: false,
  mint: false,
  foil: false,
  lottery: 0,
} as ItemCardRendererProps["item"];

function render(variants: Partial<typeof item> = {}) {
  return renderToStaticMarkup(
    createElement(VaporwaveCard, {
      item: { ...item, ...variants },
      alreadyOwned: false,
      legendaryAttributes: [],
    }),
  );
}

test("seasonal editions use a sculptural weave instead of the discarded skyline and sun", () => {
  for (const unlocked of [false, true]) {
    const regular = render({ unlocked });
    const seasonal = render({ seasonal: true, unlocked });
    assert.doesNotMatch(regular, /vaporwave-card-seasonal-weave/);
    assert.match(seasonal, /vaporwave-card-seasonal-weave/);
    for (const html of [regular, seasonal]) {
      assert.doesNotMatch(html, /vaporwave-card-(sun|skyline|water|seasonal-scene)/);
      assert.match(html, /class="vaporwave-card-background" data-artwork="true"/);
      assert.match(html, /class="vaporwave-card-refracted-art" data-artwork="true"/);
      assert.equal((html.match(/<canvas/g) ?? []).length, 1);
      assert.equal(html.includes('aria-label="Unlocked"'), unlocked);
    }
  }
});

test("vaporwave separates identity, compact icon stats, and the attribute strip", () => {
  for (const seasonal of [false, true]) {
    const html = render({ seasonal });
    const header = html.match(/<header[^>]*>([\s\S]*?)<\/header>/)?.[1];
    const footer = html.match(/<footer[^>]*>([\s\S]*?)<\/footer>/)?.[1];
    assert.ok(header);
    assert.ok(footer);
    for (const value of ["The Great Wave", "Katsushika Hokusai"]) {
      assert.ok(header.includes(value));
    }
    for (const value of ["1831", "legendary", "Woodblock print", "Level: 7", "95%", "$1,200"]) {
      assert.ok(footer.includes(value));
    }
    assert.match(footer, /<i aria-hidden="true" class="fa fa-dollar"><\/i><strong aria-hidden="true">1\.2k<\/strong>/);
    assert.doesNotMatch(footer, /<small>|LV\.|CONDITION|VALUE/);
    assert.doesNotMatch(header, /data-attributes|1831|legendary|CONDITION|VALUE/);
    assert.doesNotMatch(footer, /data-attributes|The Great Wave|Katsushika Hokusai/);
    assert.match(html, /<div class="vaporwave-card-attributes"><span data-attributes="true"><\/span><\/div>/);
    assert.equal((html.match(/data-attributes/g) ?? []).length, 1);
  }
});

test("compact values and levels retain their exact values in accessible labels and tooltips", () => {
  for (const [actual, compact] of [
    [0, "0"],
    [875, "875"],
    [1000, "1k"],
    [1250, "1.3k"],
    [999999, "1m"],
    [1250000, "1.3m"],
  ] as const) {
    const html = render({ values: { ...item.values, actual }, level: 12345 });
    const label = `Value: $${actual.toLocaleString("en-US")}`;
    assert.ok(html.includes(`role="img" aria-label="${label}" title="${label}"`));
    assert.ok(html.includes(`<strong aria-hidden="true">${compact}</strong>`));
    assert.ok(html.includes('aria-label="Level: 12,345" title="Level: 12,345"'));
    assert.ok(html.includes('<strong aria-hidden="true">12.3k</strong>'));
    assert.ok(html.includes('aria-label="Condition: 95%" title="Condition: 95%"'));
  }
});

test("the separate serial uses the real artwork prefix and assigned item number", () => {
  const html = render();
  assert.match(html, /class="vaporwave-card-serial"[^>]*>123-000042<\/span>/);
  assert.ok(html.includes('title="Serial number: 123-000042"'));
  assert.doesNotMatch(html.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? "", /123-000042/);
  assert.match(render({ serial_prefix: 789, serial_number: 3 }), />789-000003<\/span>/);
  assert.match(render({ serial_number: undefined }), />Not assigned<\/span>/);
});

test("vaporwave material modifiers compose independently without adding a duplicate foil layer", () => {
  for (let mask = 0; mask < 32; mask++) {
    const variants = {
      mint: Boolean(mask & 1),
      unlocked: Boolean(mask & 2),
      seasonal: Boolean(mask & 4),
      foil: Boolean(mask & 8),
      lottery: mask & 16 ? 7 : 0,
    };
    const html = render(variants);
    for (const [effect, enabled] of [
      ["mint-facet", variants.mint],
      ["signal-slices", variants.unlocked],
      ["seasonal-weave", variants.seasonal],
      ["lottery-seal", variants.lottery > 0],
    ] as const) {
      assert.equal(html.includes(`aria-hidden="true" class="vaporwave-card-${effect}"`), enabled);
    }
    for (const [label, enabled] of [
      ["Mint", variants.mint],
      ["Unlocked", variants.unlocked],
      ["Seasonal", variants.seasonal],
      ["Foil", variants.foil],
      ["Lottery level 7", variants.lottery > 0],
    ] as const) {
      assert.equal(html.includes(`aria-label="${label}"`), enabled);
    }
    assert.equal(html.includes('data-foil="true"'), variants.foil);
    assert.doesNotMatch(html, /render-card-foil-sheen/);
  }
  for (const lottery of [1, 10]) {
    assert.match(render({ lottery }), new RegExp(`aria-label="Lottery level ${lottery}"`));
  }
});
