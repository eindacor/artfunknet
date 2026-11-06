import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import ts from "typescript";
import * as settingsCore from "../../../server/game-settings.ts";
import * as rarityValues from "../../../server/rarity-values.ts";
import * as artworkEffects from "../../../server/artwork-effects.ts";
import * as artworkTypes from "../../../components/artwork-editor/types.ts";
import * as generationWeight from "../../../server/artwork-generation-weight.ts";
import * as cardCatalog from "../../../components/item-cards/catalog.ts";
import * as galleryLayout from "../../../components/gallery-layout.ts";

const require = createRequire(import.meta.url);
async function load<T>(relative: string, dependencies: Record<string, unknown> = {}, globals: Record<string, unknown> = {}) {
  const code = ts.transpileModule(await readFile(new URL(relative, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const modules: Record<string, unknown> = {
    react: React,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "next/server": require("next/server"),
    "next/link": require("next/link"),
    "@/components/gallery-layout": galleryLayout,
    "@/components/item-cards/catalog": cardCatalog,
    "@/components/item-cards/card-cosmetics-provider": { useCardCosmetics: () => [] },
    "@/components/artwork-editor/types": artworkTypes,
    "@/server/artwork-generation-weight": generationWeight,
    "@/server/game-settings": settingsCore,
    "@/server/rarity-values": rarityValues,
    "@/server/artwork-effects": artworkEffects,
    ...dependencies,
  };
  return runInNewContext(`${code}\nexports`, {
    exports: {}, Date, console, ...globals,
    require: (id: string) => {
      assert.ok(id in modules, `Unexpected dependency: ${id}`);
      return modules[id];
    },
  }) as T;
}

type Element = React.ReactElement<Record<string, unknown>>;
function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as React.ReactNode)];
}

function hooks() {
  const values: unknown[] = [];
  let index = 0;
  return {
    reset() { index = 0; },
    react: {
      ...React,
      useState(initial: unknown) {
        const slot = index++;
        if (!(slot in values)) values[slot] = initial;
        return [values[slot], (next: unknown) => {
          values[slot] = typeof next === "function" ? next(values[slot]) : next;
        }];
      },
      useRef(initial: unknown) {
        return values[index++] ??= { current: initial };
      },
    },
  };
}

test("the dedicated loot pool preserves distribution controls and their existing save paths", async t => {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  t.after(async () => { await client.close(); await server.stop(); });
  const database = client.db("loot-pool");
  const ranges = Object.fromEntries(rarityValues.RARITY_VALUE_TIERS.map(
    (rarity, index) => [rarity, { min: index * 100 + 1, max: (index + 1) * 100 }],
  )) as rarityValues.RarityValueRanges;
  await database.collection<{ _id: string }>("metadata").insertOne({
    _id: "loot-data", loot_data: { rarity_values: ranges },
  });
  await database.collection<{ _id: string }>("artworks").insertMany([
    { _id: "common", title: "Painting", active: true, rarity: "common", value_scale: 0.5 },
    { _id: "inactive", title: "Hidden", active: false, rarity: "common", value_scale: 0.2 },
    { _id: "legendary", title: "Legend", active: true, rarity: "legendary", value_scale: 0.5, effect_id: "effect" },
    { _id: "inactive-legendary", title: "Hidden legend", active: false, rarity: "legendary", value_scale: 0.5, effect_id: "effect" },
  ]);
  await database.collection<{ _id: string }>("artwork_effects").insertMany([
    { _id: "effect", title: "Shared effect", effect_type: "legendary", active: true },
    { _id: "unused", title: "Unused effect", effect_type: "masterpiece", active: true },
  ]);
  const settings = await settingsCore.getGameplaySettings(database);
  const chart = await load<typeof import("./artwork-value-distribution.tsx")>("./artwork-value-distribution.tsx");
  const artworkDependencies = { "./artwork-value-distribution": chart };
  const artworks = await load<typeof import("./loot-pool-artworks.tsx")>("./loot-pool-artworks.tsx", artworkDependencies);
  const form = await load<typeof import("../gameplay-settings-form.tsx")>("../gameplay-settings-form.tsx");
  const databaseDependency = { "@/server/mongodb": { getDatabase: async () => database } };

  await t.test("the new page and navigation contain all moved sections, without leaving duplicates", async () => {
    const page = await load<typeof import("./page.tsx")>("./page.tsx", {
      ...databaseDependency,
      "../gameplay-settings-form": form,
      "./loot-pool-artworks": artworks,
    });
    const html = renderToStaticMarkup(await page.default());
    for (const section of ["Loot pool", "Drop distributions", "Artwork breakdown", "Artwork value scale distribution", "Artwork effect distribution"]) {
      assert.ok(html.includes(section), section);
    }
    assert.match(html, /common \(1\)/);
    assert.match(html, /data-value-scale-total-weight="common">Total weight: 75/);
    assert.match(html, /Shared effect<\/span><span[^>]*>2<\/span>/);
    assert.match(html, /Unused effect<\/span><span[^>]*>0<\/span>/);
    assert.equal((html.match(/role="slider"/g) ?? []).length, 2);
    assert.doesNotMatch(html, /Hidden|Daily drops|Artwork value ranges|Gallery money/);
    const configHtml = renderToStaticMarkup(React.createElement(form.default, { initialSettings: settings, initialRarityValues: ranges }));
    assert.match(configHtml, /Daily drops/);
    assert.match(configHtml, /Artwork value ranges/);
    assert.doesNotMatch(configHtml, /Drop distributions|Rarity weights \(JSON\)/);

    const catalog = await load<typeof import("../catalog/catalog-editor.tsx")>("../catalog/catalog-editor.tsx", {
      "@/components/artwork-editor/artwork-editor-panel": { default: () => null },
    });
    const catalogHtml = renderToStaticMarkup(React.createElement(catalog.default, {
      initialArtists: [], initialArtworks: [], effectOptions: [], attributeOptions: [], rendererOptions: [],
    }));
    assert.match(catalogHtml, /Search/);
    assert.doesNotMatch(catalogHtml, /Artwork breakdown|Artwork value scale distribution|Artwork effect distribution/);
    const header = await load<typeof import("../admin-header.tsx")>("../admin-header.tsx", {
      "next/navigation": { usePathname: () => "/admin/loot-pool", useRouter: () => ({}) },
    });
    assert.match(renderToStaticMarkup(React.createElement(header.default, { email: "admin@example.com" })),
      /aria-current="page"[^>]*href="\/admin\/loot-pool"[^>]*>Loot pool<\/a>/);
  });

  await t.test("editing loot pool maps saves both configurations to the same admin metadata", async () => {
    const route = await load<typeof import("../../api/admin/gameplay-settings/route.ts")>("../../api/admin/gameplay-settings/route.ts", {
      ...databaseDependency,
      "@/server/admin-api": { requireAdminApi: async () => ({ ok: true, session: { email: "admin@example.com" } }) },
    });
    const state = hooks();
    let confirmed = false;
    let requests = 0;
    const editor = await load<typeof import("../gameplay-settings-form.tsx")>("../gameplay-settings-form.tsx", {
      react: state.react,
    }, {
      window: { confirm: () => confirmed },
      fetch: async (url: string, init: RequestInit) => {
        assert.equal(url, "/api/admin/gameplay-settings");
        assert.equal(init.method, "PATCH");
        requests++;
        return route.PATCH(new Request(`http://localhost${url}`, init));
      },
    });
    function render() {
      state.reset();
      return editor.default({ initialSettings: settings, initialRarityValues: ranges, panel: "loot-pool" });
    }
    const maps = {
      actual: {
        rarityWeights: { ...settings.actual.rarityWeights, rare: 123 },
        visitorRarityAmplifiers: { ...settings.actual.visitorRarityAmplifiers, silver: 7 },
        cardStyleWeights: { ...settings.actual.cardStyleWeights, postcard: 222 },
      },
      debug: {
        rarityWeights: { ...settings.debug.rarityWeights, common: 999 },
        visitorRarityAmplifiers: { ...settings.debug.visitorRarityAmplifiers, gold: 9 },
        cardStyleWeights: { ...settings.debug.cardStyleWeights, legacy: 333 },
      },
    };
    for (const name of ["actual", "debug"] as const) {
      const tab = elements(render()).find(element => element.props.role === "tab" && element.props.children === name)!;
      (tab.props.onClick as () => void)();
      const textareas = elements(render()).filter(element => element.type === "textarea");
      assert.equal(textareas.length, 3);
      [maps[name].rarityWeights, maps[name].visitorRarityAmplifiers, maps[name].cardStyleWeights].forEach((value, index) => {
        (textareas[index].props.onChange as (event: unknown) => void)({ target: { value: JSON.stringify(value) } });
      });
    }
    const submit = () => render().props.onSubmit({ preventDefault() {} } as React.FormEvent<HTMLFormElement>);
    await submit();
    assert.equal(requests, 0, "Actual map edits still require confirmation");
    confirmed = true;
    await submit();
    assert.equal(requests, 1);
    const persisted = await settingsCore.getGameplaySettings(database);
    for (const name of ["actual", "debug"] as const) {
      assert.deepEqual(persisted[name].rarityWeights, maps[name].rarityWeights);
      assert.deepEqual(persisted[name].visitorRarityAmplifiers, maps[name].visitorRarityAmplifiers);
      assert.deepEqual(persisted[name].cardStyleWeights, maps[name].cardStyleWeights);
      assert.equal(persisted[name].dailyDropCount, settings[name].dailyDropCount);
      assert.equal(persisted[name].galleryCameraHeightCm, settings[name].galleryCameraHeightCm);
    }
    assert.deepEqual((await database.collection("metadata").findOne({ _id: "loot-data" }))?.loot_data.rarity_values, ranges);

    const textarea = elements(render()).find(element => element.type === "textarea")!;
    (textarea.props.onChange as (event: unknown) => void)({ target: { value: "invalid JSON" } });
    await submit();
    assert.equal(requests, 1, "Invalid map input does not save");
  });

  await t.test("the relocated chart saves partial artwork edits, prevents duplicate saves, and preserves state on failure", async () => {
    const state = hooks();
    let finish: ((response: Response) => void) | undefined;
    let requests = 0;
    const panel = await load<typeof import("./loot-pool-artworks.tsx")>("./loot-pool-artworks.tsx", {
      ...artworkDependencies, react: state.react,
    }, {
      fetch: async (url: string, init: RequestInit) => {
        requests++;
        assert.equal(url, "/api/admin/artworks/art%2Fone");
        assert.equal(init.method, "PATCH");
        assert.deepEqual(JSON.parse(String(init.body)), { action: "value-scale", value_scale: 0.25 });
        return new Promise<Response>(resolve => { finish = resolve; });
      },
    });
    const initialArtworks = [{ _id: "art/one", title: "Painting", active: true, rarity: "common" as const, value_scale: 0.5 }];
    function renderChart() {
      state.reset();
      const tree = panel.default({ initialArtworks, effectDistribution: [] });
      return elements(tree).find(element => element.type === chart.default)!.props as React.ComponentProps<typeof chart.default>;
    }
    const save = renderChart().onSave("art/one", 0.25);
    assert.equal(renderChart().pending, true);
    assert.equal(await renderChart().onSave("art/one", 0.25), false);
    assert.equal(requests, 1);
    finish!(Response.json({ artwork: { ...initialArtworks[0], value_scale: 0.25 } }));
    assert.equal(await save, true);
    assert.equal(renderChart().pending, false);
    assert.equal(renderChart().artworks[0].value_scale, 0.25);
    const html = renderToStaticMarkup(React.createElement(chart.default, renderChart()));
    assert.match(html, /data-value-scale-total-weight="common">Total weight: 87/);
    const failed = renderChart().onSave("art/one", 0.25);
    finish!(Response.json({ error: "Save unavailable" }, { status: 400 }));
    await assert.rejects(failed, /Save unavailable/);
    assert.equal(renderChart().pending, false);
    assert.equal(renderChart().artworks[0].value_scale, 0.25);
  });
});
