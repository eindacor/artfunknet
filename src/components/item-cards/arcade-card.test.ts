import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { getArcadePixelSource } from "./arcade-pixel-art.ts";
import { formatItemSerialNumber } from "../../server/item-serial-format.ts";
import {
  getArtworkImageAdjustment,
  getArtworkImageBackgroundPosition,
  getArtworkImageZoomTranslation,
} from "./artwork-image-adjustments.ts";
import type { ItemCardRendererProps } from "./types.ts";

const require = createRequire(import.meta.url);
const code = ts.transpileModule(await readFile(new URL("./arcade-card.tsx", import.meta.url), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const SourceContext = React.createContext<string | undefined>(undefined);
const useSource = () => React.useContext(SourceContext) ?? "/api/artwork/bed/image?variant=card&v=version";
const sharedSource = await readFile(new URL("./shared.tsx", import.meta.url), "utf8");
const artworkImageCode = sharedSource.slice(sharedSource.indexOf("export function ArtworkImage("), sharedSource.indexOf("export function ItemStatusBadges("));
const ArtworkImage = runInNewContext(`${ts.transpileModule(artworkImageCode, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText}\nexports.ArtworkImage`, {
  exports: {}, require, useArtworkImageSource: useSource,
  getArtworkImageAdjustment, getArtworkImageBackgroundPosition, getArtworkImageZoomTranslation,
});
const shared = {
  ArtworkImageSourceContext: SourceContext,
  useArtworkImageSource: useSource,
  ArtworkImage,
  AttributeIcons: () => React.createElement("span", { "data-attributes": true }),
};
function load(react = React, dependencies: Record<string, unknown> = {}, globals: Record<string, unknown> = {}) {
  return runInNewContext(`${code}\n({ Card: exports.default, Artwork: ArcadeArtwork, fitTitle: fitArcadeTitle })`, {
    exports: {},
    require: (id: string) => ({
      react, "./shared": shared, "./arcade-pixel-art": { getArcadePixelSource },
      "@/server/item-serial-format": { formatItemSerialNumber }, ...dependencies,
    })[id] ?? require(id),
    ...globals,
  }) as {
    Card: (props: ItemCardRendererProps) => React.ReactElement;
    Artwork: (props: Pick<ItemCardRendererProps, "item">) => React.ReactElement<{ value: string }>;
    fitTitle: (heading: HTMLHeadingElement) => void;
  };
}
const { Card } = load();
const base = {
  artwork_id: "bed", card_renderer: "arcade", level: 27, condition: 0.95, values: { actual: 1200 },
  artwork: { title: "The Bed", artist: "Test artist", rarity: "rare" },
  lottery: 0, seasonal: false, unlocked: false, mint: false,
} as ItemCardRendererProps["item"];
function render(variants: Partial<typeof base>) {
  return renderToStaticMarkup(React.createElement(Card, {
    item: { ...base, ...variants }, alreadyOwned: false, legendaryAttributes: [],
  }));
}

test("lottery game titles use the exact sequel number without renaming the artwork or using its item level", () => {
  for (const lottery of [0, 1, 5, 12]) {
    const item = { ...base, lottery };
    const original = structuredClone(item);
    const html = renderToStaticMarkup(React.createElement(Card, { item, alreadyOwned: false, legendaryAttributes: [] }));
    const title = lottery ? `The Bed ${lottery}` : "The Bed";
    const heading = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1];
    assert.ok(heading);
    const accessibleTitle = heading
      .replace(/<span aria-hidden="true"[^>]*>[\s\S]*?<\/span>/g, "")
      .replace(/<[^>]+>/g, "");
    assert.equal(accessibleTitle, title, "Decorative chrome depth does not duplicate the accessible title");
    assert.match(heading, new RegExp(`<span class="arcade-title-face">${title}</span>`));
    assert.equal(html.includes(`aria-label="Lottery sequel ${lottery}"`), lottery > 0);
    assert.deepEqual(item, original);
  }
});

test("the lower-left spine shows the full item serial rather than its lottery volume", () => {
  for (const lottery of [0, 3]) {
    const html = render({ lottery, serial_prefix: 12345, serial_number: 23 });
    const spine = html.match(/class="arcade-box-spine">([\s\S]*?)<\/div>/)?.[1];
    assert.ok(spine);
    assert.match(spine, /<small title="Serial number: 12345-000023">12345-000023<\/small>/);
    assert.doesNotMatch(spine, /VOL\./);
    assert.equal(html.includes('aria-label="Lottery sequel 3"'), lottery === 3);
  }
  assert.match(render({ serial_number: undefined }), /<small title="Serial number: Not assigned">Not assigned<\/small>/);
});

test("each title plaque shares one arch effect across its lettering, background and border", () => {
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
    ...[0, 5].map(lottery => React.createElement(Card, {
      key: lottery, item: { ...base, lottery }, alreadyOwned: false, legendaryAttributes: [],
    })),
  ));
  const ids = [...html.matchAll(/<filter id="([^"]+)"/g)].map(match => match[1]);
  const references = [...html.matchAll(/<h3[^>]*style="filter:url\(#([^)]+)\)/g)].map(match => match[1]);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2);
  assert.deepEqual(references, ids);
  assert.equal([...html.matchAll(/filter:url\(/g)].length, 2, "Moving the curve must not add another effect per card");
});

test("title fitting shrinks overflowing words and lines, then restores normal sizing when space allows", () => {
  const baseSize = 26.4;
  const style = { fontSize: "", removeProperty() { this.fontSize = ""; } };
  let widthLimit = 18;
  let heightLimit = 22;
  let visible = true;
  const size = () => parseFloat(style.fontSize) || baseSize;
  const face = {
    clientWidth: 168,
    clientHeight: 60,
    get scrollWidth() { return size() > widthLimit ? 200 : 168; },
    get scrollHeight() { return size() > heightLimit ? 80 : 60; },
  };
  const heading = {
    style, querySelector: () => face,
    get clientWidth() { return visible ? 188 : 0; },
  } as unknown as HTMLHeadingElement;
  const { fitTitle } = load(React, {}, { getComputedStyle: () => ({ fontSize: `${baseSize}px` }) });
  fitTitle(heading);
  assert.ok(size() <= 18 && size() > 17.8, "Keep an oversized word intact at the largest fitting size");
  widthLimit = 30;
  heightLimit = 14;
  fitTitle(heading);
  assert.ok(size() <= 14 && size() > 13.8, "Fit the entire title rather than clipping additional lines");
  heightLimit = 30;
  fitTitle(heading);
  assert.equal(style.fontSize, "", "A shorter title or wider container restores CSS sizing");
  visible = false;
  fitTitle(heading);
  assert.equal(style.fontSize, "", "Do not shrink a card while it is hidden");
});

test("title fitting follows title changes and cover resizes, with observer cleanup", () => {
  let effect: React.EffectCallback | undefined;
  let dependencies: React.DependencyList | undefined;
  let resize: (() => void) | undefined;
  let observed: unknown;
  let disconnected = false;
  let fits = false;
  const cover = {};
  const style = { fontSize: "", removeProperty() { this.fontSize = ""; } };
  const heading = {
    parentElement: cover, clientWidth: 188, style,
    querySelector: () => ({
      clientWidth: 168, clientHeight: 60, scrollHeight: 60,
      get scrollWidth() { return fits || parseFloat(style.fontSize) <= 16 ? 168 : 240; },
    }),
  };
  const { Card: ClientCard } = load({
    ...React, useId: () => "test-title", useRef: () => ({ current: heading }),
    useLayoutEffect: (callback: React.EffectCallback, deps: React.DependencyList) => { effect = callback; dependencies = deps; },
  } as typeof React, {}, {
    getComputedStyle: () => ({ fontSize: "26.4px" }),
    ResizeObserver: class {
      constructor(callback: () => void) { resize = callback; }
      observe(element: unknown) { observed = element; }
      disconnect() { disconnected = true; }
    },
  });
  ClientCard({ item: base, alreadyOwned: false, legendaryAttributes: [] });
  assert.equal(dependencies?.[0], "The Bed");
  const cleanup = effect!();
  assert.equal(observed, cover);
  assert.ok(parseFloat(style.fontSize) <= 16);
  fits = true;
  resize!();
  assert.equal(style.fontSize, "");
  if (typeof cleanup === "function") cleanup();
  assert.equal(disconnected, true);
  ClientCard({ item: { ...base, lottery: 5 }, alreadyOwned: false, legendaryAttributes: [] });
  assert.equal(dependencies?.[0], "The Bed 5");
});

test("retro game packaging combines mint, unlocked and seasonal editions without losing branding or stats", () => {
  for (const mint of [false, true]) for (const unlocked of [false, true]) for (const seasonal of [false, true]) {
    const html = render({ mint, unlocked, seasonal, lottery: 5 });
    assert.match(html, /aria-label="ARTFUNKEL GAME SYSTEM"/);
    assert.match(html, /class="card-rarity-label">rare/);
    assert.match(html, /LV\. 27/);
    assert.match(html, /COND\. 95%/);
    assert.match(html, /\$1,200/);
    assert.match(html, /data-attributes="true"/);
    assert.equal(html.includes("ALL-ACCESS EDITION"), unlocked);
    assert.equal(html.includes("GAME WIZARD COMPATIBLE"), unlocked);
    assert.match(html, /aria-label="4-way play enabled"/);
    assert.match(html, /class="fa fa-gamepad"/);
    assert.match(html, /<strong>4-WAY<\/strong> <small>PLAY ENABLED<\/small>/);
    assert.doesNotMatch(html, /SEAL OF QUALITY|FACTORY|SEALED|MINT EDITION/);
    assert.equal(html.includes('class="arcade-shrink-wrap"'), mint);
    assert.equal(html.includes("HIGH QUALITY"), seasonal);
    if (seasonal) {
      assert.ok(html.indexOf('class="arcade-graphics-burst"') > html.indexOf("</h3>"), "The burst must sit outside the clipped artwork window");
    }
    assert.equal(html.includes('data-pixelated="true"'), seasonal);
    assert.match(html, /aria-hidden="true" class="arcade-cover-shade"/);
    assert.equal(html.includes("&amp;texture=1"), seasonal, "Seasonal canvas input uses the same-origin image delivery path");
  }
});

test("ordinary and seasonal covers preserve the selected art-style crop and accessible artwork description", () => {
  for (const seasonal of [false, true]) {
    const html = render({
      seasonal,
      artwork: { ...base.artwork, art_style_adjustments: {
        arcade: { x: 25, y: -20, scale: 1.5 },
        museum: { x: -50, y: 50, scale: 2 },
      } },
    });
    assert.match(html, /--artwork-image-position-x:37.5%/);
    assert.match(html, /--artwork-image-position-y:60%/);
    assert.match(html, /--artwork-image-scale:1.5/);
    assert.match(html, /aria-label="The Bed by Test artist"/);
    assert.equal(html.match(/role="img"/g)?.length, 1);
  }
});

test("seasonal artwork ignores stale pixel results and falls back safely while retaining the current source", async () => {
  let source = "/api/artwork/first/image?variant=card";
  let state: unknown = null;
  let effect: React.EffectCallback | undefined;
  const requests: { source: string; resolve: (value: string) => void; reject: (error: Error) => void }[] = [];
  const { Artwork } = load({
    ...React,
    useState: () => [state, (next: unknown) => { state = next; }],
    useEffect: (callback: React.EffectCallback) => { effect = callback; },
  } as typeof React, {
    "./shared": { ...shared, useArtworkImageSource: () => source },
    "./arcade-pixel-art": {
      getArcadePixelSource,
      loadArcadePixelArt: (source: string) => new Promise<string>((resolve, reject) => { requests.push({ source, resolve, reject }); }),
    },
  });
  assert.equal(Artwork({ item: base }).props.value, source);
  effect!();
  assert.equal(requests.length, 0, "Ordinary artwork never starts pixel conversion");
  const seasonal = { ...base, seasonal: true };
  assert.equal(Artwork({ item: seasonal }).props.value, getArcadePixelSource(source));
  const cleanup = effect!();
  source = "/api/artwork/second/image?variant=card";
  if (typeof cleanup === "function") cleanup();
  Artwork({ item: seasonal });
  const secondCleanup = effect!();
  requests[0].resolve("data:image/png;base64,old");
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(Artwork({ item: seasonal }).props.value, getArcadePixelSource(source));
  requests[1].resolve("data:image/png;base64,current");
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(Artwork({ item: seasonal }).props.value, "data:image/png;base64,current");
  assert.equal(Artwork({ item: base }).props.value, source, "Removing seasonal restores normal artwork immediately");
  if (typeof secondCleanup === "function") secondCleanup();
  source = "/api/artwork/failed/image?variant=card";
  Artwork({ item: seasonal });
  effect!();
  requests[2].reject(new Error("Unavailable"));
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(Artwork({ item: seasonal }).props.value, getArcadePixelSource(source));
});
