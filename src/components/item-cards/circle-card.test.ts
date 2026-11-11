import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createContext, createElement, useContext, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { formatItemSerialNumber } from "../../server/item-serial-format.ts";
import type { ItemCardRendererProps } from "./types.ts";

const require = createRequire(import.meta.url);
const sourceContext = createContext<string | undefined>(undefined);
const shared = {
  ArtworkImageSourceContext: sourceContext,
  useArtworkImageSource: () => useContext(sourceContext) ?? "original-artwork",
  ArtworkImage: ({ className, item }: ItemCardRendererProps & { className: string }) =>
    createElement("div", {
      className,
      role: "img",
      "aria-label": `${item.artwork.title} by ${item.artwork.artist}`,
      "data-source": useContext(sourceContext) ?? "original-artwork",
      "data-renderer": item.card_renderer,
    }),
  AttributeIcons: () => createElement("span", { "data-attributes": true }),
};

async function load(file: string, dependencies: Record<string, unknown>) {
  const compiled = ts.transpileModule(
    await readFile(new URL(file, import.meta.url), "utf8"),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  return runInNewContext(`${compiled}\nexports.default`, {
    exports: {},
    require: (id: string) => Object.hasOwn(dependencies, id) ? dependencies[id] : require(id),
  });
}

const artwork = await load("./pop-art-artwork.tsx", {
  "./shared": shared,
  "./pop-art-halftone": { loadPopArtHalftone: () => { throw new Error("SSR must not process image pixels."); } },
});
const PopArtCard = await load("./circle-card.tsx", {
  "./shared": shared,
  "./pop-art-artwork": { default: artwork },
  "@/server/item-serial-format": { formatItemSerialNumber },
}) as (props: ItemCardRendererProps) => ReactElement;

const item = {
  artwork_id: "a1b2c3d4e5f6",
  card_renderer: "circle",
  serial_number: 42,
  serial_prefix: 123,
  artwork: {
    title: "Impression, Sunrise",
    artist: "Claude Monet",
    date: 1872,
    medium: "Oil on canvas",
    rarity: "legendary",
  },
  level: 7,
  condition: 0.95,
  values: { actual: 1200 },
  mint: false,
  unlocked: false,
  seasonal: false,
  foil: false,
  lottery: 0,
} as ItemCardRendererProps["item"];

function render(variants: Partial<typeof item> = {}) {
  return renderToStaticMarkup(createElement(PopArtCard, {
    item: { ...item, ...variants }, alreadyOwned: false, legendaryAttributes: [],
  }));
}

test("Pop Art replaces the orbit layout without hiding artwork or item information before hydration", () => {
  const html = render();
  assert.doesNotMatch(html, /circle-card|orbit|<canvas/);
  for (const value of [
    "Impression, Sunrise", "Claude Monet", "1872", "Oil on canvas",
    "legendary", "LV. 7", "95%", "$1.2K", "123-000042",
  ]) assert.ok(html.includes(value), value);
  assert.match(html, /data-source="original-artwork" data-renderer="circle"/);
  assert.equal((html.match(/data-attributes="true"/g) ?? []).length, 1);
  assert.ok(html.includes('title="$1,200"'));
});

test("the burst keeps the original artwork while seasonal halftones stay in the decorative background", () => {
  for (const seasonal of [false, true]) {
    const html = render({ seasonal });
    const foreground = html.match(/<figure class="pop-art-card-print">[\s\S]*?<\/figure>/)?.[0] ?? "";
    assert.match(foreground, /class="pop-art-card-burst"/);
    assert.match(foreground, /class="pop-art-card-image"[^>]*data-source="original-artwork"/);
    assert.equal((foreground.match(/role="img"/g) ?? []).length, 1);
    assert.doesNotMatch(foreground, /pop-art-card-panel|data-halftone/);
    assert.match(html, /class="pop-art-card-backdrop" aria-hidden="true"/);
    assert.equal((html.match(/class="pop-art-card-panel"/g) ?? []).length, seasonal ? 4 : 1);
    assert.equal((html.match(/class="pop-art-card-backdrop-image"/g) ?? []).length, seasonal ? 4 : 1);
    assert.equal(html.includes('aria-label="Seasonal"'), seasonal);
  }
});

test("source overrides reach both the original burst and its background without changing saved crop identity", () => {
  const source = "/api/artwork/preview/image?admin=1&v=changed";
  const html = renderToStaticMarkup(createElement(sourceContext, { value: source },
    createElement(PopArtCard, {
      item: { ...item, seasonal: true }, alreadyOwned: false, legendaryAttributes: [],
    }),
  ));
  assert.equal((html.match(/data-source="\/api\/artwork\/preview\/image\?admin=1&amp;v=changed"/g) ?? []).length, 5);
  assert.equal((html.match(/data-renderer="circle"/g) ?? []).length, 5);
  assert.doesNotMatch(html, /original-artwork/);
});

test("print editions compose independently and show the actual positive lottery level", () => {
  for (let mask = 0; mask < 32; mask++) {
    const variants = {
      mint: Boolean(mask & 1), unlocked: Boolean(mask & 2),
      seasonal: Boolean(mask & 4), foil: Boolean(mask & 8),
      lottery: mask & 16 ? 7 : 0,
    };
    const html = render(variants);
    for (const [label, enabled] of [
      ["Mint", variants.mint], ["Unlocked", variants.unlocked],
      ["Seasonal", variants.seasonal], ["Foil", variants.foil],
      ["Lottery level 7", variants.lottery > 0],
    ] as const) assert.equal(html.includes(`aria-label="${label}"`), enabled);
    assert.doesNotMatch(html, /render-card-foil-sheen/);
  }
  assert.ok(render({ lottery: 10 }).includes('aria-label="Lottery level 10"'));
  assert.doesNotMatch(render({ lottery: -1 }), /pop-art-card-lottery/);
});
