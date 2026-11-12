import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as imageAdjustments from "../components/item-cards/artwork-image-adjustments.ts";
import * as imageUrls from "./artwork-image-url.ts";
import { createArtistArtworkPreview } from "./artist-artwork-preview.ts";
import type { FeaturedArtistGallery, PublicArtistProfile } from "./artist-types.ts";
import { formatItemDropChance } from "./item-drop-chance-format.ts";
import { formatItemSerialNumber } from "./item-serial-format.ts";
import { getItemAttributeCounts } from "./item-attribute-counts.ts";
import type { Artwork } from "./gameplay.ts";
import * as galleryFinishes from "./gallery-finishes.ts";
import * as tutorialElements from "../shared/tutorial.ts";
import { ART_DONOR_ATTRIBUTE_ID } from "./legendary-attributes.ts";
import * as galleryLayout from "../components/gallery-layout.ts";
import * as oauthProviders from "./oauth-providers.ts";
import { buildGalleryMetadataSnapshot } from "./gallery-metadata-core.ts";
import type { AuctionView } from "./auction-gameplay.ts";
import * as auctionBidPermissions from "./auction-bid-permissions.ts";
import * as artistFeatureLinks from "../shared/artist-feature-link.ts";
import * as settingsCore from "./game-settings.ts";
import * as cardCatalog from "../components/item-cards/catalog.ts";
import * as rarityValues from "./rarity-values.ts";
import { getAdminReviewCounts } from "./admin-review-counts.ts";
import type { GalleryChatMessageView } from "./gallery-chat.ts";

const require = createRequire(import.meta.url);
const cardSharedSource = ts.createSourceFile("shared.tsx",
  await readFile(new URL("../components/item-cards/shared.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const cardHelpers = runInNewContext(`${ts.transpileModule(cardSharedSource.statements
  .filter(statement => ts.isFunctionDeclaration(statement) &&
    ["ratingColor", "getActiveLegendaryAttribute"].includes(statement.name?.text ?? ""))
  .map(statement => statement.getText(cardSharedSource)).join("\n"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText}\nexports`, { exports: {} });

async function load<T>(relative: string, dependencies: Record<string, unknown> = {}, globals: Record<string, unknown> = {}) {
  if (relative === "../components/artist-gallery.tsx") {
    dependencies = {
      ...dependencies,
      "./artist-feature": await load("../components/artist-feature.tsx", dependencies, globals),
    };
  }
  if (relative === "../app/play/galleries/gallery-explorer.tsx") {
    dependencies = {
      ...dependencies,
      "@/components/gallery-exhibition": await load("../components/gallery-exhibition.tsx", dependencies, globals),
    };
  }
  if (relative === "../components/gallery-exhibition.tsx") {
    const raritySummary = await load("../components/gallery-rarity-summary.tsx");
    const shareButton = await load("../components/gallery-share-button.tsx", { react: dependencies.react ?? React }, globals);
    const chart = await load("../components/gallery-attraction-chart.tsx", {
      "./item-cards/shared": cardHelpers,
      "./attribute/attribute": await load("../components/attribute/attribute.tsx", {
        "@/components/item-cards/shared": cardHelpers,
      }),
    });
    dependencies = {
      ...dependencies,
      "@/components/item-cards/shared": { ...cardHelpers, ...dependencies["@/components/item-cards/shared"] as object },
      "@/components/gallery-rarity-summary": raritySummary,
      "@/components/gallery-share-button": shareButton,
      "@/components/featured-work-content": await load("../components/featured-work-content.tsx", {
        "@/components/artwork-thumbnail": { default: () => null },
        "@/components/item-cards/artwork-image-adjustments": imageAdjustments,
      }),
      "@/components/featured-works-panel": await load("../components/featured-works-panel.tsx", {
        "./info-panel/info-panel": await load("../components/info-panel/info-panel.tsx", {
          "./info-panel.module.css": { default: { panel: "panel" } },
          "./info-panel.brash.module.css": { default: { panel: "brash" } },
        }),
        "./gallery-stats/gallery-stats": await load("../components/gallery-stats/gallery-stats.tsx"),
        "./gallery-stat/gallery-stat": await load("../components/gallery-stat/gallery-stat.tsx"),
        "./gallery-attraction-chart": chart,
        "./gallery-rarity-summary": raritySummary,
        "./gallery-share-button": shareButton,
      }),
    };
  }
  const source = await readFile(new URL(relative, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return runInNewContext(`${code}\nexports`, {
    exports: {}, URL, Date, console, ...globals,
    require: (name: string) => {
      const modules = {
        react: React, "react/jsx-runtime": require("react/jsx-runtime"), "next/link": require("next/link"),
        "next/navigation": { useRouter: () => ({ refresh() {} }), usePathname: () => "" },
        "@/shared/tutorial": tutorialElements,
        "@/shared/artist-feature-link": artistFeatureLinks,
        "./item-cards/artwork-image-adjustments": imageAdjustments,
        "@/server/legendary-attributes": { ART_DONOR_ATTRIBUTE_ID },
        "@/components/tutorial/tutorial-provider": {
          useTutorial: () => ({ showTutorial: () => false, fulfillTutorial: async () => false }),
        },
        ...dependencies,
      };
      assert.ok(name in modules, `Unexpected dependency: ${name}`);
      return modules[name as keyof typeof modules];
    },
  }) as T;
}

test("admin navigation shows review indicators only for pending applications, reports, and artwork submissions", async () => {
  const queries: Array<{ collection: string; filter: Record<string, unknown> }> = [];
  const counts = { artist_applications: 2, artworks: 3, artwork_change_requests: 4, gallery_chat_messages: 5 };
  const database = {
    collection: (collection: keyof typeof counts) => ({
      countDocuments: async (filter: Record<string, unknown>) => {
        queries.push({ collection, filter });
        return counts[collection];
      },
    }),
  } as unknown as Parameters<typeof getAdminReviewCounts>[0];
  const reviewCounts = await getAdminReviewCounts(database);
  assert.deepEqual(reviewCounts, { artistApplications: 2, artworkSubmissions: 7, chatReports: 5 });
  assert.deepEqual(queries, [
    { collection: "artist_applications", filter: { status: { $in: ["pending", "approving"] } } },
    { collection: "artworks", filter: { submission_status: "pending", active: false } },
    { collection: "artwork_change_requests", filter: { status: { $in: ["pending", "approving"] } } },
    { collection: "gallery_chat_messages", filter: { reported: true, moderated_at: { $exists: false } } },
  ]);

  const header = await load<typeof import("../app/admin/admin-header.tsx")>("../app/admin/admin-header.tsx", {
    "next/navigation": { usePathname: () => "/admin/artist-applications", useRouter: () => ({}) },
  });
  const html = renderToStaticMarkup(React.createElement(header.default, { email: "admin@example.com", reviewCounts }));
  assert.match(html, /Artist applications<span[^>]*aria-label="2 pending artist applications"[^>]*>2<\/span>/);
  assert.match(html, /Artwork submissions<span[^>]*aria-label="7 pending artwork submissions"[^>]*>7<\/span>/);
  assert.match(html, /Chat reports<span[^>]*aria-label="5 pending chat reports"[^>]*>5<\/span>/);
  const empty = renderToStaticMarkup(React.createElement(header.default, {
    email: "admin@example.com",
    reviewCounts: { artistApplications: 0, artworkSubmissions: 0, chatReports: 0 },
  }));
  assert.doesNotMatch(empty, /pending artist applications|pending artwork submissions|pending chat reports/);

  const Header = (props: Record<string, unknown>) => React.createElement("header", props);
  const databaseToken = {};
  const layout = await load<typeof import("../app/admin/layout.tsx")>("../app/admin/layout.tsx", {
    "./admin-header": { default: Header },
    "@/server/session": { requireAdmin: async () => ({ email: "admin@example.com" }) },
    "@/components/artwork-image-scope": { AdminArtworkImages: ({ children }: { children: React.ReactNode }) => children },
    "@/server/admin-review-counts": { getAdminReviewCounts: async (value: unknown) => {
      assert.equal(value, databaseToken);
      return reviewCounts;
    } },
    "@/server/mongodb": { getDatabase: async () => databaseToken },
  });
  const tree = await layout.default({ children: React.createElement("main") });
  const container = tree.props.children as React.ReactElement<{ children: React.ReactNode }>;
  const renderedHeader = React.Children.toArray(container.props.children)[0] as React.ReactElement<Record<string, unknown>>;
  assert.equal(renderedHeader.type, Header);
  assert.deepEqual(renderedHeader.props.reviewCounts, reviewCounts);
});

test("admin review actions refresh the pending indicators after successful moderation", async () => {
  let refreshes = 0;
  const chatRequests: Array<Record<string, unknown>> = [];
  const hooks = { ...React, useState: (initial: unknown) => [initial, () => {}] };
  const navigation = { useRouter: () => ({ refresh: () => { refreshes++; } }) };
  type Element = React.ReactElement<Record<string, unknown>>;
  function elements(node: React.ReactNode): Element[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement<Record<string, unknown>>(node)) return [];
    return [node, ...elements(node.props.children as React.ReactNode)];
  }
  const applications = await load<typeof import("../app/admin/artist-applications/application-reviews.tsx")>(
    "../app/admin/artist-applications/application-reviews.tsx", { react: hooks, "next/navigation": navigation }, {
      fetch: async () => Response.json({ status: "ok" }),
    });
  const application = applications.default({ applications: [{
    id: "application", name: "Artist", email: "artist@example.com", dateOfBirth: "2000-01-01",
    portfolioUrl: "https://example.com", bio: "", screenName: "Artist", existingPlayer: true,
    submittedAt: null, status: "pending",
  }] });
  (elements(application).find(element => element.props.children === "Approve")!.props.onClick as () => void)();

  const chat = await load<typeof import("../app/admin/chat-reports/chat-report-list.tsx")>(
    "../app/admin/chat-reports/chat-report-list.tsx", { react: hooks, "next/navigation": navigation }, {
      fetch: async (_url: string, options: RequestInit) => {
        chatRequests.push(JSON.parse(String(options.body)) as Record<string, unknown>);
        return Response.json({ status: "ok" });
      },
    });
  const reports = chat.default({ reports: [{
    id: "report", galleryOwnerId: "global", galleryOwnerName: "Global", authorId: "player",
    authorName: "Player", content: "Message", createdAt: new Date().toISOString(),
    reportCount: 1, hidden: false, moderatedAt: null, moderatedBy: null,
  }] });
  (elements(reports).find(element => element.props.children === "Hide message")!.props.onClick as () => void)();
  await new Promise(resolve => setImmediate(resolve));
  (elements(reports).find(element => element.props.children === "Dismiss")!.props.onClick as () => void)();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(chatRequests, [
    { id: "report", hidden: true },
    { id: "report", action: "dismiss" },
  ]);
  assert.equal(refreshes, 3);
});

test("dismissing a chat report records a no-action review without hiding the message", async () => {
  let filter: unknown;
  let update: unknown;
  const route = await load<typeof import("../app/api/admin/chat-reports/route.ts")>(
    "../app/api/admin/chat-reports/route.ts",
    {
      "next/server": {
        NextResponse: {
          json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
        },
      },
      "@/server/admin-api": {
        requireAdminApi: async () => ({
          ok: true,
          session: { email: "admin@example.test" },
        }),
      },
      "@/server/gallery-chat": {
        createGlobalSystemChatMessage: async () => {},
        ensureGalleryChatIndexes: async () => {},
        getGalleryChatReports: async () => [],
      },
      "@/server/mongodb": {
        getDatabase: async () => ({
          collection: () => ({
            updateOne: async (nextFilter: unknown, nextUpdate: unknown) => {
              filter = nextFilter;
              update = nextUpdate;
              return { matchedCount: 1 };
            },
          }),
        }),
      },
    },
  );
  const response = await route.PATCH(new Request("http://localhost/api/admin/chat-reports", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "report", action: "dismiss" }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", dismissed: true });
  assert.deepEqual(JSON.parse(JSON.stringify(filter)), {
    _id: "report",
    reported: true,
    dismissed_at: { $exists: false },
    hidden: { $ne: true },
  });
  const set = (update as { $set: Record<string, unknown> }).$set;
  assert.equal(set.dismissed_by, "admin@example.test");
  assert.equal(set.moderated_by, "admin@example.test");
  assert.equal(set.hidden, undefined);
  assert.ok(set.dismissed_at instanceof Date);
  assert.equal(set.moderated_at, set.dismissed_at);
});

test("admin gallery settings edit and submit independent Actual and Debug values", async () => {
  const settings = {
    actual: settingsCore.DEFAULT_ACTUAL_GAMEPLAY_CONFIG, debug: settingsCore.DEFAULT_DEBUG_GAMEPLAY_CONFIG,
    debugEnabled: false, activeConfigName: "actual" as const, active: settingsCore.DEFAULT_ACTUAL_GAMEPLAY_CONFIG,
  };
  const ranges = Object.fromEntries(rarityValues.RARITY_VALUE_TIERS.map(
    (rarity, index) => [rarity, { min: index * 100 + 1, max: (index + 1) * 100 }],
  )) as rarityValues.RarityValueRanges;
  const states: unknown[] = [];
  let stateIndex = 0;
  let saved: { actual: settingsCore.GameplayConfig; debug: settingsCore.GameplayConfig } | undefined;
  const form = await load<typeof import("../app/admin/gameplay-settings-form.tsx")>("../app/admin/gameplay-settings-form.tsx", {
    react: {
      ...React, useState: (initial: unknown) => {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (next: unknown) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
      },
    },
    "@/components/gallery-layout": galleryLayout,
    "@/components/item-cards/catalog": cardCatalog,
    "@/components/item-cards/card-cosmetics-provider": { useCardCosmetics: () => [] },
    "@/server/rarity-values": rarityValues,
  }, {
    window: { confirm: () => true },
    fetch: async (_url: string, init: RequestInit) => {
      saved = JSON.parse(String(init.body));
      return Response.json({ settings: { ...settings, ...saved }, rarityValues: ranges });
    },
  });
  type Element = React.ReactElement<Record<string, unknown>>;
  function elements(node: React.ReactNode): Element[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement<Record<string, unknown>>(node)) return [];
    return [node, ...elements(node.props.children as React.ReactNode)];
  }
  function render() {
    stateIndex = 0;
    return form.default({ initialSettings: settings, initialRarityValues: ranges });
  }
  function cameraField(tree: React.ReactNode) {
    return elements(tree).find(element => element.props.label === "Zoomed-out camera distance")!;
  }
  function visitorField(tree: React.ReactNode) {
    return elements(tree).find(element => element.props.label === "Visitor scale coefficient")!;
  }
  function field(tree: React.ReactNode, label: string) {
    return elements(tree).find(element => element.props.label === label)!;
  }
  let tree = render();
  const galleryGroup = elements(tree).find(element => element.props.title === "Gallery");
  assert.ok(galleryGroup);
  for (const label of ["Camera height", "Artwork centerline height", "Zoomed-out camera distance",
    "Visitor scale coefficient", "NPC spawn interval", "Featured artist visitor chance"]) {
    assert.ok(field(galleryGroup, label), `${label} belongs to the Gallery section`);
    assert.equal(elements(tree).filter(element => element.props.label === label).length, 1);
  }
  assert.equal(field(tree, "Camera height").props.value, 158);
  assert.equal(field(tree, "Artwork centerline height").props.value, 140);
  assert.equal(cameraField(tree).props.value, 600);
  assert.equal(visitorField(tree).props.value, 0.8);
  (cameraField(tree).props.onChange as (value: number) => void)(1250);
  (visitorField(tree).props.onChange as (value: number) => void)(0.55);
  (field(tree, "Camera height").props.onChange as (value: number) => void)(175);
  (field(tree, "Artwork centerline height").props.onChange as (value: number) => void)(160);
  (field(tree, "NPC spawn interval").props.onChange as (value: number) => void)(7);
  (field(tree, "Featured artist visitor chance").props.onChange as (value: number) => void)(35);
  tree = render();
  assert.equal(cameraField(tree).props.value, 1250);
  assert.equal(visitorField(tree).props.value, 0.55);
  assert.equal(field(tree, "Camera height").props.value, 175);
  assert.equal(field(tree, "Artwork centerline height").props.value, 160);
  const debugTab = elements(tree).find(element => element.props.role === "tab" && element.props.children === "debug")!;
  (debugTab.props.onClick as () => void)();
  tree = render();
  assert.equal(cameraField(tree).props.value, 600);
  assert.equal(visitorField(tree).props.value, 0.8);
  assert.equal(field(tree, "Camera height").props.value, 158);
  assert.equal(field(tree, "Artwork centerline height").props.value, 140);
  (cameraField(tree).props.onChange as (value: number) => void)(450);
  (visitorField(tree).props.onChange as (value: number) => void)(1.35);
  (field(tree, "Camera height").props.onChange as (value: number) => void)(185);
  (field(tree, "Artwork centerline height").props.onChange as (value: number) => void)(170);
  tree = render();
  assert.equal(cameraField(tree).props.value, 450);
  assert.equal(visitorField(tree).props.value, 1.35);
  await tree.props.onSubmit({ preventDefault() {} } as React.FormEvent<HTMLFormElement>);
  assert.equal(saved?.actual.galleryOverviewDistanceCm, 1250);
  assert.equal(saved?.debug.galleryOverviewDistanceCm, 450);
  assert.equal(saved?.actual.galleryVisitorScale, 0.55);
  assert.equal(saved?.debug.galleryVisitorScale, 1.35);
  assert.equal(saved?.actual.galleryCameraHeightCm, 175);
  assert.equal(saved?.actual.galleryArtworkCenterHeightCm, 160);
  assert.equal(saved?.debug.galleryCameraHeightCm, 185);
  assert.equal(saved?.debug.galleryArtworkCenterHeightCm, 170);
  assert.equal(saved?.actual.npcSpawnIntervalMinutes, 7);
  assert.equal(saved?.actual.featuredArtistVisitorChance, 0.35);
});

test("admin decimal settings preserve typing drafts, allow long decimals, and submit numeric values without changing integer fields", async () => {
  const settings = {
    actual: settingsCore.DEFAULT_ACTUAL_GAMEPLAY_CONFIG, debug: settingsCore.DEFAULT_DEBUG_GAMEPLAY_CONFIG,
    debugEnabled: false, activeConfigName: "actual" as const, active: settingsCore.DEFAULT_ACTUAL_GAMEPLAY_CONFIG,
  };
  const ranges = Object.fromEntries(rarityValues.RARITY_VALUE_TIERS.map(
    (rarity, index) => [rarity, { min: index * 100 + 1, max: (index + 1) * 100 }],
  )) as rarityValues.RarityValueRanges;
  const states = new Map<string, unknown[]>();
  let scope = "form";
  let stateIndex = 0;
  let saved: { actual: settingsCore.GameplayConfig; debug: settingsCore.GameplayConfig } | undefined;
  const form = await load<typeof import("../app/admin/gameplay-settings-form.tsx")>("../app/admin/gameplay-settings-form.tsx", {
    react: {
      ...React, useState: (initial: unknown) => {
        if (!states.has(scope)) states.set(scope, []);
        const values = states.get(scope)!;
        const index = stateIndex++;
        if (!(index in values)) values[index] = initial;
        return [values[index], (next: unknown) => { values[index] = typeof next === "function" ? next(values[index]) : next; }];
      },
    },
    "@/components/gallery-layout": galleryLayout,
    "@/components/item-cards/catalog": cardCatalog,
    "@/components/item-cards/card-cosmetics-provider": { useCardCosmetics: () => [] },
    "@/server/rarity-values": rarityValues,
  }, {
    window: { confirm: () => true },
    fetch: async (_url: string, init: RequestInit) => {
      saved = JSON.parse(String(init.body));
      assert.equal(settingsCore.validateGameplayConfig(saved!.actual).ok, true);
      return Response.json({ settings: { ...settings, ...saved }, rarityValues: ranges });
    },
  });
  type Element = React.ReactElement<Record<string, unknown>>;
  function elements(node: React.ReactNode): Element[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement<Record<string, unknown>>(node)) return [];
    return [node, ...elements(node.props.children as React.ReactNode)];
  }
  function render() {
    scope = "form";
    stateIndex = 0;
    return form.default({ initialSettings: settings, initialRarityValues: ranges });
  }
  function field(label: string) {
    return elements(render()).find(element => element.props.label === label)!;
  }
  function renderInput(element: Element) {
    scope = String(element.props.label);
    stateIndex = 0;
    const tree = (element.type as (props: Record<string, unknown>) => React.ReactNode)(element.props);
    return elements(tree).find(child => child.type === "input")!.props;
  }
  function input(label: string) {
    return renderInput(field(label));
  }
  function type(label: string, text: string) {
    (input(label).onChange as (event: unknown) => void)({ target: { value: text } });
    assert.equal(input(label).value, text, "Typing must preserve decimal points and trailing zeros");
  }
  const cutoff = "Level 1 drop chance cutoff";
  type(cutoff, "");
  assert.equal(field(cutoff).props.value, settings.actual.offerRevealThresholds.level1, "Clearing must not silently set zero");
  for (const text of ["0", "0.", "0.0", "0.00", "0.000000", "0.0000001234567890123"]) type(cutoff, text);
  type("Level 2 drop chance cutoff", "0.0000000001234567890123");
  type("Level 3 drop chance cutoff", "0.0000000000001234567890123");
  type("Foil probability", "0.000000123456789");
  type("Featured artist visitor chance", "0.123456789");
  type("Crate value scalar", "1.1234567890123");
  type("Mint value multiplier", "1.1234567890123");
  type("Item repair amount", "1.1234567890123");
  type("Forgery return refund", "0.91234567890123");
  type("Visitor scale coefficient", "0.81234567890123");
  const floats = elements(render()).filter(element => ["%", "coefficient", "×"].includes(String(element.props.suffix)));
  for (const element of floats) {
    const label = String(element.props.label);
    assert.equal(renderInput(element).step, "any", label);
  }
  assert.equal(input("Daily drop item count").step, 1);
  assert.equal(input(cutoff).min, 0);
  assert.equal(input(cutoff).max, 1);
  (input(cutoff).onBlur as (event: unknown) => void)({ currentTarget: { validity: { valid: true } } });
  assert.equal(Number(input(cutoff).value), 0.0000001234567890123);
  type(cutoff, "2");
  (input(cutoff).onBlur as (event: unknown) => void)({ currentTarget: { validity: { valid: false } } });
  assert.equal(input(cutoff).value, "2", "Out-of-range drafts remain visible for native validation");
  type(cutoff, "0.0000001234567890123");
  await render().props.onSubmit({ preventDefault() {} } as React.FormEvent<HTMLFormElement>);
  assert.deepEqual(saved?.actual.offerRevealThresholds, {
    level1: 0.0000001234567890123, level2: 0.0000000001234567890123, level3: 0.0000000000001234567890123,
  });
  assert.equal(saved?.actual.foilProbability, Number("0.000000123456789") / 100);
  assert.equal(saved?.actual.featuredArtistVisitorChance, Number("0.123456789") / 100);
  assert.equal(saved?.actual.crateValueScalar, 1.1234567890123);
  assert.equal(saved?.actual.mintValueMultiplier, 1.1234567890123);
  assert.equal(saved?.actual.repairAmount, Number("1.1234567890123") / 100);
  assert.equal(saved?.actual.forgeryReturnRefundCoefficient, 0.91234567890123);
  assert.equal(saved?.actual.galleryVisitorScale, 0.81234567890123);
  assert.deepEqual(saved?.debug, settings.debug);
});

test("the artist application requires new-player credentials and clearly displays locked account details for signed-in players", async () => {
  const datePicker = await load<typeof import("../components/date-picker.tsx")>("../components/date-picker.tsx");
  const form = await load<typeof import("../app/artists/apply/application-form.tsx")>("../app/artists/apply/application-form.tsx", {
    "@/components/date-picker": datePicker,
  });
  for (const existingPlayer of [null, { email: "existing@example.com", screenName: "Existing-Player" }]) {
    const html = renderToStaticMarkup(React.createElement(form.default, { existingPlayer, latestBirthDate: "2008-11-02" }));
    for (const name of ["name", "dateOfBirth", "portfolioUrl", "featureLink", "bio"]) assert.ok(html.includes(`name="${name}"`), name);
    const featureInput = html.match(/<input\b[^>]*name="featureLink"[^>]*>/)?.[0];
    assert.ok(featureInput);
    assert.doesNotMatch(featureInput, /required=""/);
    for (const name of ["email", "screenName"]) {
      const input = html.match(new RegExp(`<input\\b[^>]*name="${name}"[^>]*>`))?.[0];
      assert.ok(input, name);
      if (existingPlayer) {
        assert.match(input, /disabled=""/);
        assert.ok(input.includes(`value="${existingPlayer[name as keyof typeof existingPlayer]}"`));
      } else {
        assert.match(input, /required=""/);
        assert.doesNotMatch(input, / disabled=""/);
      }
    }
    for (const name of ["password", "confirmPassword"]) {
      assert.equal(html.includes(`name="${name}"`), !existingPlayer, name);
    }
    assert.match(html, /type="url"[^>]*required/);
    assert.doesNotMatch(html, /type="date"/);
    assert.equal((html.match(/<select[^>]*required=""/g) ?? []).length, 3);
    assert.match(html, /Submit artist application/);
    if (existingPlayer) {
      assert.match(html, /You are already signed in/);
      assert.match(html, /no new account or password is created/);
      assert.match(html, /Keep using your existing login/);
    } else assert.match(html, /Become a contributing artist/);
  }
});

test("the application page shows the current stored email and username even while an application is pending", async () => {
  const datePicker = await load<typeof import("../components/date-picker.tsx")>("../components/date-picker.tsx");
  const form = await load<typeof import("../app/artists/apply/application-form.tsx")>("../app/artists/apply/application-form.tsx", {
    "@/components/date-picker": datePicker,
  });
  for (const pending of [false, true]) {
    const page = await load<typeof import("../app/artists/apply/page.tsx")>("../app/artists/apply/page.tsx", {
      "next/navigation": { redirect: () => assert.fail("This player is not already an artist.") },
      "@/server/session": { getPlayerSession: async () => ({ playerId: "player-id", email: "stale@example.com", screenName: "Stale-Name" }) },
      "@/server/mongodb": { getDatabase: async () => ({
        collection: (name: string) => ({
          findOne: async () => name === "players"
            ? { _id: "player-id", email: "current@example.com", screen_name: "Current-Name" }
            : pending ? { _id: "application-id" } : null,
        }),
      }) },
      "./application-form": { default: form.default },
    });
    const html = renderToStaticMarkup(await page.default());
    for (const [name, value] of [["email", "current@example.com"], ["screenName", "Current-Name"]]) {
      const input = html.match(new RegExp(`<input\\b[^>]*name="${name}"[^>]*>`))?.[0];
      assert.ok(input, name);
      assert.match(input, / disabled=""/);
      assert.ok(input.includes(`value="${value}"`));
    }
    assert.doesNotMatch(html, /stale@example.com|Stale-Name/);
    assert.match(html, /Applying with your existing player account/);
    assert.match(html, /Keep using your existing login/);
    if (pending) {
      assert.match(html, /Application awaiting review/);
      assert.doesNotMatch(html, /Submit artist application|name="password"/);
    }
  }
});

test("the reusable date picker completes month/year choices, clears invalid days, and enforces date bounds", async () => {
  let state: unknown;
  const picker = await load<typeof import("../components/date-picker.tsx")>("../components/date-picker.tsx", {
    react: {
      useState: (initial: unknown) => {
        if (state === undefined) state = initial;
        return [state, (next: unknown) => { state = typeof next === "function" ? next(state) : next; }];
      },
    },
  });
  const props = { label: "Date of birth", name: "dateOfBirth", min: "1900-03-10", max: "2008-11-02", required: true };
  let view = picker.default(props);
  type Element = React.ReactElement<Record<string, unknown>>;
  function elements(node: React.ReactNode): Element[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement<Record<string, unknown>>(node)) return [];
    return [node, ...elements(node.props.children as React.ReactNode)];
  }
  const selects = () => elements(view).filter(element => element.type === "select");
  const submittedDate = () => elements(view).find(element => element.type === "input")!.props.value;
  const options = (index: number) => elements(selects()[index]).filter(element => element.type === "option").map(element => element.props.value);
  const change = (index: number, value: string) => {
    (selects()[index].props.onChange as (event: unknown) => void)({ target: { value } });
    view = picker.default(props);
  };
  assert.equal(submittedDate(), "");
  assert.ok(selects().every(select => select.props.required));
  assert.equal(selects()[1].props.disabled, true);
  change(0, "1991");
  assert.equal(selects()[1].props.disabled, false);
  assert.equal(selects()[2].props.disabled, true);
  change(1, "11");
  assert.equal(submittedDate(), "");
  assert.equal(selects()[2].props.disabled, false);
  change(2, "19");
  assert.equal(submittedDate(), "1991-11-19");
  change(0, "2000");
  change(1, "02");
  change(2, "29");
  assert.equal(submittedDate(), "2000-02-29");
  change(0, "2001");
  assert.equal(submittedDate(), "");
  assert.equal(options(2).includes("29"), false);
  change(1, "01");
  change(2, "31");
  change(1, "04");
  assert.equal(submittedDate(), "");
  assert.equal(options(2).includes("31"), false);
  change(0, "2008");
  assert.equal(options(1).includes("12"), false);
  change(1, "11");
  assert.deepEqual(options(2), ["", "01", "02"]);
  change(2, "02");
  assert.equal(submittedDate(), props.max);
  change(0, "1900");
  assert.equal(options(1).includes("02"), false);
  change(1, "03");
  assert.equal(submittedDate(), "");
  assert.equal(options(2).includes("09"), false);
  change(2, "10");
  assert.equal(submittedDate(), props.min);
  change(0, "");
  assert.equal(submittedDate(), "");
  assert.equal(selects()[1].props.value, "");
  assert.equal(selects()[2].props.value, "");
  assert.equal(picker.default({ ...props, disabled: true }).props.disabled, true);
});

test("admin artist applications render missing and malformed submission dates without hiding reviews", async () => {
  const reviews = await load<typeof import("../app/admin/artist-applications/application-reviews.tsx")>(
    "../app/admin/artist-applications/application-reviews.tsx",
  );
  const date = "2026-10-12T12:00:00.000Z";
  const dateString = "2026-10-13T12:00:00.000Z";
  const applications = [undefined, new Date(date), dateString, null, "not-a-date", new Date(NaN), true]
    .map((createdAt, index) => ({
      _id: `application-${index}`, name: `Applicant ${index}`, email: "applicant@example.com",
      date_of_birth: "2000-01-02", portfolio_url: "https://portfolio.example.com/", bio: "",
      screen_name: "Player", existing_player: true, status: "pending",
      ...(createdAt === undefined ? {} : { created_at: createdAt }),
    }));
  let views: Parameters<typeof reviews.default>[0]["applications"] = [];
  const page = await load<typeof import("../app/admin/artist-applications/page.tsx")>(
    "../app/admin/artist-applications/page.tsx", {
      "@/server/mongodb": { getDatabase: async () => ({
        collection: () => ({ find: () => ({ sort: () => ({ toArray: async () => applications }) }) }),
      }) },
      "./application-reviews": { default: (props: Parameters<typeof reviews.default>[0]) => {
        views = props.applications;
        return React.createElement(reviews.default, props);
      } },
    },
  );
  const html = renderToStaticMarkup(await page.default());
  assert.deepEqual(Array.from(views, application => application.submittedAt), [null, date, dateString, null, null, null, null]);
  assert.equal((html.match(/<dd>Unknown<\/dd>/g) ?? []).length, 5);
  assert.doesNotMatch(html, /Invalid Date/);
  for (const application of applications) assert.ok(html.includes(application.name));
  assert.equal((html.match(/>Approve<\/button>/g) ?? []).length, applications.length);
});

test("artists use the shared artwork editor with Submit and without artist, rarity or active-in-game fields", async () => {
  const editor = await load<typeof import("../components/artwork-editor/artwork-editor-panel.tsx")>(
    "../components/artwork-editor/artwork-editor-panel.tsx", {
      "next/image": { default: () => null },
      "@/components/item-cards/artwork-image-adjustments": imageAdjustments,
      "@/server/artwork-image-url": imageUrls,
      "@/components/artwork-image-scope": { useArtworkImageScope: () => "public" },
      "./artwork-customization-panel": { default: () => null },
      "./types": { ARTWORK_EDITOR_RARITIES: ["common", "uncommon", "rare", "legendary", "masterpiece"] },
    },
  );
  const props = {
    mode: "add" as const, artists: [{ id: "artist-id", name: "Artist", dateOfBirth: "", dateOfDeath: "", artworkCount: 0 }],
    rendererOptions: [], onSave: async () => undefined,
  };
  const artist = renderToStaticMarkup(React.createElement(editor.default, { ...props, artistSubmission: true }));
  assert.doesNotMatch(artist, /aria-label="Artist"|aria-label="Rarity"|Active in game|>Accept<\/button>/);
  assert.match(artist, />Submit<\/button>/);
  for (const label of ["Artwork image", "Genre or style", "Medium", "Height (cm)"]) assert.ok(artist.includes(label), label);
  assert.match(artist, /name="image"/);
  const admin = renderToStaticMarkup(React.createElement(editor.default, props));
  assert.match(admin, /aria-label="Artist"/);
  assert.match(admin, /aria-label="Rarity"/);
  assert.match(admin, /Active in game/);
  assert.match(admin, />Accept<\/button>/);
});

test("submission reviews keep rarity but omit artist, value and effect controls while catalog editing retains them", async () => {
  const editor = await load<typeof import("../components/artwork-editor/artwork-editor-panel.tsx")>(
    "../components/artwork-editor/artwork-editor-panel.tsx", {
      "next/image": { default: () => null },
      "@/components/item-cards/artwork-image-adjustments": imageAdjustments,
      "@/server/artwork-image-url": imageUrls,
      "@/components/artwork-image-scope": { useArtworkImageScope: () => "admin" },
      "./artwork-customization-panel": { default: () => null },
      "./types": { ARTWORK_EDITOR_RARITIES: ["common", "uncommon", "rare", "legendary", "masterpiece"] },
    },
  );
  const reviews = await load<typeof import("../app/admin/artwork-submissions/artwork-submission-reviews.tsx")>(
    "../app/admin/artwork-submissions/artwork-submission-reviews.tsx", {
      "@/components/artwork-editor/artwork-editor-panel": editor,
      "next/image": { default: () => null }, "@/server/artwork-image-url": imageUrls,
    },
  );
  for (const rarity of ["rare", "legendary", "masterpiece"] as const) {
    const artwork = {
      _id: "submission", artist_id: "artist-id", artist: "Artist", title: "Pending work", date: 2026,
      genre: "Abstract", medium: "Oil", height: 100, width: 80, active: false, rarity, value_scale: 0.5,
    };
    const props = {
      artists: [{ id: "artist-id", name: "Artist", dateOfBirth: "", dateOfDeath: "", artworkCount: 0 }],
      rendererOptions: [], onSave: async () => undefined,
    };
    const html = renderToStaticMarkup(React.createElement(reviews.default, { ...props, initialWorks: [artwork] }));
    assert.match(html, /aria-label="Rarity"/);
    assert.match(html, /Accept artwork/);
    assert.doesNotMatch(html, /aria-label="Artist"|Value scale|Unique effect|Special attribute|Active in game/);
    const catalog = renderToStaticMarkup(React.createElement(editor.default, { ...props, artwork, mode: "edit" }));
    assert.match(catalog, /aria-label="Artist"/);
    assert.match(catalog, /Value scale/);
    assert.match(catalog, rarity === "rare" ? /Special attribute/ : /Unique effect/);
  }
});

test("artwork creation and catalog editing save feature card crops independently of thumbnail crops", async () => {
  for (const mode of ["add", "edit"] as const) {
    const states: unknown[] = [];
    let stateIndex = 0;
    const artwork: Artwork = {
      _id: "work", artist_id: "artist-id", artist: "Artist", title: "Artwork", date: 2026,
      genre: "Abstract", medium: "Oil", height: 100, width: 80, active: true,
      rarity: "common", value_scale: 0.5, thumbnail_adjustment: { x: 25, y: -30, scale: 1.5 },
    };
    const customization = { default: () => null };
    const editor = await load<typeof import("../components/artwork-editor/artwork-editor-panel.tsx")>(
      "../components/artwork-editor/artwork-editor-panel.tsx", {
        react: {
          ...React, useEffect: () => {}, useRef: () => ({ current: null }),
          useState: (initial: unknown) => {
            const index = stateIndex++;
            if (!(index in states)) {
              states[index] = typeof initial === "function" ? initial() : initial;
              if (mode === "add" && index === 1) states[index] = new File(["image"], "art.png");
              if (mode === "add" && index === 2) states[index] = { url: "data:image/png;base64,test", width: 80, height: 100 };
            }
            return [states[index], (next: unknown) => {
              states[index] = typeof next === "function" ? next(states[index]) : next;
            }];
          },
        },
        "next/image": { default: () => null },
        "@/components/item-cards/artwork-image-adjustments": imageAdjustments,
        "@/server/artwork-image-url": imageUrls,
        "@/components/artwork-image-scope": { useArtworkImageScope: () => "admin" },
        "./artwork-customization-panel": customization,
        "./types": { ARTWORK_EDITOR_RARITIES: ["common", "uncommon", "rare", "legendary", "masterpiece"] },
      },
    );
    let sent: unknown;
    const props = {
      mode, artwork: mode === "edit" ? artwork : undefined,
      artists: [{ id: "artist-id", name: "Artist", dateOfBirth: "", dateOfDeath: "", artworkCount: 0 }],
      rendererOptions: [], onSave: async (metadata: unknown) => { sent = metadata; return undefined; },
    };
    const render = () => { stateIndex = 0; return editor.default(props); };
    type Element = React.ReactElement<{ children?: React.ReactNode }>;
    function elements(node: React.ReactNode): Element[] {
      if (Array.isArray(node)) return node.flatMap(elements);
      if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
      return [node, ...elements(node.props.children)];
    }
    let form = render();
    const panel = elements(form).find(element => element.type === customization.default) as
      React.ReactElement<Parameters<typeof import("../components/artwork-editor/artwork-customization-panel.tsx").default>[0]>;
    assert.ok(panel, mode);
    assert.deepEqual(panel.props.artwork.feature_card_adjustment,
      mode === "add" ? { x: 0, y: 0, scale: 1 } : artwork.thumbnail_adjustment);
    const featureCard = { x: -40, y: 12, scale: 2 };
    const thumbnail = { x: 30, y: -10, scale: 1.75 };
    panel.props.onFeatureCardChange(featureCard);
    panel.props.onThumbnailChange(thumbnail);
    if (mode === "edit") {
      props.artwork = { ...artwork, value_scale: 0.8 };
      render();
    }
    form = render();
    await form.props.onSubmit({ preventDefault() {}, currentTarget: {} });
    const saved = sent as Artwork;
    assert.deepEqual(saved.feature_card_adjustment, featureCard, mode);
    assert.deepEqual(saved.thumbnail_adjustment, thumbnail, mode);
    if (mode === "edit") assert.equal(saved.value_scale, 0.8, "Chart updates must not discard other unsaved edits");
    assert.deepEqual(Object.keys(saved.art_style_adjustments ?? {}), []);
    assert.deepEqual(Array.from(saved.detail_image_adjustments ?? []), []);
  }
});

test("feature card crop previews support dragging, zoom, reset and disabled controls", async () => {
  const hooks = {
    ...React, useId: () => "crop",
    useRef: () => ({ current: null }),
    useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, () => {}],
  };
  const crop = await load<typeof import("../components/artwork-editor/artwork-crop-control.tsx")>(
    "../components/artwork-editor/artwork-crop-control.tsx", {
      react: hooks, "@/components/item-cards/artwork-image-adjustments": imageAdjustments,
    },
  );
  const customization = await load<typeof import("../components/artwork-editor/artwork-customization-panel.tsx")>(
    "../components/artwork-editor/artwork-customization-panel.tsx", {
      react: hooks,
      "@/components/artwork-detail-image": { default: () => null },
      "@/components/artwork-thumbnail": { default: () => null },
      "@/components/item-cards/artwork-image-adjustments": imageAdjustments,
      "@/components/item-cards/registry": { CARD_RENDERERS: { museum: () => null } },
      "@/components/item-cards/render-card-preview": { default: () => null },
      "@/components/item-cards/shared": { ArtworkImageSourceContext: () => null },
      "./artwork-crop-control": crop,
    },
  );
  const artwork: Artwork = {
    _id: "work", artist_id: "artist", artist: "Artist", title: "Artwork", date: 2026,
    genre: "Abstract", medium: "Oil", height: 100, width: 80, active: true,
    rarity: "common", value_scale: 0.5,
    thumbnail_adjustment: { x: 25, y: -30, scale: 1.5 },
    feature_card_adjustment: { x: -20, y: 10, scale: 1.5 },
  };
  type Element = React.ReactElement<Record<string, unknown>>;
  function elements(node: React.ReactNode): Element[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement<Record<string, unknown>>(node)) return [];
    return [node, ...elements(node.props.children as React.ReactNode)];
  }
  function preview(disabled = false) {
    const panel = customization.default({
      artwork, sourceUrl: "data:image/png;base64,test", rendererOptions: [], disabled,
      onStyleChange: () => assert.fail("Feature crops cannot change art style crops"),
      onDetailChange: () => assert.fail("Feature crops cannot change detail crops"),
      onThumbnailChange: () => assert.fail("Feature crops cannot change thumbnails"),
      onFeatureCardChange: adjustment => { artwork.feature_card_adjustment = adjustment; },
    });
    const feature = elements(panel).find(element => element.props.label === "Feature card crop") as
      React.ReactElement<Parameters<typeof crop.default>[0]>;
    assert.ok(feature);
    assert.match(feature.props.frameClassName!, /home-featured-card/);
    const image = elements(feature.props.children).find(element => element.props.variant === "card") as
      React.ReactElement<{ adjustment: Artwork["feature_card_adjustment"]; variant: string; sourceUrl: string; fixedFocalPoint: boolean }>;
    assert.deepEqual({ ...image.props.adjustment }, { ...artwork.feature_card_adjustment });
    assert.equal(image.props.fixedFocalPoint, true);
    assert.equal(image.props.variant, "card");
    assert.equal(image.props.sourceUrl, "data:image/png;base64,test");
    return elements(crop.default(feature.props));
  }
  let controls = preview();
  const stage = controls.find(element => element.props.onPointerDown)!;
  const event = {
    button: 0, pointerId: 1, clientX: 0, clientY: 0,
    currentTarget: {
      querySelector: () => null, getBoundingClientRect: () => ({ width: 360, height: 118 }),
      setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {},
    },
  };
  (stage.props.onPointerDown as (event: unknown) => void)(event);
  (stage.props.onPointerMove as (event: unknown) => void)({ ...event, clientX: 36, clientY: -11.8 });
  (stage.props.onPointerUp as (event: unknown) => void)(event);
  assert.deepEqual(artwork.feature_card_adjustment, { x: -10, y: 0, scale: 1.5 });
  controls = preview();
  (controls.find(element => element.type === "input")!.props.onChange as (event: unknown) => void)({ target: { value: "2" } });
  assert.deepEqual(artwork.feature_card_adjustment, { x: -10, y: 0, scale: 2 });
  controls = preview();
  (controls.find(element => element.type === "button")!.props.onClick as () => void)();
  assert.deepEqual({ ...artwork.feature_card_adjustment }, { x: 0, y: 0, scale: 1 });
  controls = preview(true);
  const disabledStage = controls.find(element => element.props.onPointerDown)!;
  (disabledStage.props.onPointerDown as (event: unknown) => void)(event);
  (disabledStage.props.onPointerMove as (event: unknown) => void)({ ...event, clientX: 100, clientY: 100 });
  assert.deepEqual({ ...artwork.feature_card_adjustment }, { x: 0, y: 0, scale: 1 });
  assert.equal(controls.find(element => element.type === "input")!.props.disabled, true);
  assert.equal(controls.find(element => element.type === "button")!.props.disabled, true);
  assert.deepEqual(artwork.thumbnail_adjustment, { x: 25, y: -30, scale: 1.5 });
});

test("review acceptance sends its approval action without manual value or effect assignments", async () => {
  const artwork = {
    _id: "submission", artist_id: "artist-id", artist: "Artist", title: "Pending work", date: 2026,
    genre: "Abstract", medium: "Oil", height: 100, width: 80, active: false,
    rarity: "legendary" as const, value_scale: 0.5, effect_id: "old-effect",
  };
  const hooks = {
    ...React,
    useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
  };
  const editor = await load<typeof import("../components/artwork-editor/artwork-editor-panel.tsx")>(
    "../components/artwork-editor/artwork-editor-panel.tsx", {
      react: hooks, "next/image": { default: () => null },
      "@/components/item-cards/artwork-image-adjustments": imageAdjustments,
      "@/server/artwork-image-url": imageUrls,
      "@/components/artwork-image-scope": { useArtworkImageScope: () => "admin" },
      "./artwork-customization-panel": { default: () => null },
      "./types": { ARTWORK_EDITOR_RARITIES: ["common", "uncommon", "rare", "legendary", "masterpiece"] },
    },
  );
  let sent: Record<string, unknown> | undefined;
  let refreshes = 0;
  const reviews = await load<typeof import("../app/admin/artwork-submissions/artwork-submission-reviews.tsx")>(
    "../app/admin/artwork-submissions/artwork-submission-reviews.tsx", {
      react: hooks, "@/components/artwork-editor/artwork-editor-panel": editor,
      "next/image": { default: () => null }, "@/server/artwork-image-url": imageUrls,
      "next/navigation": { useRouter: () => ({ refresh: () => { refreshes++; } }) },
    }, {
      fetch: async (url: string, options: RequestInit) => {
        assert.equal(url, "/api/admin/artworks/submission");
        assert.equal(options.method, "PATCH");
        sent = JSON.parse(String(options.body));
        return Response.json({ artwork: { ...artwork, active: true } });
      },
    },
  );
  const tree = reviews.default({ initialWorks: [artwork], artists: [], rendererOptions: [] });
  const children = React.Children.toArray(tree.props.children);
  const content = children[1] as React.ReactElement<{ children: React.ReactNode }>;
  const panel = React.Children.toArray(content.props.children).find(child => React.isValidElement(child) && child.type === editor.default) as
    React.ReactElement<Parameters<typeof editor.default>[0]>;
  assert.ok(panel);
  const form = editor.default(panel.props);
  await form.props.onSubmit({ preventDefault() {}, currentTarget: {} });
  assert.ok(sent);
  assert.equal(sent.action, "approve");
  assert.equal(sent.rarity, "legendary");
  assert.equal(sent.artist_id, "artist-id");
  for (const key of ["value_scale", "effect_id", "special_attributes"]) assert.equal(key in sent, false, key);
  assert.equal(refreshes, 1);
});

test("Your artwork uses collapsible editors and keeps pending proposals editable and visibly identified", async () => {
  for (const withImage of [false, true]) {
    const artwork = {
      _id: "existing", artist_id: "artist", artist: "Artist", title: "Current artwork", date: 2020,
      genre: "Abstract", medium: "Oil", height: 100, width: 80, active: true,
      rarity: "masterpiece" as const, value_scale: 0.75,
    };
    const states: unknown[] = [];
    let index = 0;
    const hooks = { ...React, useState: (initial: unknown) => {
      const position = index++;
      if (!(position in states)) states[position] = typeof initial === "function" ? initial() : initial;
      return [states[position], (next: unknown) => { states[position] = typeof next === "function" ? next(states[position]) : next; }];
    } };
    const editor = { default: () => null };
    let sent: FormData | undefined;
    const workspace = await load<typeof import("../app/artist/artist-workspace.tsx")>("../app/artist/artist-workspace.tsx", {
      react: hooks, "@/components/artwork-editor/artwork-editor-panel": editor, "@/server/artist-types": {},
    }, {
      FormData, fetch: async (url: string, init: RequestInit) => {
        assert.equal(url, "/api/artist/artworks/existing/changes");
        assert.equal(init.method, "POST");
        sent = init.body as FormData;
        return Response.json({ change: { id: "proposal" } }, { status: 201 });
      },
    });
    const props = {
      artist: { id: "artist", name: "Artist" } as PublicArtistProfile, rendererOptions: [],
      initialWorks: [{ id: artwork._id, title: artwork.title, status: "Active",
        artwork, pendingChange: false, proposedImage: false }],
    };
    type Element = React.ReactElement<Record<string, unknown>>;
    function elements(node: React.ReactNode): Element[] {
      if (Array.isArray(node)) return node.flatMap(elements);
      if (!React.isValidElement<Record<string, unknown>>(node)) return [];
      return [node, ...elements(node.props.children as React.ReactNode)];
    }
    const render = () => { index = 0; return workspace.default(props); };
    let tree = render();
    assert.equal(elements(tree).filter(element => element.type === "details").length, 1);
    assert.equal(elements(tree).filter(element => element.type === "summary").length, 1);
    assert.ok(!elements(tree).some(element => element.props.children === "Propose changes"));
    const panel = elements(tree).find(element => element.type === editor.default && element.props.mode === "edit") as
      React.ReactElement<Parameters<typeof import("../components/artwork-editor/artwork-editor-panel.tsx").default>[0]>;
    assert.ok(panel);
    assert.equal(panel.props.artistSubmission, true);
    assert.equal(panel.props.imagePreviewUrl, "/api/artist/artworks/existing/image");
    assert.equal(panel.props.submitLabel, "Submit changes for review");
    const metadata = { ...artwork, title: "Proposed title", height: 120, nsfw: true };
    const file = withImage ? new File(["replacement"], "replacement.png") : null;
    await panel.props.onSave(metadata, file);
    assert.ok(sent);
    assert.deepEqual(JSON.parse(String(sent.get("metadata"))), {
      title: "Proposed title", date: 2020, genre: "Abstract", medium: "Oil", height: 120, nsfw: true,
    });
    assert.equal(sent.has("image"), withImage);
    if (withImage) assert.equal((sent.get("image") as File).name, "replacement.png");
    tree = render();
    assert.ok(elements(tree).some(element => element.props.children === "Current artwork"));
    assert.ok(elements(tree).some(element => element.props.children === "Proposed changes awaiting review"));
    assert.ok(elements(tree).some(element => element.props.role === "status"));
    const pendingPanel = elements(tree).find(element => element.type === editor.default && element.props.mode === "edit") as typeof panel;
    assert.equal(pendingPanel.props.submitLabel, "Update proposed changes");
    assert.equal(pendingPanel.props.imagePreviewUrl, withImage
      ? "/api/artist/artworks/existing/changes/image" : "/api/artist/artworks/existing/image");
    await pendingPanel.props.onSave({ ...metadata, title: "Updated proposal" }, null);
    assert.equal(sent.get("image"), null);
    assert.equal(JSON.parse(String(sent.get("metadata"))).title, "Updated proposal");
  }
});

test("artist artwork edits preview replacement files without uploading them to the live admin image endpoint", async () => {
  const states: unknown[] = [];
  let index = 0;
  const requests: string[] = [];
  let savedFile: File | null = null;
  const editor = await load<typeof import("../components/artwork-editor/artwork-editor-panel.tsx")>(
    "../components/artwork-editor/artwork-editor-panel.tsx", {
      react: {
        ...React, useEffect: () => {}, useRef: () => ({ current: null }),
        useState: (initial: unknown) => {
          const position = index++;
          if (!(position in states)) states[position] = typeof initial === "function" ? initial() : initial;
          return [states[position], (next: unknown) => { states[position] = typeof next === "function" ? next(states[position]) : next; }];
        },
      },
      "next/image": { default: () => null }, "@/components/item-cards/artwork-image-adjustments": imageAdjustments,
      "@/server/artwork-image-url": imageUrls, "@/components/artwork-image-scope": { useArtworkImageScope: () => "public" },
      "./artwork-customization-panel": { default: () => null },
      "./types": { ARTWORK_EDITOR_RARITIES: ["masterpiece"] },
    }, {
      FormData, AbortController, fetch: async (url: string) => {
        requests.push(url);
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/png", "x-artwork-width": "1200", "x-artwork-height": "600" },
        });
      },
    });
  const props: Parameters<typeof editor.default>[0] = {
    mode: "edit", artistSubmission: true, imagePreviewUrl: "/api/artist/artworks/existing/image",
    artwork: { _id: "existing", artist_id: "artist", artist: "Artist", title: "Current", date: 2020,
      genre: "Abstract", medium: "Oil", height: 100, width: 80, active: true, rarity: "masterpiece", value_scale: 0.75 },
    artists: [], rendererOptions: [], onSave: async (_metadata, file) => { savedFile = file; return undefined; },
  };
  type Element = React.ReactElement<Record<string, unknown>>;
  function elements(node: React.ReactNode): Element[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement<Record<string, unknown>>(node)) return [];
    return [node, ...elements(node.props.children as React.ReactNode)];
  }
  const render = () => { index = 0; return editor.default(props); };
  let form = render();
  const markup = renderToStaticMarkup(form);
  assert.doesNotMatch(markup, /Value scale|Unique effect|Special attribute|Active in game|aria-label="Artist"|aria-label="Rarity"/);
  const input = elements(form).find(element => element.props.name === "image")!;
  const file = new File(["replacement"], "replacement.png", { type: "image/png" });
  (input.props.onChange as (event: unknown) => void)({ currentTarget: { files: [file], value: "replacement.png" } });
  await new Promise(resolve => setImmediate(resolve));
  form = render();
  assert.deepEqual(requests, ["/api/artist/artworks/preview"]);
  await form.props.onSubmit({ preventDefault() {}, currentTarget: {} });
  assert.equal(savedFile, file);
  for (const value of states) {
    if (value && typeof value === "object" && "url" in value && String(value.url).startsWith("blob:")) {
      URL.revokeObjectURL(String(value.url));
    }
  }
});

test("the artist portal reopens pending proposal metadata and replacement images in its artwork dropdown", async () => {
  const current = {
    _id: "existing", artist_id: "artist", artist: "Artist", title: "Current artwork", date: 2020,
    genre: "Abstract", medium: "Oil", height: 100, width: 80, active: true,
    rarity: "masterpiece" as const, value_scale: 0.75,
  };
  const change = {
    artwork_id: current._id, artist_id: current.artist_id,
    metadata: { title: "Pending title", date: 2026, genre: "Portrait", medium: "Acrylic", height: 150, nsfw: true },
    image: { variants: { full: { width: 1200, height: 600 } } },
  };
  const workspace = { default: () => React.createElement("div") };
  const page = await load<typeof import("../app/artist/page.tsx")>("../app/artist/page.tsx", {
    "next/navigation": { redirect: () => assert.fail("Artist should be available") },
    "@/components/item-cards/catalog": { getConfiguredCardCosmetics: () => [] },
    "@/components/item-cards/types": { SHOWCASE_CARD_RENDERER_IDS: [] },
    "@/server/card-renderer-settings": { getCardRendererSettings: async () => ({ rendererNames: {} }) },
    "@/server/contributing-artists": { getPublicArtistProfile: async () => ({
      id: "artist", playerId: "player", name: "Artist", bio: "", portfolioUrl: "",
      featureLink: "", socialLinks: {}, instagramUsername: null, featured: false,
    }) },
    "@/server/mongodb": { getDatabase: async () => ({
      collection: (name: string) => ({ find: () => {
        const values = name === "artworks" ? [current] : name === "artwork_change_requests" ? [change] : [];
        return { toArray: async () => values, sort: () => ({ toArray: async () => values }) };
      } }),
    }) },
    "@/server/session": { requirePlayer: async () => ({ playerId: "player" }) },
    "./artist-workspace": workspace,
  });
  const tree = await page.default();
  const renderedWorkspace = React.Children.toArray(tree.props.children).find(child =>
    React.isValidElement(child) && child.type === workspace.default) as React.ReactElement<{
      initialWorks: Array<Record<string, unknown>>;
    }>;
  const work = renderedWorkspace.props.initialWorks[0];
  assert.equal(work.title, current.title);
  assert.equal(work.pendingChange, true);
  assert.equal(work.proposedImage, true);
  assert.deepEqual(JSON.parse(JSON.stringify(work.artwork)), {
    ...current, ...change.metadata, image: change.image, image_width: 1200, image_height: 600, width: 300,
  });
});

test("artwork submissions load proposed changes alongside the current artwork and use change-only review actions", async () => {
  const current = {
    _id: "existing", artist_id: "artist", artist: "Artist", title: "Current artwork", date: 2020,
    genre: "Abstract", medium: "Oil", height: 100, width: 80, active: true, rarity: "masterpiece", value_scale: 0.75,
  };
  const proposal = { _id: "change", artwork_id: current._id, metadata: { title: "Proposed artwork", height: 120, nsfw: true },
    original: current, image: { variants: { full: { width: 1200, height: 600 } } } };
  const requests: { url: string; method: string }[] = [];
  const editor = { default: () => null };
  const hooks = { ...React, useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, () => {}] };
  const reviews = await load<typeof import("../app/admin/artwork-submissions/artwork-submission-reviews.tsx")>(
    "../app/admin/artwork-submissions/artwork-submission-reviews.tsx", {
      react: hooks, "@/components/artwork-editor/artwork-editor-panel": editor,
      "next/image": { default: () => null }, "@/server/artwork-image-url": imageUrls,
    }, { fetch: async (url: string, init: RequestInit) => {
      requests.push({ url, method: String(init.method) });
      return Response.json({ artwork: current });
    } });
  const page = await load<typeof import("../app/admin/artwork-submissions/page.tsx")>("../app/admin/artwork-submissions/page.tsx", {
    "@/components/item-cards/catalog": { getConfiguredCardCosmetics: () => [] },
    "@/components/item-cards/types": { SHOWCASE_CARD_RENDERER_IDS: [] },
    "@/server/card-renderer-settings": { getCardRendererSettings: async () => ({ rendererNames: {} }) },
    "@/server/mongodb": { getDatabase: async () => ({
      collection: (name: string) => ({ find: (query: Record<string, unknown>) => {
        const values = name === "artwork_change_requests" ? [proposal] : name === "artworks" && query._id ? [current] : [];
        return { toArray: async () => values, sort: () => ({ toArray: async () => values }) };
      } }),
    }) }, "./artwork-submission-reviews": reviews,
  });
  const tree = await page.default();
  const review = React.Children.toArray(tree.props.children).find(child => React.isValidElement(child) && child.type === reviews.default) as
    React.ReactElement<Parameters<typeof reviews.default>[0]>;
  assert.ok(review);
  assert.equal(review.props.initialChanges?.[0].artwork.width, 240);
  assert.equal(review.props.initialChanges?.[0].current?.title, current.title);
  const rendered = reviews.default(review.props);
  const markup = renderToStaticMarkup(rendered);
  assert.match(markup, /Current artwork|Proposed changes/);
  const content = React.Children.toArray(rendered.props.children)[1] as React.ReactElement<{ children: React.ReactNode }>;
  const panel = React.Children.toArray(content.props.children).find(child => React.isValidElement(child) && child.type === editor.default) as
    React.ReactElement<Parameters<typeof import("../components/artwork-editor/artwork-editor-panel.tsx").default>[0]>;
  assert.equal(panel.props.artwork?.title, "Proposed artwork");
  assert.equal(panel.props.imagePreviewUrl, "/api/admin/artwork-changes/change/image");
  assert.equal(panel.props.allowImageUpload, false);
  assert.equal(panel.props.showRarity, false);
  assert.equal(panel.props.deleteLabel, "Deny changes");
  await panel.props.onSave({ ...current, nsfw: true } as Parameters<NonNullable<typeof panel.props.onSave>>[0], null);
  panel.props.onDelete!();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(requests, [
    { url: "/api/admin/artwork-changes/change", method: "PATCH" },
    { url: "/api/admin/artwork-changes/change", method: "DELETE" },
  ]);
});

test("accepting edits to an unapproved upload refreshes its remaining initial review rather than restoring old metadata", async () => {
  const original = {
    _id: "pending", artist_id: "artist", artist: "Artist", title: "Original upload", date: 2020,
    genre: "Abstract", medium: "Oil", height: 100, width: 80, active: false,
    rarity: "common" as const, value_scale: 0.25, submission_status: "pending" as const,
  };
  const proposed = { ...original, title: "Revised upload", height: 120, width: 96 };
  const states: unknown[] = [];
  let index = 0;
  const editor = { default: () => null };
  const reviews = await load<typeof import("../app/admin/artwork-submissions/artwork-submission-reviews.tsx")>(
    "../app/admin/artwork-submissions/artwork-submission-reviews.tsx", {
      react: { ...React, useState: (initial: unknown) => {
        const position = index++;
        if (!(position in states)) states[position] = typeof initial === "function" ? initial() : initial;
        return [states[position], (next: unknown) => { states[position] = typeof next === "function" ? next(states[position]) : next; }];
      } },
      "@/components/artwork-editor/artwork-editor-panel": editor, "next/image": { default: () => null },
      "@/server/artwork-image-url": imageUrls,
    }, { fetch: async () => Response.json({ artwork: proposed }) });
  const props: Parameters<typeof reviews.default>[0] = {
    initialWorks: [original], initialChanges: [{
      changeId: "change", artwork: proposed, current: original, hasNewImage: false, revision: 1,
    }],
    artists: [], rendererOptions: [],
  };
  type Element = React.ReactElement<Record<string, unknown>>;
  function elements(node: React.ReactNode): Element[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement<Record<string, unknown>>(node)) return [];
    return [node, ...elements(node.props.children as React.ReactNode)];
  }
  const render = () => { index = 0; return reviews.default(props); };
  let tree = render();
  const buttons = elements(tree).filter(element => element.type === "button");
  (buttons[1].props.onClick as () => void)();
  tree = render();
  const panel = elements(tree).find(element => element.type === editor.default) as
    React.ReactElement<Parameters<typeof import("../components/artwork-editor/artwork-editor-panel.tsx").default>[0]>;
  await panel.props.onSave({ ...proposed, nsfw: false }, null);
  tree = render();
  const refreshed = elements(tree).find(element => element.type === editor.default) as typeof panel;
  assert.equal(refreshed.props.artwork?.title, proposed.title);
  assert.equal(refreshed.props.artwork?.height, proposed.height);
  assert.equal(refreshed.props.artwork?.active, false);
  assert.equal(refreshed.props.submitLabel, "Accept artwork");
});

test("the admin layout scopes inactive editor, thumbnail, detail, and item-card images without changing game views", async () => {
  const scope = await load<typeof import("../components/artwork-image-scope.tsx")>("../components/artwork-image-scope.tsx");
  const image = { default: ({ src, alt, unoptimized }: { src: string; alt: string; unoptimized: boolean }) =>
    React.createElement("img", { src, alt, "data-unoptimized": unoptimized }) };
  const thumbnail = await load<typeof import("../components/artwork-thumbnail.tsx")>("../components/artwork-thumbnail.tsx", {
    "next/image": image, "@/server/artwork-image-url": imageUrls, "./artwork-image-scope": scope,
    "./item-cards/artwork-image-adjustments": imageAdjustments,
  });
  const detail = await load<typeof import("../components/artwork-detail-image.tsx")>("../components/artwork-detail-image.tsx", {
    "@/components/item-cards/artwork-image-adjustments": imageAdjustments,
    "@/server/artwork-image-url": imageUrls, "./artwork-image-scope": scope,
  });
  const shared = await load<typeof import("../components/item-cards/shared.tsx")>("../components/item-cards/shared.tsx", {
    "../item-expiration-display": {}, "@/server/artwork-image-url": imageUrls,
    "../artwork-image-scope": scope, "@/server/item-drop-chance-format": {}, "@/server/item-serial-format": {},
    "@/server/archive-gameplay": {}, "@/components/floating-popover": {}, "./card-cosmetics-provider": {},
    "./catalog": {}, "./artwork-image-adjustments": imageAdjustments,
  });
  const editor = await load<typeof import("../components/artwork-editor/artwork-editor-panel.tsx")>(
    "../components/artwork-editor/artwork-editor-panel.tsx", {
      "next/image": image, "@/components/item-cards/artwork-image-adjustments": imageAdjustments,
      "@/server/artwork-image-url": imageUrls, "@/components/artwork-image-scope": scope,
      "./artwork-customization-panel": { default: () => null },
      "./types": { ARTWORK_EDITOR_RARITIES: ["common", "uncommon", "rare", "legendary", "masterpiece"] },
    },
  );
  const layout = await load<typeof import("../app/admin/layout.tsx")>("../app/admin/layout.tsx", {
    "./admin-header": { default: () => null }, "@/server/session": { requireAdmin: async () => ({ email: "admin@example.com" }) },
    "@/components/artwork-image-scope": scope,
    "@/server/admin-review-counts": { getAdminReviewCounts: async () => ({
      artistApplications: 0, artworkSubmissions: 0, chatReports: 0,
    }) },
    "@/server/mongodb": { getDatabase: async () => ({}) },
  });
  const work: Artwork = {
    _id: "inactive-work", artist_id: "artist-id", artist: "Artist", title: "Inactive work", date: 2026,
    rarity: "common", genre: "Abstract", medium: "Oil", value_scale: 0.5, width: 80, height: 100, active: false,
  };
  const examples = [
    { variant: "thumb" as const, component: React.createElement(thumbnail.default, { artworkId: work._id, alt: work.title }) },
    { variant: "full" as const, component: React.createElement(detail.default, { artworkId: work._id, alt: work.title, adjustment: { x: 0, y: 0, scale: 1 } }) },
    { variant: "card" as const, component: React.createElement(shared.ArtworkImage, { item: createArtistArtworkPreview(work), className: "" }) },
    { variant: "card" as const, component: React.createElement(editor.default, {
      mode: "edit", artwork: work, artists: [], rendererOptions: [], onSave: async () => undefined,
    }) },
  ];
  for (const { variant, component } of examples) {
    const publicHtml = renderToStaticMarkup(component).replaceAll("&amp;", "&");
    assert.ok(publicHtml.includes(imageUrls.getArtworkImageUrl(work._id, variant)));
    assert.doesNotMatch(publicHtml, /admin=1/);
    const adminHtml = renderToStaticMarkup(await layout.default({ children: component })).replaceAll("&amp;", "&");
    assert.ok(adminHtml.includes(imageUrls.getArtworkImageUrl(work._id, variant, undefined, false, "admin")));
    if (variant === "thumb" || component.type === editor.default) assert.match(adminHtml, /data-unoptimized="true"/);
  }
});

test("fixed feature crops use intrinsic image sizing after load while ordinary thumbnails retain fill sizing", async () => {
  for (const aspect of [null, 0.5, 1, 2]) {
    const thumbnail = await load<typeof import("../components/artwork-thumbnail.tsx")>("../components/artwork-thumbnail.tsx", {
      react: { ...React, useState: () => [aspect, () => {}] },
      "next/image": require("next/image"),
      "@/server/artwork-image-url": imageUrls,
      "./artwork-image-scope": { useArtworkImageScope: () => "public" },
      "./item-cards/artwork-image-adjustments": imageAdjustments,
    });
    for (const fixedFocalPoint of [false, true]) {
      const html = renderToStaticMarkup(React.createElement(thumbnail.default, {
        artworkId: "test", alt: "", adjustment: { x: 35, y: -60, scale: 1.5 }, fixedFocalPoint,
      }));
      if (fixedFocalPoint && aspect) {
        assert.match(html, /data-nimg="1"/);
        assert.match(html, /width:max\([^"]+cqw[^"]+cqh\)/);
        assert.match(html, /height:auto/);
      } else {
        assert.match(html, /data-nimg="fill"/);
        assert.doesNotMatch(html, /cqw|cqh/);
      }
    }
  }
});

test("item details link both artist credits to the artist gallery for signed-in and anonymous visitors without a discovery button", async () => {
  const shared = await load<typeof import("../components/item-cards/shared.tsx")>("../components/item-cards/shared.tsx", {
    "../item-expiration-display": {}, "@/server/artwork-image-url": imageUrls,
    "../artwork-image-scope": {}, "@/server/item-drop-chance-format": { formatItemDropChance },
    "@/server/item-serial-format": { formatItemSerialNumber }, "@/server/archive-gameplay": {},
    "@/components/floating-popover": {}, "./card-cosmetics-provider": {}, "./catalog": {},
    "./artwork-image-adjustments": imageAdjustments,
  });
  const work: Artwork = {
    _id: "artist-work", artist_id: "artist / id", artist: "Contributing Artist", title: "Artist work", date: 2026,
    rarity: "rare", genre: "Abstract", medium: "Oil", value_scale: 0.5, width: 80, height: 100, active: true,
  };
  type GalleryResponse = { ok: boolean; json: () => Promise<{ playerId: string | null }> };
  const response = (playerId: string | null): GalleryResponse => ({ ok: true, json: async () => ({ playerId }) });
  const noop = () => null;
  for (const viewerId of [null, "visitor"]) {
    for (const outcome of ["linked", "unlinked", "failed"] as const) {
      const states: unknown[] = [];
      let stateIndex = 0;
      let effect: React.EffectCallback | undefined;
      let item = { ...createArtistArtworkPreview(work), owner: "unrelated-owner" };
      let fetchGallery = async (): Promise<GalleryResponse> => {
        if (outcome === "failed") throw new Error("Gallery lookup unavailable");
        return response(outcome === "linked" ? "artist/player" : null);
      };
      const details = await load<typeof import("../components/item-cards/standard-item-dialog.tsx")>(
        "../components/item-cards/standard-item-dialog.tsx", {
          react: {
            ...React,
            useState: (initial: unknown) => {
              const index = stateIndex++;
              if (!(index in states)) states[index] = initial;
              return [states[index], (value: unknown) => { states[index] = value; }];
            },
            useEffect: (callback: React.EffectCallback) => { effect = callback; },
          },
          "@/components/artwork-thumbnail": { default: noop }, "@/components/artwork-detail-image": { default: noop },
          "@/components/community-emotes": { CommunityReactionLoader: noop },
          "@/components/item-expiration-display": { ItemExpirationBadge: noop },
          "./auction-bid-panel": { AuctionBidPanelLoader: noop },
          "./art-style-action-button": {}, "./item-action-layout": {},
          "./auction-watermark": { default: noop }, "./known-forgery-watermark": { default: noop },
          "./render-card-preview": { default: noop }, "./registry": { CARD_RENDERERS: { museum: noop } },
          "./artwork-image-adjustments": imageAdjustments,
          "./shared": { ...shared, AttributeIcons: noop, ItemVariantBadges: noop },
          "@/server/raffle-core": { RAFFLE_OWNER_ID: "raffle" },
        }, { fetch: async (url: string, options: RequestInit) => {
          assert.equal(url, `/api/artists/${encodeURIComponent(item.artwork.artist_id)}/gallery`);
          assert.equal(options.cache, "no-store");
          return fetchGallery();
        } },
      );
      const render = () => {
        stateIndex = 0;
        return renderToStaticMarkup(React.createElement(details.StandardItemDetails, {
          item, legendaryAttributes: [], currentRendererId: "museum", viewerId,
          permissions: { canManageItem: false, canCustomizeCosmetic: false },
        }));
      };
      const galleryLinks = (html: string) => [...html.matchAll(/<a\b[^>]*href="(\/gallery\/[^"]+)"[^>]*>(.*?)<\/a>/g)];
      assert.equal(galleryLinks(render()).length, 0);
      assert.ok(effect);
      const cleanup = effect();
      await new Promise<void>(resolve => setImmediate(resolve));
      const html = render();
      const links = galleryLinks(html);
      assert.equal(links.length, outcome === "linked" ? 2 : 0, `${viewerId}: ${outcome}`);
      assert.doesNotMatch(html, /See more from this artist|standard-item-artist-gallery-link/);
      if (outcome === "linked") {
        assert.ok(links.every(link => link[1] === "/gallery/artist%2Fplayer"));
        assert.equal(links.filter(link => link[2] === work.artist).length, 2);
      } else {
        assert.match(html, /<p>Contributing Artist<\/p>/);
      }
      if (typeof cleanup === "function") cleanup();

      if (outcome === "linked") {
        let resolvePrevious!: (value: GalleryResponse) => void;
        const previous = new Promise<GalleryResponse>(resolve => { resolvePrevious = resolve; });
        item = createArtistArtworkPreview({ ...work, artist_id: "previous-artist" });
        fetchGallery = () => previous;
        assert.equal(galleryLinks(render()).length, 0, "Changing artists must immediately hide the old gallery link");
        const cancelPrevious = effect!();
        if (typeof cancelPrevious === "function") cancelPrevious();
        item = createArtistArtworkPreview({ ...work, artist_id: "current-artist" });
        fetchGallery = async () => response("current-player");
        render();
        const cancelCurrent = effect!();
        await new Promise<void>(resolve => setImmediate(resolve));
        resolvePrevious(response("previous-player"));
        await new Promise<void>(resolve => setImmediate(resolve));
        const currentLinks = galleryLinks(render());
        assert.equal(currentLinks.length, 2);
        assert.ok(currentLinks.every(link => link[1] === "/gallery/current-player"), "Late artist lookups must not replace the current artist's links");
        if (typeof cancelCurrent === "function") cancelCurrent();
      }
    }
  }
});

test("shared dialogs load bidding controls for signed-in viewers of auctioned items", async () => {
  let loaderProps: { itemId: string; playerId: string } | null = null;
  const noop = () => null;
  const details = await load<typeof import("../components/item-cards/standard-item-dialog.tsx")>(
    "../components/item-cards/standard-item-dialog.tsx",
    {
      react: React,
      "@/components/artwork-thumbnail": { default: noop },
      "@/components/artwork-detail-image": { default: noop },
      "@/components/community-emotes": { CommunityReactionLoader: noop },
      "@/components/item-expiration-display": { ItemExpirationBadge: noop },
      "./auction-bid-panel": {
        AuctionBidPanelLoader: (props: {
          itemId: string;
          playerId: string;
        }) => {
          loaderProps = props;
          return React.createElement("span", { "data-auction-bid-panel": true });
        },
      },
      "./art-style-action-button": { default: noop },
      "./item-action-layout": { default: noop },
      "./auction-watermark": { default: noop },
      "./known-forgery-watermark": { default: noop },
      "./render-card-preview": { default: noop },
      "./registry": { CARD_RENDERERS: { museum: noop } },
      "./artwork-image-adjustments": imageAdjustments,
      "./shared": {
        AttributeIcons: noop,
        CompleteItemRecord: noop,
        ItemVariantBadges: noop,
      },
      "@/server/raffle-core": { RAFFLE_OWNER_ID: "raffle" },
    },
  );
  const item = {
    ...createArtistArtworkPreview({
      _id: "auction-dialog-work",
      artist_id: "artist",
      artist: "Artist",
      title: "Auction dialog work",
      date: 2026,
      rarity: "common",
      genre: "Abstract",
      medium: "Oil",
      value_scale: 0.5,
      width: 80,
      height: 100,
      active: true,
    }),
    status: "auctioned" as const,
  };
  const html = renderToStaticMarkup(
    React.createElement(details.default, {
      currentRendererId: "museum",
      item,
      legendaryAttributes: [],
      onClose() {},
      permissions: {
        canManageItem: false,
        canCustomizeCosmetic: false,
      },
      viewerId: "viewer",
    }),
  );
  assert.match(html, /data-auction-bid-panel="true"/);
  assert.equal(loaderProps?.itemId, item._id);
  assert.equal(loaderProps?.playerId, "viewer");
});

test("auctioned item previews replace action buttons and help with active auction information", async () => {
  let loaderProps: { itemId: string; playerId: string } | null = null;
  const noop = () => null;
  const itemCard = await load<typeof import("../components/item-cards/item-card.tsx")>(
    "../components/item-cards/item-card.tsx",
    {
      react: React,
      "next/navigation": { useRouter: () => ({ refresh() {} }) },
      "./auction-bid-panel": {
        AuctionBidPanelLoader: (props: {
          itemId: string;
          playerId: string;
        }) => {
          loaderProps = props;
          return React.createElement("span", { "data-active-auction": true });
        },
      },
      "./auction-watermark": { default: noop },
      "./art-style-dialog": { default: noop },
      "./art-style-action-button": { default: noop },
      "./item-action-layout": {
        default: () =>
          React.createElement("span", {
            "data-item-actions": true,
            "data-item-action-help": true,
          }),
      },
      "./known-forgery-watermark": { default: noop },
      "./render-card-preview": {
        default: ({ children }: { children: React.ReactNode }) => children,
      },
      "./registry": { CARD_RENDERERS: { museum: noop } },
      "./selection": { resolveCardRendererId: () => "museum" },
      "./standard-item-dialog": { default: noop },
      "../item-expiration-display": { ItemExpirationBadge: noop },
      "../item-thumbnail": { ItemStatusIcons: noop },
    },
  );
  const item = {
    ...createArtistArtworkPreview({
      _id: "auction-preview-work",
      artist_id: "artist",
      artist: "Artist",
      title: "Auction preview work",
      date: 2026,
      rarity: "common",
      genre: "Abstract",
      medium: "Oil",
      value_scale: 0.5,
      width: 80,
      height: 100,
      active: true,
    }),
    status: "auctioned" as const,
  };
  const html = renderToStaticMarkup(
    React.createElement(itemCard.default, {
      actions: React.createElement("button", null, "Tag"),
      auctionPanelActions: React.createElement(
        "button",
        null,
        "Dismiss limited-access auction",
      ),
      item,
      legendaryAttributes: [],
      permissions: {
        canManageItem: true,
        canCustomizeCosmetic: false,
      },
      showActionHelp: true,
      viewerId: "owner",
    }),
  );
  assert.match(html, /data-active-auction="true"/);
  assert.match(html, /Dismiss limited-access auction/);
  assert.doesNotMatch(html, /data-item-actions|data-item-action-help/);
  assert.equal(loaderProps?.itemId, item._id);
  assert.equal(loaderProps?.playerId, "owner");
});

test("public item pages show the current owner name and public gallery link in the shared item details", async () => {
  const shared = await load<typeof import("../components/item-cards/shared.tsx")>("../components/item-cards/shared.tsx", {
    "../item-expiration-display": {}, "@/server/artwork-image-url": imageUrls,
    "../artwork-image-scope": {}, "@/server/item-drop-chance-format": { formatItemDropChance },
    "@/server/item-serial-format": { formatItemSerialNumber }, "@/server/archive-gameplay": {},
    "@/components/floating-popover": {}, "./card-cosmetics-provider": {}, "./catalog": {},
    "./artwork-image-adjustments": imageAdjustments,
  });
  const anonymous = await load<typeof import("../app/items/[id]/anonymous-item-view.tsx")>(
    "../app/items/[id]/anonymous-item-view.tsx", {
      "../../play/player-header": { default: () => null },
      "@/components/item-cards/item-card": { default: (props: React.ComponentProps<typeof import("../components/item-cards/item-card.tsx").default>) => {
        assert.equal(props.viewerId, null);
        assert.equal(props.permissions?.canManageItem, false);
        assert.equal(props.permissions?.canCustomizeCosmetic, false);
        return React.createElement(shared.CompleteItemRecord, {
          ...props, showAttributeDetails: false, showProperties: false,
        });
      } },
    });
  const artwork: Artwork = {
    _id: "public-work", artist_id: "artist", artist: "Artist", title: "Shared Artwork", date: 2026,
    rarity: "common", genre: "Abstract", medium: "Oil", value_scale: 0.5, width: 80, height: 100, active: true,
  };
  let owner: { playerId: string; screenName: string } | null = null;
  const page = await load<typeof import("../app/items/[id]/page.tsx")>("../app/items/[id]/page.tsx", {
    "next/navigation": { redirect: () => assert.fail("Anonymous viewers must not be redirected"), notFound: () => assert.fail("The item exists") },
    "@/server/artwork-effects": {}, "@/server/mongodb": { getDatabase: async () => ({}) },
    "@/server/session": { getPlayerSession: async () => null },
    "@/server/public-showcase": { getPublicItemView: async () => ({
      item: { ...createArtistArtworkPreview(artwork), owner: "unknown", status: "claimed" }, owner, displayOwner: null,
    }) },
    "./anonymous-item-view": anonymous,
  });
  for (const currentOwner of [
    { playerId: "collector / id", screenName: "Actual Collector" },
    { playerId: "new-owner", screenName: "New Collector" },
    null,
  ]) {
    owner = currentOwner;
    const html = renderToStaticMarkup(await page.default({ params: Promise.resolve({ id: "shared-item" }) }));
    if (owner) {
      assert.ok(html.includes(`href="/gallery/${encodeURIComponent(owner.playerId)}"`));
      assert.ok(html.includes(`@${owner.screenName}</a>`));
      assert.match(html, /class="item-owner-link"/);
      assert.doesNotMatch(html, /artfunkel inc\.|unknown/);
    } else {
      assert.match(html, /class="item-owner-default">artfunkel inc\./);
      assert.doesNotMatch(html, /item-owner-link|Actual Collector|New Collector/);
    }
  }
});

test("admin catalog sorts recently added artwork using persisted creation dates without changing selection or filters", async () => {
  const base = {
    artist_id: "artist", title: "Artwork", date: 1900, genre: "Abstract", medium: "Oil",
    rarity: "common" as const, value_scale: 0.5, width: 80, height: 100, active: true,
    image: { storage: { provider: "mock-s3" as const, key: "artwork.png" } },
  };
  const records = [
    { ...base, _id: "older", artist: "A", title: "Older", date: 3000, created_at: new Date("2026-10-01T12:00:00Z") },
    { ...base, _id: "tied", artist: "B", title: "Tied", created_at: new Date("2026-11-06T12:00:00Z") },
    { ...base, _id: "legacy", artist: "C", title: "Legacy", image: undefined },
    { ...base, _id: "invalid", artist: "D", title: "Invalid", created_at: "invalid-date" },
    { ...base, _id: "newest", artist: "Z", title: "Newest", image: undefined, created_at: new Date("2026-11-06T12:00:00Z") },
  ];
  type Props = Parameters<typeof import("../app/admin/catalog/catalog-editor.tsx").default>[0];
  let props: Props | undefined;
  const page = await load<typeof import("../app/admin/catalog/page.tsx")>("../app/admin/catalog/page.tsx", {
    "@/server/mongodb": { getDatabase: async () => ({
      collection: (name: string) => ({
        find: (_filter?: unknown, options?: { projection?: Record<string, number> }) => ({
          sort: () => ({
            toArray: async () => name === "artworks" ? records.map(record => Object.fromEntries(
              Object.entries(record).filter(([key]) => options?.projection?.[key] === 1),
            )) : [],
          }),
        }),
      }),
    }) },
    "@/server/artwork-effects": { getArtworkEffects: async () => [] },
    "@/components/item-cards/catalog": { getConfiguredCardCosmetics: () => [] },
    "@/components/item-cards/types": { SHOWCASE_CARD_RENDERER_IDS: [] },
    "@/server/card-renderer-settings": { getCardRendererSettings: async () => ({ rendererNames: {} }) },
    "./catalog-editor": { default: (input: Props) => { props = input; return null; } },
  });
  renderToStaticMarkup(await page.default());
  assert.ok(props);
  assert.equal(props.initialArtworks[0].created_at, "2026-10-01T12:00:00.000Z");
  const states: unknown[] = [];
  let stateIndex = 0;
  let editedId: string | undefined;
  const catalog = await load<typeof import("../app/admin/catalog/catalog-editor.tsx")>("../app/admin/catalog/catalog-editor.tsx", {
    react: {
      ...React, useMemo: (calculate: () => unknown) => calculate(), useRef: () => ({ current: false }),
      useState: (initial: unknown) => {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
      },
    },
    "@/components/artwork-editor/artwork-editor-panel": {
      default: ({ artwork }: { artwork: { _id: string } }) => { editedId = artwork._id; return null; },
      ArtworkEditorField: () => null,
    },
  });
  type Element = React.ReactElement<{ children?: React.ReactNode } & Record<string, unknown>>;
  function find(node: React.ReactNode, predicate: (element: Element) => boolean): Element | undefined {
    for (const child of React.Children.toArray(node)) {
      if (!React.isValidElement(child)) continue;
      const element = child as Element;
      if (predicate(element)) return element;
      const match = find(element.props.children, predicate);
      if (match) return match;
    }
  }
  let tree: React.ReactNode;
  const render = () => {
    stateIndex = 0;
    tree = catalog.default(props!);
    renderToStaticMarkup(tree);
    const aside = find(tree, element => element.type === "aside");
    assert.ok(aside);
    return React.Children.toArray(aside.props.children).filter(child =>
      React.isValidElement(child) && child.type === "button") as Element[];
  };
  const titles = () => render().map(button => (React.Children.toArray(button.props.children)[0] as Element).props.children);
  const sort = (value: string) => {
    const select = find(tree, element => element.type === "select" && element.props.value !== undefined);
    assert.ok(select);
    (select.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
    return titles();
  };
  const initialOrder = ["Older", "Tied", "Legacy", "Invalid", "Newest"];
  assert.deepEqual(titles(), initialOrder);
  assert.equal(editedId, "older");
  assert.deepEqual(sort("recent"), ["Tied", "Newest", "Older", "Legacy", "Invalid"]);
  const newest = render().find(button =>
    (React.Children.toArray(button.props.children)[0] as Element).props.children === "Newest");
  assert.ok(newest);
  (newest.props.onClick as () => void)();
  render();
  assert.equal(editedId, "newest");
  assert.deepEqual(sort("default"), initialOrder);
  assert.equal(editedId, "newest");
  sort("recent");
  const search = find(tree, element => element.type === "input" && element.props.placeholder === "Title, artist, or rarity");
  assert.ok(search);
  (search.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "newest" } });
  assert.deepEqual(titles(), ["Newest"]);
  const missing = find(tree, element => element.type === "button" &&
    React.Children.toArray(element.props.children).some(child => typeof child === "string" && child.startsWith("Missing images")));
  assert.ok(missing);
  (missing.props.onClick as () => void)();
  assert.deepEqual(titles(), ["Newest", "Legacy"]);
});

test("player-account admin searches live, ignores stale responses, and creates and links catalog artists", async () => {
  const states: unknown[] = [];
  const refs: { current: unknown }[] = [];
  let stateIndex = 0;
  let refIndex = 0;
  let effects: React.EffectCallback[] = [];
  const cleanups: ReturnType<React.EffectCallback>[] = [];
  const timers: { callback: () => Promise<void>; delay: number; cancelled: boolean; used: boolean }[] = [];
  const requests: { url: string; options: RequestInit; complete: (body: unknown, ok?: boolean) => void }[] = [];
  class TestFormData {
    values: Record<string, string>;
    constructor(values: Record<string, string>) { this.values = values; }
    get(name: string) { return this.values[name] ?? null; }
  }
  const panel = await load<typeof import("../app/admin/player-accounts/player-account-admin.tsx")>("../app/admin/player-accounts/player-account-admin.tsx", {
    react: {
      ...React,
      useState: (initial: unknown) => {
        const index = stateIndex++;
        if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
        return [states[index], (value: unknown) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
      },
      useRef: (current: unknown) => {
        const index = refIndex++;
        if (!(index in refs)) refs[index] = { current };
        return refs[index];
      },
      useEffect: (effect: React.EffectCallback) => { effects.push(effect); },
    },
  }, {
    AbortController, FormData: TestFormData,
    window: {
      setTimeout: (callback: () => Promise<void>, delay: number) => {
        timers.push({ callback, delay, cancelled: false, used: false });
        return timers.length - 1;
      },
      clearTimeout: (id: number) => { timers[id].cancelled = true; },
    },
    fetch: (url: string, options: RequestInit = {}) => new Promise(resolve => {
      requests.push({ url, options, complete: (body, ok = true) => resolve({ ok, json: async () => body }) });
    }),
  });
  const props = { initialArtists: [
    { id: "catalog", name: "Existing artist", playerId: null },
    { id: "taken", name: "Another artist", playerId: "another-player" },
  ] };
  type Element = React.ReactElement<{ children?: React.ReactNode } & Record<string, unknown>>;
  function find(node: React.ReactNode, predicate: (element: Element) => boolean): Element | undefined {
    for (const child of React.Children.toArray(node)) {
      if (!React.isValidElement(child)) continue;
      const element = child as Element;
      if (predicate(element)) return element;
      const match = find(element.props.children, predicate);
      if (match) return match;
    }
  }
  function text(node: React.ReactNode): string {
    return React.Children.toArray(node).map(child =>
      React.isValidElement(child) ? text((child as Element).props.children) : String(child)).join("");
  }
  let tree: React.ReactNode;
  const render = () => {
    stateIndex = 0; refIndex = 0; effects = [];
    tree = panel.default(props);
    return renderToStaticMarkup(tree);
  };
  const startEffect = (index: number, delay: number) => {
    if (typeof cleanups[index] === "function") cleanups[index]();
    cleanups[index] = effects[index]();
    const timer = timers.find(timer => !timer.cancelled && !timer.used);
    assert.ok(timer);
    assert.equal(timer.delay, delay);
    timer.used = true;
    return timer.callback();
  };
  const input = (id: string, value: string) => {
    const element = find(tree, element => element.props.id === id);
    assert.ok(element);
    (element.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
    return render();
  };
  const button = (label: string) => {
    const element = find(tree, element => element.type === "button" && text(element.props.children).includes(label));
    assert.ok(element, label);
    return element;
  };
  const complete = async (body: unknown, ok = true) => {
    requests.at(-1)!.complete(body, ok);
    await new Promise<void>(resolve => setImmediate(resolve));
    return render();
  };
  assert.match(render(), /Search by player name or email/);
  const searchInput = find(tree, element => element.props.id === "player-account-search");
  assert.equal(searchInput?.props.type, "search");
  assert.match(String(searchInput?.props.className), /border.*bg-black/);
  assert.equal(requests.length, 0);
  input("player-account-search", "alice");
  const oldSearch = startEffect(0, 200);
  assert.equal(requests[0].url, "/api/admin/player-accounts?q=alice");
  assert.equal(requests[0].options.cache, "no-store");
  input("player-account-search", "player");
  requests[0].complete({ accounts: [{ id: "stale", email: "stale@example.com", screenName: "Stale result" }] });
  await oldSearch;
  assert.doesNotMatch(render(), /Stale result/);
  assert.match(render(), /Searching/);
  const search = startEffect(0, 200);
  const alice = { id: "alice", email: "alice@example.com", screenName: "Alice-Player", active: true, artistId: null };
  const bob = { id: "bob", email: "bob@example.com", screenName: "Bob-Player", active: true, artistId: null };
  requests.at(-1)!.complete({ accounts: [alice, bob] });
  await search;
  assert.match(render(), /Alice-Player/);
  (button("Alice-Player").props.onClick as () => void)();
  render();
  const oldDetails = startEffect(1, 0);
  assert.equal(requests.at(-1)?.url, "/api/admin/player-accounts?id=alice");
  (button("Bob-Player").props.onClick as () => void)();
  render();
  const details = {
    hasPassword: true, hasOAuth: true, supporterStatus: null, supporterOverride: null,
    artistName: null, createdAt: null, updatedAt: null, metadata: { profile: { bank_balance: 1000 } },
  };
  requests.at(-1)!.complete({ account: { ...alice, ...details } });
  await oldDetails;
  render();
  assert.equal(find(tree, element => element.type === "article"), undefined, "An old account response cannot replace the new selection");
  const selected = startEffect(1, 0);
  requests.at(-1)!.complete({ account: { ...bob, ...details } });
  await selected;
  assert.match(render(), /Not linked to an artist/);
  assert.equal(find(tree, element => element.type === "option" && element.props.value === "taken")?.props.disabled, true);
  input("player-account-artist", "catalog");
  const linkForm = () => {
    const form = find(tree, element => element.type === "form" &&
      Boolean(find(element.props.children, child => child.props.id === "player-account-artist")));
    assert.ok(form);
    return form.props.onSubmit as (event: { preventDefault: () => void }) => void;
  };
  linkForm()({ preventDefault() {} });
  const linkRequest = requests.at(-1)!;
  assert.deepEqual(JSON.parse(String(linkRequest.options.body)), {
    action: "link-artist", email: bob.email, playerId: bob.id, artistId: "catalog",
  });
  const beforeDuplicate = requests.length;
  linkForm()({ preventDefault() {} });
  render();
  (button("Alice-Player").props.onClick as () => void)();
  assert.equal(requests.length, beforeDuplicate);
  await complete({ error: "Artist is already linked." }, false);
  assert.match(render(), /Artist is already linked/);
  (button("Create new artist").props.onClick as () => void)();
  render();
  const creator = find(tree, element => element.type === "form" &&
    Boolean(find(element.props.children, child => child.props.name === "artistName")));
  assert.ok(creator);
  const creation = (creator.props.onSubmit as (event: unknown) => Promise<void>)({
    preventDefault() {}, currentTarget: { artistName: "New artist", dateOfBirth: "1990", dateOfDeath: "" },
  });
  assert.equal(requests.at(-1)?.url, "/api/admin/artists");
  assert.deepEqual(JSON.parse(String(requests.at(-1)?.options.body)), {
    artist_name: "New artist", date_of_birth: "1990", date_of_death: "",
  });
  requests.at(-1)!.complete({ artist: { _id: "new-artist", artist_name: "New artist" } });
  await creation;
  render();
  assert.equal(find(tree, element => element.props.id === "player-account-artist")?.props.value, "new-artist");
  linkForm()({ preventDefault() {} });
  assert.equal(JSON.parse(String(requests.at(-1)?.options.body)).artistId, "new-artist");
  const linked = { ...bob, ...details, artistId: "new-artist", artistName: "New artist" };
  await complete({ account: linked, message: "Artist portal enabled." });
  assert.match(render(), /Artist portal enabled/);
  assert.equal(find(tree, element => element.props.id === "player-account-artist")?.props.disabled, true);
  assert.doesNotMatch(render(), /Create new artist/);
  const supporter = find(tree, element => element.type === "form" &&
    Boolean(find(element.props.children, child => child.props.name === "supporterStatus")));
  assert.ok(supporter);
  const savingSupporter = (supporter.props.onSubmit as (event: unknown) => Promise<void>)({
    preventDefault() {}, currentTarget: { supporterStatus: "rare" },
  });
  assert.equal(JSON.parse(String(requests.at(-1)?.options.body)).action, "set-supporter-override");
  requests.at(-1)!.complete({ account: { ...linked, supporterStatus: "rare", supporterOverride: "rare" } });
  await savingSupporter;
  render();
  const recovery = find(tree, element => element.type === "form" &&
    Boolean(find(element.props.children, child => child.props.name === "confirmPassword")));
  assert.ok(recovery);
  let reset = false;
  const recoveryForm = { password: "New-password-2026", confirmPassword: "New-password-2026", reset() { reset = true; } };
  const resetting = (recovery.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {}, currentTarget: recoveryForm });
  assert.equal(JSON.parse(String(requests.at(-1)?.options.body)).action, "reset-password");
  requests.at(-1)!.complete({ account: linked });
  await resetting;
  assert.equal(reset, true);
  render();
  input("player-account-search", "");
  assert.doesNotMatch(renderToStaticMarkup(find(tree, element => element.type === "section")), /Alice-Player|Bob-Player|Searching/);
  for (const cleanup of cleanups) if (typeof cleanup === "function") cleanup();
});

test("shared item status icons render every applicable auction marker", async () => {
  const thumbnail = await load<typeof import("../components/item-thumbnail.tsx")>(
    "../components/item-thumbnail.tsx",
    {
      "./artwork-thumbnail": {
        default: ({ children }: { children?: React.ReactNode }) =>
          React.createElement("div", null, children),
      },
      "./item-expiration-display": { ItemExpirationTint: () => null },
    },
  );
  const html = renderToStaticMarkup(
    React.createElement(thumbnail.ItemStatusIcons, {
      item: {
        archivePermission: { allowed: true },
        card_renderer: "retro-game-box",
        permanent: true,
        repairing: true,
        status: "auctioned",
        tags: [],
      },
      researchTarget: true,
    }),
  );

  for (const label of [
    "Permanent collection",
    "Quest target",
    "Art style applied",
    "Being repaired",
    "Up for auction",
    "Can be archived",
  ]) {
    assert.match(html, new RegExp(`aria-label="${label}"`));
  }
});

test("item thumbnails fade submitted quest targets without changing active or non-target markers", async () => {
  const thumbnail = await load<typeof import("../components/item-thumbnail.tsx")>(
    "../components/item-thumbnail.tsx",
    {
      "./artwork-thumbnail": {
        default: ({ children }: { children?: React.ReactNode }) =>
          React.createElement("div", null, children),
      },
      "./item-expiration-display": { ItemExpirationTint: () => null },
    },
  );
  for (const researchTarget of [false, true, "submitted"] as const) {
    const html = renderToStaticMarkup(React.createElement(thumbnail.default, {
      item: {
        artwork_id: "quest-art", archivePermission: { allowed: false, reason: "Already archived." },
        card_renderer: "museum", date_received: new Date().toISOString(), foil: false,
        repairing: false, status: "unclaimed", tags: [],
      },
      researchTarget,
    }));
    if (researchTarget === "submitted") {
      assert.match(html, /aria-label="Submitted quest target"/);
      assert.match(html, /thumbnail-quest-target-submitted/);
    } else if (researchTarget) {
      assert.match(html, /aria-label="Quest target"/);
      assert.doesNotMatch(html, /thumbnail-quest-target-submitted/);
    } else {
      assert.doesNotMatch(html, /thumbnail-quest-target/);
    }
  }
});

test("auction controls prevent sellers and commission recipients from bidding in either view or a linked dialog", async () => {
  const artwork: Artwork = {
    _id: "auction-work", artist_id: "artist", artist: "Artist", title: "Auction work", date: 2026,
    rarity: "common", genre: "Abstract", medium: "Oil", value_scale: 0.5, width: 80, height: 100, active: true,
  };
  let auction: AuctionView = {
    _id: "auction", item_id: "auction-item", seller_id: null, seller_name: "Auction House", viewer: "public",
    starting_bid: 100, current_bid: 100, minimum_bid: 100, increment: 10, buy_now: 500,
    commission: { player_id: "player", coefficient: 0.1 }, current_winner_id: null, current_winner_name: null,
    has_bid: false, date_posted: new Date().toISOString(), expiration: new Date(Date.now() + 60_000).toISOString(),
    item_snapshot: {
      artwork_id: artwork._id, title: artwork.title, artist: artwork.artist, rarity: artwork.rarity,
      rarity_value: 0, medium: artwork.medium, date: artwork.date, condition: 1, level: 1, roll_count: 0,
      foil: false, seasonal: false, lottery: 0, original: false,
    },
    item: createArtistArtworkPreview(artwork), owned: true, questTarget: true,
    currentlyWinning: false, privateAuction: false,
  };
  let mode = "list";
  let requests = 0;
  let auctionFilterProps: {
    contextFiltersActive: boolean;
    sortOptions: Array<{ label: string; value: string }>;
    visibility: {
      properties: string[];
      status: boolean;
      tag: boolean;
    };
  } | null = null;
  let auctionThumbnailProps: {
    className: string;
    "data-rarity": string;
    unrevealed: boolean;
  } | null = null;
  let auctionItemThumbnailProps: {
    researchTarget?: boolean;
  } | null = null;
  let auctionItemCardProps: {
    onActivate?: () => void;
    researchTarget?: boolean;
    showStatusIcons?: boolean;
  } | null = null;
  const defaultAuctionFilters = {
    search: "", sort: "remaining", order: "asc", exclusivity: "all", quest: "all",
    rarities: rarityValues.RARITY_VALUE_TIERS, artStyle: "",
    properties: {
      mint: "any", foil: "any", unlocked: "any", seasonal: "any",
      lottery: "any", original: "any", vintage: "any",
    },
    attributeIds: [], attributeMinimum: 1,
    specialAttributeIds: [], specialAttributeMinimum: 1,
  };
  const auctionActionFetch = async () => {
    requests++;
    return { ok: true, json: async () => ({ bankBalance: 900 }) };
  };
  const bidPanel = await load<typeof import("../components/item-cards/auction-bid-panel.tsx")>(
    "../components/item-cards/auction-bid-panel.tsx",
    {
      react: React,
      "next/navigation": { useRouter: () => ({ refresh() {} }) },
      "@/server/auction-bid-permissions": auctionBidPermissions,
    },
    { fetch: auctionActionFetch },
  );
  const house = await load<typeof import("../app/play/auctions/auction-house.tsx")>("../app/play/auctions/auction-house.tsx", {
    react: {
      ...React, useEffect() {},
      useMemo: (calculate: () => unknown) => calculate(),
      useCallback: (callback: unknown) => callback,
      useState: (initial: unknown) => {
        const resolved = typeof initial === "function"
          ? (initial as () => unknown)()
          : initial;
        const value = resolved && typeof resolved === "object" && "auctions" in resolved
          ? {
              auctions: [auction],
              filterOptions: {
                artStyleIds: [],
                attributes: [],
                specialAttributes: [],
              },
              total: 1,
            }
          : resolved === "list" ? mode : resolved === true ? false : resolved;
        return [value, () => {}];
      },
    },
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@/components/item-filter-controls": {
      default: (props: typeof auctionFilterProps) => {
        auctionFilterProps = props;
        return React.createElement(
          "section",
          { className: "mock-auction-filters" },
          props?.sortOptions.map(option =>
            React.createElement("option", { key: option.value, value: option.value }, option.label),
          ),
        );
      },
    },
    "@/components/item-thumbnail": {
      default: (props: typeof auctionItemThumbnailProps) => {
        auctionItemThumbnailProps = props;
        return null;
      },
    },
    "@/components/offer-thumbnail": {
      default: (props: {
        className: string;
        "data-rarity": string;
        unrevealed: boolean;
        children?: React.ReactNode;
      }) => {
        auctionThumbnailProps = props;
        return React.createElement(
          "button",
          {
            className: props?.className,
            "data-rarity": props?.["data-rarity"],
            "data-unrevealed": props?.unrevealed || undefined,
          },
          props?.children,
        );
      },
    },
    "@/components/item-cards/auction-bid-panel": bidPanel,
    "@/components/item-cards/item-card": {
      default: (props: typeof auctionItemCardProps) => {
        auctionItemCardProps = props;
        return null;
      },
    },
    "@/components/item-cards/selection": { resolveCardRendererId: () => "museum" },
    "@/components/item-cards/standard-item-dialog": {
      default: (props: {
        actionPanel: React.ReactNode;
        headerDetails?: React.ReactNode;
      }) => props.actionPanel,
    },
    "@/server/gameplay": { ARTWORK_RARITIES: rarityValues.RARITY_VALUE_TIERS },
    "@/server/collection-inventory": {
      getDefaultCollectionFilters: () => ({
        search: "", tag: "", artStyle: "",
        statuses: ["claimed", "displayed", "auctioned"],
        rarities: rarityValues.RARITY_VALUE_TIERS,
        flags: {
          repairing: "any", "for-sale": "any", mint: "any", foil: "any",
          unlocked: "any", seasonal: "any", lottery: "any", original: "any",
          vintage: "any", forgery: "any",
        },
        attributeIds: [], attributeMinimum: 1,
        specialAttributeIds: [], specialAttributeMinimum: 1,
      }),
    },
    "@/server/player-view-settings": {
      AUCTION_PROPERTY_KEYS: ["mint", "foil", "unlocked", "seasonal", "lottery", "original", "vintage"],
      DEFAULT_AUCTION_FILTER_SETTINGS: defaultAuctionFilters,
    },
    "@/server/offer-reveal": { getOfferRevealTier: () => 3 },
    "@/server/auction-bid-permissions": auctionBidPermissions,
  }, { URLSearchParams, fetch: auctionActionFetch });
  const props = {
    initialAuctionId: null, initialBankBalance: 1_000, legendaryAttributes: [],
    marketExpertExpiration: null, playerId: "player",
  };
  for (const scenario of [
    { seller_id: "player", commission: null, blocked: true, label: "Your listing" },
    { seller_id: null, commission: { player_id: "player", coefficient: 0.1 }, blocked: true, label: "Commission listing" },
    { seller_id: null, commission: { player_id: "other-player", coefficient: 0.1 }, blocked: false, label: "Bid" },
  ]) {
    auction = { ...auction, seller_id: scenario.seller_id, commission: scenario.commission };
    for (mode of ["list", "expanded"]) {
      const html = renderToStaticMarkup(React.createElement(house.default, props));
      assert.ok(html.includes(scenario.label), `${mode}: ${scenario.label}`);
      if (scenario.blocked) assert.match(html, /class="auction-bid-action"[^]*?<button disabled=""/);
      else assert.match(html, /class="auction-bid-action"[^]*?<button type="button"/);
    }
    const dialog = house.AuctionBidDialog({
      auction, bankBalance: 1_000, legendaryAttributes: [], playerId: "player", onClose() {}, onSuccess() {},
    });
    const html = renderToStaticMarkup(dialog);
    assert.equal(
      dialog.props.headerDetails,
      undefined,
      "Auction controls should not render beside the item heading",
    );
    if (scenario.blocked) {
      assert.doesNotMatch(html, /Place bid|Buy now|Bid amount/);
      assert.equal(
        requests,
        0,
        "Rendering restricted auction controls must not send a bid",
      );
    } else {
      assert.match(html, /Place bid/);
      assert.match(html, /Buy now/);
      assert.match(html, /Available: \$1,000/);
      assert.match(html, /Next bid minimum: \$100/);
      assert.doesNotMatch(html, /<dt>Next bid<\/dt>/);
      assert.equal(
        typeof auctionItemCardProps?.onActivate,
        "function",
        "Expanded auction card previews should open the auction-aware dialog",
      );
    }
  }
  mode = "list";
  let html = renderToStaticMarkup(React.createElement(house.default, props));
  assert.match(
    html,
    /<span class="auction-list-current-bid" role="cell">-<\/span>/,
  );
  assert.doesNotMatch(html, /<span role="columnheader">Next bid<\/span>/);
  auction = {
    ...auction,
    seller_id: null,
    commission: null,
    starting_bid: 100,
    current_bid: 120,
    has_bid: true,
  };
  html = renderToStaticMarkup(React.createElement(house.default, props));
  assert.ok(
    auctionFilterProps?.sortOptions.some(
      option => option.value === "dropChance:desc",
    ),
  );
  assert.equal(auctionFilterProps?.visibility.status, false);
  assert.equal(auctionFilterProps?.visibility.tag, false);
  assert.equal(auctionFilterProps?.contextFiltersActive, false);
  assert.deepEqual(auctionFilterProps?.visibility.properties, [
    "mint", "foil", "unlocked", "seasonal", "lottery", "original", "vintage",
  ]);
  assert.ok(
    auctionFilterProps?.sortOptions.every(
      option => !option.label.toLowerCase().includes("acquired"),
    ),
  );
  renderToStaticMarkup(React.createElement(house.default, {
    ...props,
    initialAuctionFilters: {
      ...defaultAuctionFilters,
      exclusivity: "private",
    },
  }));
  assert.equal(auctionFilterProps?.contextFiltersActive, true);
  assert.equal(auctionThumbnailProps?.className, "auction-list-thumbnail");
  assert.equal(auctionThumbnailProps?.["data-rarity"], "common");
  assert.equal(auctionThumbnailProps?.unrevealed, false);
  assert.equal(auctionItemThumbnailProps?.researchTarget, true);
  assert.match(
    html,
    /<span class="auction-list-current-bid" data-has-bid="true" role="cell">\$120<\/span>/,
  );
  mode = "expanded";
  html = renderToStaticMarkup(React.createElement(house.default, props));
  assert.equal(auctionItemCardProps?.researchTarget, true);
  assert.equal(auctionItemCardProps?.showStatusIcons, true);
  assert.ok(
    html.indexOf('class="auction-lot-details"') <
      html.indexOf('class="auction-lot-card"'),
    "Expanded auction details and bid controls should precede the attached card preview",
  );
  assert.match(
    html,
    /<strong class="auction-current-bid">\$120<\/strong>/,
  );
  assert.doesNotMatch(html, /<dt>Next bid<\/dt>/);
  const auctionCss = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(
    auctionCss,
    /\.auction-list-thumbnail img \{[^}]*object-fit: contain;/,
  );
  assert.match(
    auctionCss,
    /\.auction-list-current-bid\[data-has-bid="true"\] \{[^}]*font-weight: 900;/,
  );
  assert.match(
    auctionCss,
    /\.auction-lot \{[^}]*grid-template-columns: minmax\(210px, 1fr\) 300px;/,
  );
  assert.match(
    auctionCss,
    /\.item-card-status-watermarks \{[^}]*z-index: 20;/,
  );
  const [dashboardSource, filterSource] = await Promise.all([
    readFile(
      new URL("../app/play/game-dashboard.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../components/item-filter-controls.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(dashboardSource, /<ItemFilterControls/);
  assert.match(filterSource, /export default function ItemFilterControls/);
  assert.match(filterSource, /visibility\.properties/);
  assert.match(filterSource, /className="collection-filter-indicator"/);
  auction = {
    ...auction,
    viewer: "player",
    privateAuction: true,
    transferable: true,
    seller_id: null,
    commission: { player_id: "player", coefficient: 0.1 },
  };
  html = renderToStaticMarkup(house.AuctionBidDialog({
    auction, bankBalance: 1_000, canMakePublic: true, legendaryAttributes: [],
    playerId: "player", onClose() {}, onSuccess() {},
  }));
  assert.match(html, /Place bid/);
  assert.match(html, /Make public/);

  auction = {
    ...auction,
    transferable: false,
  };
  html = renderToStaticMarkup(house.AuctionBidDialog({
    auction, bankBalance: 1_000, canMakePublic: true, legendaryAttributes: [],
    playerId: "player", onClose() {}, onSuccess() {},
  }));
  assert.doesNotMatch(html, /Make public/);

  auction = {
    ...auction,
    transferable: true,
    viewer: "other-player",
    commission: { player_id: "other-player", coefficient: 0.1 },
  };
  html = renderToStaticMarkup(house.AuctionBidDialog({
    auction, bankBalance: 1_000, canMakePublic: true, legendaryAttributes: [],
    playerId: "player", onClose() {}, onSuccess() {},
  }));
  assert.match(html, /Place bid/);
  assert.doesNotMatch(html, /Make public/);
});

test("archive entries use shared cropped thumbnails without losing variant progress", async () => {
  const [dashboardSource, globalCss] = await Promise.all([
    readFile(
      new URL("../app/play/game-dashboard.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(
    dashboardSource,
    /<OfferThumbnail[^]*className="archive-artwork-thumbnail"[^]*unrevealed=\{false\}/,
  );
  assert.match(
    dashboardSource,
    /adjustment=\{getArtworkThumbnailAdjustment\(archive\.artwork\)\}/,
  );
  assert.match(
    dashboardSource,
    /className="archive-property-progress"[^]*\{progress\.archived\}\/\{progress\.total\}/,
  );
  assert.match(
    globalCss,
    /\.collection-thumbnail-list button,\s*\.auction-list-thumbnail,\s*\.archive-artwork-thumbnail,\s*\.mystery-thumbnail \{/,
  );
});

test("the admin item creator offers artist Originals only for eligible artwork and sends them without selecting a recipient", async () => {
  const work: Artwork = {
    _id: "eligible", artist_id: "artist-id", artist: "Artist", title: "Artist work", date: 2026,
    rarity: "rare", genre: "Abstract", medium: "Oil", value_scale: 0.5, width: 80, height: 100, active: true,
  };
  const props = {
    artworks: ["eligible", "unlinked", "has-original"].map(id => ({ ...work, _id: id, effectAttributeIds: [] })),
    attributes: ["first", "second"].map(id => ({ _id: id, title: id, type: "test", active: true })),
    legendaryAttributes: [],
  };
  const states: unknown[] = [];
  let stateIndex = 0;
  let eligibilityEffect: React.EffectCallback | undefined;
  let cleanup: ReturnType<React.EffectCallback>;
  let originalExists = false;
  let finishCreation: (() => void) | undefined;
  let sent: { destination: { type: string; playerId?: string }; item: { artworkId: string } } | undefined;
  const creator = await load<typeof import("../app/admin/items/item-creator.tsx")>("../app/admin/items/item-creator.tsx", {
    react: {
      ...React,
      useState: (initial: unknown) => {
        const index = stateIndex++;
        if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
        return [states[index], (value: unknown) => {
          states[index] = typeof value === "function" ? value(states[index]) : value;
        }];
      },
      useMemo: (calculate: () => unknown) => calculate(),
      useEffect: (effect: React.EffectCallback, dependencies?: React.DependencyList) => {
        if (dependencies?.length === 3 && typeof dependencies[2] === "string") eligibilityEffect = effect;
      },
    },
    "@/components/item-cards/card-cosmetics-provider": { useCardCosmetics: () => [{ id: "museum", name: "Museum" }] },
    "@/components/item-cards/item-card": { default: () => null },
    "@/server/item-attribute-counts": { getItemAttributeCounts },
  }, {
    AbortController,
    fetch: async (url: string, options: RequestInit = {}) => {
      if (options.method === "POST") {
        assert.equal(url, "/api/admin/items");
        sent = JSON.parse(String(options.body));
        return new Promise(resolve => { finishCreation = () => {
          originalExists = true;
          resolve({ ok: true, json: async () => ({ itemId: "new-original", message: "Artist work was sent to Artist." }) });
        }; });
      }
      const artworkId = new URL(url, "http://localhost").searchParams.get("artworkId");
      assert.equal(options.cache, "no-store");
      return { ok: true, json: async () => ({
        artistOriginalRecipient: artworkId === "eligible" && !originalExists ? { id: "artist-player", screenName: "Artist" } : null,
      }) };
    },
  });
  type Element = React.ReactElement<{ children?: React.ReactNode } & Record<string, unknown>>;
  function find(node: React.ReactNode, predicate: (element: Element) => boolean): Element | undefined {
    for (const child of React.Children.toArray(node)) {
      if (!React.isValidElement(child)) continue;
      const element = child as Element;
      if (predicate(element)) return element;
      const match = find(element.props.children, predicate);
      if (match) return match;
    }
  }
  let tree: React.ReactNode;
  const render = () => {
    stateIndex = 0;
    tree = creator.default(props);
    return renderToStaticMarkup(tree);
  };
  const refreshEligibility = async () => {
    assert.ok(eligibilityEffect);
    if (typeof cleanup === "function") cleanup();
    cleanup = eligibilityEffect();
    await new Promise<void>(resolve => setImmediate(resolve));
    return render();
  };
  const selectArtwork = (id: string) => {
    const select = find(tree, element => element.type === "select" && typeof element.props.size === "number");
    assert.ok(select);
    (select.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: id } });
    return render();
  };
  assert.doesNotMatch(render(), /Create original/);
  assert.match(await refreshEligibility(), /Create original/);
  assert.match(render(), /Send an Original to <strong>@Artist<\/strong>/);
  const normalSend = find(tree, element => element.type === "button" && element.props.children === "Send item");
  assert.equal(normalSend?.props["aria-disabled"], true);
  for (const id of ["unlinked", "has-original"]) {
    assert.doesNotMatch(selectArtwork(id), /Create original/, "Previous artwork eligibility must not leak into another selection");
    assert.doesNotMatch(await refreshEligibility(), /Create original/);
  }
  selectArtwork("eligible");
  await refreshEligibility();
  const button = find(tree, element => element.type === "button" && element.props.children === "Create original");
  assert.ok(button);
  (button.props.onClick as () => void)();
  assert.ok(sent);
  assert.deepEqual(sent.destination, { type: "artist_original" });
  assert.equal(sent.item.artworkId, "eligible");
  render();
  assert.equal(find(tree, element => element.type === "button" && element.props.children === "Create original")?.props.disabled, true);
  assert.ok(finishCreation);
  finishCreation();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.match(render(), /Item sent/);
  const again = find(tree, element => element.type === "button" && element.props.children === "Create another item");
  assert.ok(again);
  (again.props.onClick as () => void)();
  assert.doesNotMatch(render(), /Create original/);
  assert.doesNotMatch(await refreshEligibility(), /Create original/);
  if (typeof cleanup === "function") cleanup();
});

test("the admin item creator displays calculated preview drop chances and refreshes them after item edits", async () => {
  const artwork: Artwork = {
    _id: "preview-work", artist_id: "artist-id", artist: "Artist", title: "Preview work", date: 2026,
    rarity: "common", genre: "Abstract", medium: "Oil", value_scale: 0.5, width: 80, height: 100, active: true,
  };
  const props = {
    artworks: [artwork, { ...artwork, _id: "inactive-work", active: false }]
      .map(work => ({ ...work, effectAttributeIds: [] })),
    attributes: [{ _id: "first", title: "First", type: "test", active: true }],
    legendaryAttributes: [],
  };
  const states: unknown[] = [];
  let stateIndex = 0;
  let previewEffect: React.EffectCallback | undefined;
  let cleanup: ReturnType<React.EffectCallback>;
  let runPreview: (() => Promise<void>) | undefined;
  let coefficient = 0.0025;
  const requests: { artworkId: string; foil: boolean }[] = [];
  const creator = await load<typeof import("../app/admin/items/item-creator.tsx")>("../app/admin/items/item-creator.tsx", {
    react: {
      ...React,
      useState: (initial: unknown) => {
        const index = stateIndex++;
        if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
        return [states[index], (value: unknown) => {
          states[index] = typeof value === "function" ? value(states[index]) : value;
        }];
      },
      useMemo: (calculate: () => unknown) => calculate(),
      useEffect: (effect: React.EffectCallback, dependencies?: React.DependencyList) => {
        if (dependencies?.length === 3 && typeof dependencies[2] === "object") previewEffect = effect;
      },
    },
    "@/components/item-cards/card-cosmetics-provider": { useCardCosmetics: () => [{ id: "museum", name: "Museum" }] },
    "@/components/item-cards/item-card": { default: () => null },
    "@/server/item-attribute-counts": { getItemAttributeCounts },
  }, {
    AbortController,
    window: {
      setTimeout: (callback: () => Promise<void>) => { runPreview = callback; return 1; },
      clearTimeout() {},
    },
    fetch: async (url: string, options: RequestInit) => {
      assert.equal(url, "/api/admin/items");
      assert.equal(options.method, "PUT");
      const { item } = JSON.parse(String(options.body));
      requests.push(item);
      return { ok: true, json: async () => ({ item: {
        ...createArtistArtworkPreview(artwork),
        foil: item.foil,
        drop_chance_coefficient: coefficient,
        odds: formatItemDropChance(coefficient),
      } }) };
    },
  });
  type Element = React.ReactElement<{ children?: React.ReactNode } & Record<string, unknown>>;
  function find(node: React.ReactNode, predicate: (element: Element) => boolean): Element | undefined {
    for (const child of React.Children.toArray(node)) {
      if (!React.isValidElement(child)) continue;
      const element = child as Element;
      if (predicate(element)) return element;
      const match = find(element.props.children, predicate);
      if (match) return match;
    }
  }
  let tree: React.ReactNode;
  const render = () => {
    stateIndex = 0;
    tree = creator.default(props);
    return renderToStaticMarkup(tree);
  };
  const refreshPreview = async () => {
    assert.ok(previewEffect);
    if (typeof cleanup === "function") cleanup();
    cleanup = previewEffect();
    assert.ok(runPreview);
    await runPreview();
    return render();
  };
  assert.doesNotMatch(render(), /Drop chance:/);
  assert.match(await refreshPreview(), /Drop chance: <strong>1 in 400<\/strong>/);
  assert.equal(requests.at(-1)?.foil, false);

  const foil = find(tree, element => element.props.label === "Foil");
  assert.ok(foil);
  (foil.props.set as (value: boolean) => void)(true);
  render();
  coefficient = 0.000025;
  assert.match(await refreshPreview(), /Drop chance: <strong>1 in 40,000<\/strong>/);
  assert.equal(requests.at(-1)?.foil, true);

  const select = find(tree, element => element.type === "select" && typeof element.props.size === "number");
  assert.ok(select);
  (select.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "inactive-work" } });
  render();
  coefficient = 0;
  assert.match(await refreshPreview(), /Drop chance: <strong>Not currently droppable<\/strong>/);
  assert.equal(requests.at(-1)?.artworkId, "inactive-work");
  if (typeof cleanup === "function") cleanup();
});

test("gallery finish sliders keep responsive drafts, update the scene only on release and save bounded values", async () => {
  let finishes = galleryFinishes.getGalleryFinishes(null);
  const states: unknown[] = [];
  const refs: { current: unknown }[] = [];
  let stateIndex = 0;
  let refIndex = 0;
  let sceneChanges = 0;
  const requests: { galleryId: string; finishes: typeof finishes }[] = [];
  let refreshes = 0;
  const menu = await load<typeof import("../components/gallery-finish-menu.tsx")>("../components/gallery-finish-menu.tsx", {
    "next/navigation": { useRouter: () => ({ refresh: () => { refreshes++; } }) },
    "@/server/gallery-finishes": galleryFinishes,
    react: {
      ...React, useId: () => "finishes", useEffect() {},
      useRef: (current: unknown) => {
        const index = refIndex++;
        if (!(index in refs)) refs[index] = { current };
        return refs[index];
      },
      useState: (initial: unknown) => {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (next: unknown) => {
          states[index] = typeof next === "function" ? next(states[index]) : next;
        }];
      },
    },
  }, {
    AbortController,
    fetch: async (url: string, options: { method: string; body: string }) => {
      assert.equal(url, "/api/play/gallery-finishes");
      assert.equal(options.method, "PATCH");
      const update = JSON.parse(options.body);
      requests.push(update);
      return Response.json(update);
    },
  });
  let memo: { dependencies: React.DependencyList; value: unknown } | undefined;
  const layouts: galleryLayout.GalleryLayout[] = [];
  const view = await load<typeof import("../components/gallery-view.tsx")>("../components/gallery-view.tsx", {
    "next/image": {}, "@/server/gallery-finishes": galleryFinishes, "@/server/artwork-image-url": imageUrls,
    "./gallery-layout": {
      ...galleryLayout,
      createGalleryLayout: (...args: Parameters<typeof galleryLayout.createGalleryLayout>) => {
        const layout = galleryLayout.createGalleryLayout(...args);
        layouts.push(layout);
        return layout;
      },
    },
    react: {
      ...React, useState: (initial: unknown) => [initial, () => {}], useRef: (current: unknown) => ({ current }),
      useCallback: (callback: unknown) => callback, useEffect() {},
      useMemo: (create: () => unknown, dependencies: React.DependencyList) => {
        if (!memo || dependencies.some((value, index) => !Object.is(value, memo!.dependencies[index]))) {
          memo = { dependencies, value: create() };
        }
        return memo.value;
      },
    },
  });
  const work: Artwork = {
    _id: "first", artist: "Artist", title: "Artwork", date: 2026, rarity: "common",
    genre: "Abstract", medium: "Oil", value_scale: 0.5, width: 80, height: 100, active: true,
  };
  const items = [createArtistArtworkPreview(work), createArtistArtworkPreview({ ...work, _id: "second" })];
  type Element = React.ReactElement<{
    children?: React.ReactNode; "aria-label"?: string; type?: string; min?: number; max?: number; step?: number; value?: number;
    onChange?: (event: { target: { valueAsNumber: number } }) => void;
    onPointerDown?: (event: { pointerId: number; currentTarget: { setPointerCapture: (id: number) => void } }) => void;
    onPointerUp?: () => void; onPointerCancel?: () => void; onLostPointerCapture?: () => void;
    onKeyUp?: () => void; onBlur?: () => void;
    onSubmit?: (event: { preventDefault: () => void }) => void;
  }>;
  function elements(node: React.ReactNode): Element[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement<Element["props"]>(node)) return [];
    return [node, ...elements(node.props.children)];
  }
  function render() {
    stateIndex = refIndex = 0;
    view.default({ items, finishes, emptyMessage: "", onSelectItem() {} });
    return menu.default({ finishes, galleryId: "gallery", onChange: next => { finishes = next; sceneChanges++; } });
  }
  let tree = render();
  let control = elements(tree).find(element => element.props["aria-label"] === "Spacing");
  assert.ok(control?.props.onChange);
  assert.equal(control.props.type, "range");
  assert.equal(control.props.min, 50);
  assert.equal(control.props.max, 400);
  assert.equal(control.props.step, 1);
  assert.equal(control.props.value, 100);
  let capturedPointer: number | undefined;
  control.props.onPointerDown!({ pointerId: 7, currentTarget: { setPointerCapture: id => { capturedPointer = id; } } });
  assert.equal(capturedPointer, 7, "Capture pointer releases even outside the slider");
  for (const [centimeters, expected] of [[-1, 0.5], [50, 0.5], [400, 4], [401, 4], [238, 2.38], [NaN, 2.38]]) {
    const previous = finishes;
    const changes = sceneChanges;
    const previousLayout = layouts.at(-1);
    control.props.onChange!({ target: { valueAsNumber: centimeters } });
    tree = render();
    control = elements(tree).find(element => element.props["aria-label"] === "Spacing");
    assert.ok(control?.props.onChange);
    assert.equal(finishes, previous, "Dragging does not forward draft finishes to the scene");
    assert.equal(sceneChanges, changes);
    assert.equal(layouts.at(-1), previousLayout);
    assert.equal(control.props.value, Math.round(expected * 100));
    assert.match(renderToStaticMarkup(tree), new RegExp(`${Math.round(expected * 100)} cm</label>`));
    control.props.onPointerUp!();
    control.props.onLostPointerCapture!();
    control.props.onBlur!();
    tree = render();
    control = elements(tree).find(element => element.props["aria-label"] === "Spacing");
    assert.ok(control?.props.onChange);
    assert.equal(finishes.spacing, expected);
    assert.equal(sceneChanges, changes + Number(previous.spacing !== expected), "Release commits once; redundant completion events do not update the scene");
    const [first, second] = layouts.at(-1)!.paintings;
    const frameGap = second.x - second.width / 2 - second.frameWidth - second.matteWidth -
      (first.x + first.width / 2 + first.frameWidth + first.matteWidth);
    assert.ok(Math.abs(frameGap - expected) < 1e-10, "Releasing the slider rebuilds the scene with the final gap");
  }
  for (const [label, slot, inputs, units, completion] of [
    ["Frame width", "frame_width", [70, 80], 1000, "onKeyUp"],
    ["Matte width", "matte_width", [130, 140], 1000, "onPointerCancel"],
    ["Brightness", "brightness", [0.7, 0.9], 1, "onBlur"],
    ["Spacing", "spacing", [300, 238], 100, "onLostPointerCapture"],
  ] as const) {
    const previous = finishes;
    const changes = sceneChanges;
    const previousLayout = layouts.at(-1);
    let slider = elements(tree).find(element => element.props["aria-label"] === label)!;
    for (const input of inputs) {
      slider.props.onChange!({ target: { valueAsNumber: input } });
      tree = render();
      slider = elements(tree).find(element => element.props["aria-label"] === label)!;
      assert.equal(slider.props.value, input, "Each slider stays responsive throughout a drag or held key");
      assert.equal(finishes, previous);
      assert.equal(sceneChanges, changes);
      assert.equal(layouts.at(-1), previousLayout);
    }
    slider.props[completion]!();
    slider.props.onBlur!();
    tree = render();
    const expected = inputs[1] / units;
    assert.equal(finishes[slot], expected);
    assert.equal(sceneChanges, changes + Number(previous[slot] !== expected), "Returning to the original value does not need a scene update");
  }
  const layoutCount = layouts.length;
  finishes = { ...finishes, wall: [0.1, 0.2, 0.3] };
  tree = render();
  assert.equal(layouts.length, layoutCount, "Color changes alone still avoid rebuilding geometry");
  assert.match(renderToStaticMarkup(tree), /Unsaved changes/);
  const form = elements(tree).find(element => element.type === "form");
  assert.ok(form?.props.onSubmit);
  form.props.onSubmit({ preventDefault() {} });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(requests, [{ galleryId: "gallery", finishes }]);
  assert.equal(requests[0].finishes.spacing, 2.38);
  assert.equal(refreshes, 1);
  assert.match(renderToStaticMarkup(render()), /Finishes saved/);
});

test("gallery previews track window height while artist introductions and owner controls keep their layout", async () => {
  const finishMenu = await load<typeof import("../components/gallery-finish-menu.tsx")>("../components/gallery-finish-menu.tsx", {
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@/server/gallery-finishes": galleryFinishes,
  });
  const artist: PublicArtistProfile = {
    id: "artist-id", playerId: "artist-player", name: "Artist", bio: "An artist biography.",
    featureLink: "",
    portfolioUrl: "https://portfolio.example.com/", socialLinks: { bluesky: "https://bsky.app/profile/artist.example" },
    featured: true,
  };
  const work: Artwork = {
    _id: "artist-work", artist_id: artist.id, artist: artist.name, title: "Artist work", date: 2026,
    rarity: "rare", genre: "Abstract", medium: "Oil", value_scale: 0.5, width: 80, height: 100, active: true,
  };
  const artistComponents = await load<typeof import("../components/artist-gallery.tsx")>("../components/artist-gallery.tsx", {
    "./artwork-thumbnail": {},
    "./item-cards/item-card": { default: ({ item }: { item: ReturnType<typeof createArtistArtworkPreview> }) =>
      React.createElement("article", { "data-preview": item._id }, item.artwork.title) },
    "@/server/artist-artwork-preview": { createArtistArtworkPreview },
  });
  const gallery = {
    artist: artist as PublicArtistProfile | null, artistWorks: [work],
    galleryId: "artist-gallery", finishes: galleryFinishes.DEFAULT_GALLERY_FINISHES, overviewDistanceCm: 1250, visitorScale: 0.55,
    cameraHeightCm: 175, artworkCenterHeightCm: 160,
    owner: { playerId: "artist-player", screenName: "Artist-Player", level: 1, vintageLevel: 0 },
    items: [], auctions: [], legendaryAttributes: [], npcs: [], metadata: null,
  };
  let seedGallery = true;
  let windowHeight = 560;
  let onResize: (() => void) | undefined;
  let disconnected = false;
  const heightEffects: React.EffectCallback[] = [];
  const properties = new Map<string, string>();
  const galleryWindow = { getBoundingClientRect: () => ({ height: windowHeight }) };
  const workspace = {
    querySelector: (selector: string) => {
      assert.equal(selector, ".public-gallery-window");
      return galleryWindow;
    },
    style: { setProperty: (name: string, value: string) => properties.set(name, value) },
  };
  let scenePreference: {
    visitorsVisible?: boolean; onVisitorsVisibleChange?: (visible: boolean) => void;
    overviewDistanceCm?: number; visitorScale?: number; cameraHeightCm?: number; artworkCenterHeightCm?: number;
  } | undefined;
  const preferenceUpdates: { showGalleryVisitors?: boolean }[] = [];
  const noop = () => {};
  const explorer = await load<typeof import("../app/play/galleries/gallery-explorer.tsx")>(
    "../app/play/galleries/gallery-explorer.tsx", {
      react: {
        ...React,
        useRef: (initial: unknown) => React.useRef(initial === null ? workspace : initial),
        useEffect: (effect: React.EffectCallback, dependencies?: React.DependencyList) => {
          if (dependencies?.[0] === gallery.galleryId) heightEffects.push(effect);
        },
        useState: (initial: unknown) => React.useState(
          initial === null && seedGallery
            ? (seedGallery = false, gallery)
            : initial === true ? false : initial,
        ),
      },
      "next/navigation": { useRouter: () => ({ replace: noop }) },
      "@/components/artwork-thumbnail": {}, "@/components/item-thumbnail": {},
      "@/components/gallery-attraction-chart": {},
      "@/components/item-cards/artwork-image-adjustments": imageAdjustments,
      "@/components/community-emotes": {}, "@/components/item-cards/item-card": {},
      "@/components/item-cards/shared": {},
      "@/components/public-gallery": { default: (props: typeof scenePreference) => {
        scenePreference = props;
        return React.createElement("section", { className: "public-gallery-window" });
      } },
      "@/components/gallery-finish-menu": finishMenu,
      "@/components/use-gallery-visitors": { useGalleryVisitors: () => ({
        visitors: [], markVisitorMet: noop, removeVisitor: noop, refreshVisitors: noop, replaceVisitors: noop,
      }) },
      "@/server/social-battery": {}, "@/server/npc-gameplay": { NPC_QUALITIES: [] },
      "../auctions/auction-house": {}, "./gallery-chat": { default: () => null },
      "@/components/artist-gallery": artistComponents,
    }, {
      URLSearchParams,
      ResizeObserver: class {
        constructor(callback: () => void) { onResize = callback; }
        observe(element: unknown) { assert.equal(element, galleryWindow); }
        disconnect() { disconnected = true; }
      },
    },
  );
  for (const [viewerId, isArtist] of [
    ["artist-player", true], ["artist-player", false], ["visitor", true], ["visitor", false],
  ] as const) {
    gallery.artist = isArtist ? artist : null;
    seedGallery = true;
    heightEffects.length = 0;
    windowHeight = 560;
    disconnected = false;
    const showVisitors = viewerId === "artist-player";
    const html = renderToStaticMarkup(React.createElement(explorer.default, {
      impersonating: false, initialBankBalance: 0, initialGalleryId: "artist-player",
      initialSort: "score", initialViewMode: "grid", meetingNpc: null, npcSpawnIntervalMinutes: 5,
      npcSpawnOptions: [], visitorTypes: [], npcRewardEffects: {}, onMeetNpc: async () => false, onGoHome: noop,
      onViewSettingsChange: settings => preferenceUpdates.push(settings), socialBattery: 100, viewerId,
      visitorsVisible: showVisitors,
    }));
    assert.equal(scenePreference?.visitorsVisible, showVisitors);
    assert.equal(scenePreference?.overviewDistanceCm, 1250);
    assert.equal(scenePreference?.visitorScale, 0.55);
    assert.equal(scenePreference?.cameraHeightCm, 175);
    assert.equal(scenePreference?.artworkCenterHeightCm, 160);
    assert.ok(scenePreference?.onVisitorsVisibleChange);
    scenePreference.onVisitorsVisibleChange(!showVisitors);
    assert.deepEqual({ ...preferenceUpdates.at(-1) }, { showGalleryVisitors: !showVisitors });
    if (viewerId === "artist-player") {
      assert.match(html, /aria-label="Gallery finishes"/);
      assert.match(html, /Save finishes/);
      assert.match(html, /aria-label="Wall color picker"/);
      assert.match(html, /aria-label="Frame width"/);
      assert.match(html, /aria-label="Spacing"/);
      assert.match(html, /<div class="visited-gallery-display"><section class="public-gallery-window"><\/section><section aria-label="Gallery finishes"/);
      assert.doesNotMatch(html, /<summary>Gallery finishes<\/summary>|visited-gallery-finish-controls/);
    } else {
      assert.doesNotMatch(html, /Gallery finishes|Save finishes/);
      assert.match(html, isArtist ? /Artist&#x27;s Gallery/ : /Artist-Player&#x27;s Gallery/);
    }
    assert.match(html, /<h2 class="info-panel-title">[^<]+&#x27;s Gallery<\/h2><button aria-label="Copy gallery link" class="gallery-share"/);
    assert.doesNotMatch(html, /visited-gallery-metadata-header/);
    assert.doesNotMatch(html, /Public gallery link|>Copy gallery link<\/button>/);
    if (isArtist) {
      const introductionIndex = html.indexOf('class="artist-gallery-introduction"');
      assert.ok(introductionIndex >= 0);
      for (const className of ["visited-gallery-workspace", "collection-preview visited-gallery-preview", "public-gallery-window"]) {
        assert.ok(introductionIndex < html.indexOf(`class="${className}"`), `Artist information precedes ${className}`);
      }
      assert.match(html, /An artist biography\./);
      assert.match(html, /href="https:\/\/portfolio.example.com\/"/);
      assert.match(html, /href="https:\/\/bsky.app\/profile\/artist.example"/);
      assert.ok(html.indexOf('class="artist-gallery-showcase"') > html.indexOf('class="visited-gallery-workspace"'));
      assert.match(html, /data-preview="artist-preview:artist-work"/);
      assert.equal((html.match(/class="artist-bio"/g) ?? []).length, 1);
      assert.equal((html.match(/class="artist-social-links"/g) ?? []).length, 1);
    } else {
      assert.doesNotMatch(html, /artist-gallery-introduction|artist-gallery-showcase|An artist biography/);
    }
    assert.equal(heightEffects.length, 1);
    const cleanup = heightEffects[0]();
    assert.equal(properties.get("--gallery-window-height"), "560px");
    windowHeight = 320;
    assert.ok(onResize);
    onResize();
    assert.equal(properties.get("--gallery-window-height"), "320px");
    assert.equal(typeof cleanup, "function");
    if (typeof cleanup === "function") cleanup();
    assert.equal(disconnected, true);
  }
});

test("featured artist galleries open on an artist work while other galleries and empty exhibitions retain their defaults", async () => {
  const work: Artwork = {
    _id: "artist-work", artist_id: "artist-id", artist: "Artist", title: "Artist work", date: 2026,
    rarity: "rare", genre: "Abstract", medium: "Oil", value_scale: 0.5, width: 80, height: 100, active: true,
  };
  const artistPreview = createArtistArtworkPreview(work);
  const collectedItem = {
    ...createArtistArtworkPreview({ ...work, _id: "collected-work", artist_id: "other-artist", artist: "Other Artist" }),
    _id: "valuable-collected-item", owner: "artist-player",
    values: { ...artistPreview.values, actual: 500_000 },
  };
  const displayedArtistItem = {
    ...artistPreview, _id: "displayed-artist-work", owner: "artist-player", original: true,
    values: { ...artistPreview.values, actual: 123 },
  };
  const artist: PublicArtistProfile = {
    id: "artist-id", playerId: "artist-player", name: "Artist", bio: "",
    featureLink: "",
    portfolioUrl: "https://portfolio.example.com/", socialLinks: {}, instagramUsername: null, featured: true,
  };
  const baseGallery = {
    artist, artistWorks: [work], items: [artistPreview, collectedItem], auctions: [], npcs: [],
    galleryId: "artist-gallery", finishes: galleryFinishes.DEFAULT_GALLERY_FINISHES, legendaryAttributes: [], metadata: null,
    owner: { playerId: "artist-player", screenName: "Artist-Player", level: 1, vintageLevel: 0 },
  };
  const cases = [
    { gallery: baseGallery, expected: artistPreview._id },
    { gallery: baseGallery, initialItemId: collectedItem._id, expected: collectedItem._id },
    { gallery: baseGallery, initialItemId: "no-longer-featured", expected: artistPreview._id },
    { gallery: { ...baseGallery, items: [displayedArtistItem, collectedItem] }, expected: displayedArtistItem._id },
    { gallery: { ...baseGallery, artist: { ...artist, featured: false } }, expected: collectedItem._id },
    { gallery: { ...baseGallery, artist: null, artistWorks: [], items: [collectedItem] }, expected: collectedItem._id },
    { gallery: { ...baseGallery, artistWorks: [], items: [collectedItem] }, expected: collectedItem._id },
    { gallery: { ...baseGallery, artistWorks: [], items: [], auctions: [
      { _id: "auction", item: collectedItem, current_bid: 100, buy_now: null },
    ] }, expected: collectedItem._id },
    { gallery: { ...baseGallery, artistWorks: [], items: [] }, expected: undefined },
  ];
  const noop = () => {};
  for (const { gallery, initialItemId, expected } of cases) {
    const states: unknown[] = [];
    let stateIndex = 0;
    let loadEffect: React.EffectCallback | undefined;
    let selectItem: ((item: typeof artistPreview) => void) | undefined;
    let previewArtistWork: ((item: typeof artistPreview) => void) | undefined;
    const explorer = await load<typeof import("../app/play/galleries/gallery-explorer.tsx")>(
      "../app/play/galleries/gallery-explorer.tsx", {
        react: {
          ...React,
          useState: (initial: unknown) => {
            const index = stateIndex++;
            if (!(index in states)) states[index] = initial;
            return [states[index], (value: unknown) => {
              states[index] = typeof value === "function" ? value(states[index]) : value;
            }];
          },
          useEffect: (effect: React.EffectCallback, dependencies?: React.DependencyList) => {
            if (dependencies?.[0] === gallery.owner.playerId) loadEffect = effect;
          },
        },
        "next/navigation": { useRouter: () => ({ replace: noop }) },
        "@/components/artwork-thumbnail": {}, "@/components/item-thumbnail": { default: () => null },
        "@/components/gallery-attraction-chart": {},
        "@/components/item-cards/artwork-image-adjustments": imageAdjustments,
        "@/components/community-emotes": {}, "@/components/item-cards/shared": {},
        "@/components/item-cards/item-card": { default: ({ item }: { item: typeof artistPreview }) =>
          React.createElement("article", { "data-initial-preview": item._id }) },
        "@/components/public-gallery": { default: ({ focusedItemId, items, onSelectItem }: {
          focusedItemId?: string; items: typeof artistPreview[]; onSelectItem: typeof selectItem;
        }) => {
          selectItem = onSelectItem;
          return React.createElement("div", {
            "data-initial-focus": focusedItemId, "data-gallery-items": items.map(item => item._id).join(","),
          });
        } },
        "@/components/gallery-finish-menu": {},
        "@/components/use-gallery-visitors": { useGalleryVisitors: () => ({ visitors: [], replaceVisitors: noop }) },
        "@/server/social-battery": {}, "@/server/npc-gameplay": { NPC_QUALITIES: [] },
        "../auctions/auction-house": {}, "./gallery-chat": { default: () => null },
        "@/components/artist-gallery": {
          ArtistGalleryIntroduction: () => null,
          ArtistGalleryShowcase: ({ onPreview }: { onPreview: typeof previewArtistWork }) => {
            previewArtistWork = onPreview;
            return null;
          },
        },
      }, { URLSearchParams, document: { querySelector: () => null }, fetch: async () => ({ ok: true, json: async () => gallery }) },
    );
    const render = () => {
      stateIndex = 0;
      return renderToStaticMarkup(React.createElement(explorer.default, {
        impersonating: false, initialBankBalance: 0, initialGalleryId: gallery.owner.playerId,
        initialItemId,
        initialSort: "score", initialViewMode: "grid", meetingNpc: null, npcSpawnIntervalMinutes: 5,
        npcSpawnOptions: [], visitorTypes: [], npcRewardEffects: {}, onMeetNpc: async () => false, onGoHome: noop,
        onViewSettingsChange: noop, socialBattery: 100, viewerId: "visitor",
      }));
    };
    render();
    assert.ok(loadEffect);
    const cleanup = loadEffect();
    await new Promise<void>(resolve => setImmediate(resolve));
    const html = render();
    for (const attribute of ["data-initial-preview", "data-initial-focus"]) {
      assert.equal(html.match(new RegExp(`${attribute}="([^"]*)"`))?.[1], expected);
    }
    if (expected === artistPreview._id) {
      assert.ok(html.includes(`data-gallery-items="${artistPreview._id},${collectedItem._id}"`));
      assert.ok(selectItem);
      selectItem(collectedItem);
      const navigated = render();
      assert.ok(navigated.includes(`data-initial-preview="${collectedItem._id}"`));
      assert.ok(navigated.includes(`data-initial-focus="${collectedItem._id}"`));
    }
    if (gallery.artist && gallery.artistWorks.length) {
      assert.ok(previewArtistWork);
      previewArtistWork(artistPreview);
      const previewed = render();
      const displayedId = gallery.items.find(item => item.artwork_id === work._id)!._id;
      assert.ok(previewed.includes(`data-initial-preview="${displayedId}"`));
      assert.ok(previewed.includes(`data-initial-focus="${displayedId}"`));
    }
    if (typeof cleanup === "function") cleanup();
  }
});

test("the discreet gallery link copies the public URL and offers a link if clipboard access fails", async () => {
  const states: unknown[] = [];
  let stateIndex = 0;
  let clipboardUrl = "";
  let failCopy = false;
  const shareButton = await load<typeof import("../components/gallery-share-button.tsx")>("../components/gallery-share-button.tsx", {
    react: {
      ...React,
      useState: (initial: unknown) => {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (value: unknown) => { states[index] = value; }];
      },
      useEffect: () => {},
      useRef: () => ({ current: null }),
    },
  }, {
    window: { location: { origin: "https://gallery.example" } },
    navigator: { clipboard: { writeText: async (value: string) => {
      if (failCopy) throw new Error("Clipboard permission denied");
      clipboardUrl = value;
    } } },
  });
  type Element = React.ReactElement<Record<string, unknown>>;
  function elements(node: React.ReactNode): Element[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement<Record<string, unknown>>(node)) return [];
    return [node, ...elements(node.props.children as React.ReactNode)];
  }
  const render = () => {
    stateIndex = 0;
    return shareButton.default({ playerId: "owner / id" });
  };
  for (const denied of [false, true, false]) {
    failCopy = denied;
    const button = elements(render()).find(element => element.props["aria-label"] === "Copy gallery link");
    assert.ok(button);
    await (button.props.onClick as () => Promise<void>)();
    const html = renderToStaticMarkup(render());
    if (denied) {
      assert.match(html, /role="alert"/);
      assert.match(html, /href="\/gallery\/owner%20%2F%20id"/);
      assert.doesNotMatch(html, /fa-check|Gallery link copied/);
    } else {
      assert.equal(clipboardUrl, "https://gallery.example/gallery/owner%20%2F%20id");
      assert.match(html, /fa-check/);
      assert.match(html, /role="status">Gallery link copied\./);
      assert.doesNotMatch(html, /role="alert"/);
    }
  }
});

test("chat keeps its scroll position until a previously unseen message arrives", async () => {
  const states: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  let stateIndex = 0;
  let refIndex = 0;
  let effects: Array<() => void | (() => void)> = [];
  const messageList = { scrollHeight: 500, scrollTop: 0 };
  const chat = await load<typeof import("../app/play/galleries/gallery-chat.tsx")>(
    "../app/play/galleries/gallery-chat.tsx",
    {
      react: {
        ...React,
        useCallback: (callback: unknown) => callback,
        useEffect: (effect: () => void | (() => void)) => {
          effects.push(effect);
        },
        useRef: (initial: unknown) => {
          const index = refIndex++;
          if (!(index in refs)) {
            refs[index] = {
              current: index === 0 ? messageList : initial,
            };
          }
          return refs[index];
        },
        useState: (initial: unknown) => {
          const index = stateIndex++;
          if (!(index in states)) states[index] = initial;
          return [
            states[index],
            (next: unknown) => {
              states[index] = typeof next === "function"
                ? (next as (current: unknown) => unknown)(states[index])
                : next;
            },
          ];
        },
      },
      "@/components/artwork-thumbnail": { default: () => null },
      "@/components/floating-popover": { FloatingPopover: () => null },
      "@/components/community-emotes": {
        COMMUNITY_EMOTE_DETAILS: {},
        CommunityReactionPicker: () => null,
        CommunityEmoteSymbol: () => null,
      },
      "@/server/gallery-chat-core": { ARTFUNKEL_SYSTEM_AUTHOR_ID: "artfunkel-system" },
    },
  );
  const createMessage = (id: string, content: string): GalleryChatMessageView => ({
    id,
    galleryOwnerId: "gallery",
    authorId: "other-player",
    authorName: "Other Player",
    content,
    createdAt: "2026-11-09T12:00:00.000Z",
    editedAt: null,
    reactions: {} as GalleryChatMessageView["reactions"],
    reportedByViewer: false,
    tokens: [{ kind: "text", text: content }],
  });
  function render(messages: GalleryChatMessageView[]) {
    states[0] = messages;
    stateIndex = 0;
    refIndex = 0;
    effects = [];
    chat.default({ galleryOwnerId: "gallery", viewerId: "viewer" });
    effects[1]();
  }

  const first = createMessage("first", "First");
  const second = createMessage("second", "Second");
  render([]);
  assert.equal(messageList.scrollTop, 0);
  render([first, second]);
  assert.equal(messageList.scrollTop, 500);

  messageList.scrollTop = 120;
  messageList.scrollHeight = 620;
  render([{ ...first }, { ...second }]);
  assert.equal(messageList.scrollTop, 120, "Polling the same messages preserves the user's position");
  render([first, { ...second, content: "Edited", editedAt: "2026-11-09T12:05:00.000Z" }]);
  assert.equal(messageList.scrollTop, 120, "Editing an existing message does not scroll");

  const third = createMessage("third", "New message");
  messageList.scrollHeight = 740;
  render([first, second, third]);
  assert.equal(messageList.scrollTop, 740, "A new message scrolls to the latest chat");

  messageList.scrollTop = 80;
  render([first, second]);
  assert.equal(messageList.scrollTop, 80, "Deleting a message does not scroll");
});

test("visited galleries reuse Home's featured works with owner rates, rarity squares, selectable works, and auctions underneath", async () => {
  let selectedId = "";
  let scrolled = false;
  const exhibition = await load<typeof import("../components/gallery-exhibition.tsx")>("../components/gallery-exhibition.tsx", {
    react: {
      ...React, useEffect: () => {}, useState: (initial: unknown) => [initial, () => {}],
      useRef: () => ({ current: { querySelector: () => ({ scrollIntoView: () => { scrolled = true; } }) } }),
    },
    "@/components/artist-gallery": {}, "@/components/community-emotes": {},
    "@/components/item-cards/item-card": { default: () => null },
    "@/components/item-thumbnail": { default: () => null },
    "@/components/public-gallery": { default: () => null },
  });
  const artwork: Artwork = {
    _id: "featured-work", artist_id: "artist", artist: "Artist", title: "Featured Artwork", date: 2026,
    rarity: "rare", genre: "Abstract", medium: "Oil", value_scale: 0.5, width: 80, height: 100, active: true,
  };
  const featured = { ...createArtistArtworkPreview(artwork), _id: "featured-item", owner: "unknown" };
  const permanent = { ...featured, _id: "permanent", permanent: true, status: "claimed" };
  const auctionItem = { ...featured, _id: "auction-item", artwork: { ...artwork, title: "Auction Artwork" } };
  const auction = {
    _id: "auction", item: auctionItem, current_bid: 250, buy_now: 500, questTarget: false, owned: false,
  } as AuctionView;
  const props: React.ComponentProps<typeof exhibition.default> = {
    gallery: {
      galleryId: "gallery", owner: { playerId: "owner", screenName: "Collector", level: 2, vintageLevel: 0 },
      finishes: galleryFinishes.DEFAULT_GALLERY_FINISHES, artist: null, artistWorks: [],
      items: [featured, permanent, createArtistArtworkPreview(artwork)], auctions: [auction], legendaryAttributes: [],
      rates: { moneyPerHour: 125, xpPerHour: 42, value: 15_000 },
      metadata: {
        _id: "gallery", schema_version: 4, active: true, owner_id: "owner", owner: "Collector",
        ...buildGalleryMetadataSnapshot([featured, permanent], 5, new Map([[artwork._id, artwork.rarity]])),
        attributes: [{ id: "collector", title: "Art Collector", icon: "fa-eye", type: "npc",
          count: 1, totalRating: 0.9, effectiveRating: 0.18 }],
        score: 90, reactions: null, updated_at: "2026-11-04",
      },
    },
    viewerId: "visitor", selectedItem: featured, onSelectItem: item => { selectedId = item._id; },
    visitorTypes: [{ id: "collector", name: "Art Collector", icon: "fa-eye" }],
  };
  const tree = exhibition.default(props);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /<header class="home-featured-heading gallery-title"><h2 class="info-panel-title">Collector&#x27;s Gallery<\/h2><button aria-label="Copy gallery link"/);
  assert.doesNotMatch(html, /visited-gallery-metadata-header/);
  for (const text of ["Money per hour", "$125", "XP per hour", "42", "Total featured value", "$15,000",
    "Visitor attraction score", "90", "18% effective attraction", "Auction Artwork"]) assert.ok(html.includes(text), text);
  assert.equal((html.match(/class="home-featured-card"/g) ?? []).length, 1, "Only real displayed works appear in feature cards");
  assert.match(html, /class="gallery-rarity-square" data-rarity="rare"/);
  assert.ok(html.indexOf("Visitor attraction score") < html.indexOf('aria-label="Featured artwork rarities"'));
  assert.ok(html.indexOf('class="home-featured-card"') < html.indexOf('aria-label="Gallery auctions"'));
  assert.doesNotMatch(html, /Your featured works|Empty feature slot|Locked feature slot|unoccupied|data-tutorial-element/);
  type Element = React.ReactElement<Record<string, unknown>>;
  function elements(node: React.ReactNode): Element[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement<Record<string, unknown>>(node)) return [];
    return [node, ...elements(node.props.children as React.ReactNode)];
  }
  const panel = elements(tree).find(element => element.props.className === "visited-gallery-featured-panel")!;
  const card = (panel.props.renderItem as (item: typeof featured) => React.ReactNode)(featured);
  const select = elements(card).find(element => element.type === "button")!;
  (select.props.onClick as () => void)();
  assert.equal(selectedId, featured._id);
  assert.equal(scrolled, true);
  const auctionButton = elements(tree).find(element => element.props["aria-label"] === "Preview auction for Auction Artwork")!;
  (auctionButton.props.onClick as () => void)();
  assert.equal(selectedId, auctionItem._id);
  const anonymousHtml = renderToStaticMarkup(exhibition.default({ ...props, viewerId: null }));
  assert.match(anonymousHtml, /Collector&#x27;s Gallery/);
  assert.match(anonymousHtml, /aria-label="Copy gallery link"/);
  assert.doesNotMatch(anonymousHtml, /visited-gallery-player-panel|home-featured-panel|Gallery auctions|Auction Artwork|Money per hour|Visitor attraction score|gallery-rarity-square/);
});

test("anonymous galleries reuse exhibition controls without visitor interactions, chat, bidding, or gallery navigation", async () => {
  const cameraDistances: (number | undefined)[] = [];
  const visitorScales: (number | undefined)[] = [];
  const cameraHeights: (number | undefined)[] = [];
  const mountingHeights: (number | undefined)[] = [];
  const ambientCounts: (number | undefined)[] = [];
  const view = await load<typeof import("../components/gallery-view.tsx")>("../components/gallery-view.tsx", {
    "next/image": require("next/image"), "./gallery-layout": {
      ...galleryLayout,
      createGalleryLayout: (...args: Parameters<typeof galleryLayout.createGalleryLayout>) => {
        cameraDistances.push(args[2]?.overviewDistanceCm);
        visitorScales.push(args[2]?.visitorScale);
        cameraHeights.push(args[2]?.cameraHeightCm);
        mountingHeights.push(args[2]?.artworkCenterHeightCm);
        return galleryLayout.createGalleryLayout(...args);
      },
    },
    "@/server/gallery-finishes": galleryFinishes, "@/server/artwork-image-url": imageUrls,
  });
  const publicGallery = await load<typeof import("../components/public-gallery.tsx")>("../components/public-gallery.tsx", {
    "./gallery-view": { default: (props: Parameters<typeof view.default>[0]) => {
      ambientCounts.push(props.ambientVisitorCount);
      assert.equal(props.visitors, undefined, "Public link scenes never receive quality-colored NPCs");
      assert.equal(props.onMeetVisitor, undefined);
      return React.createElement(view.default, props);
    } },
    "./item-cards/selection": {},
    "./item-cards/standard-item-dialog": {},
  });
  const card = { default: ({ item }: { item: ReturnType<typeof createArtistArtworkPreview> }) =>
    React.createElement("article", { "data-preview": item._id }, item.artwork.title) };
  const artistComponents = await load<typeof import("../components/artist-gallery.tsx")>("../components/artist-gallery.tsx", {
    "./artwork-thumbnail": {}, "./item-cards/item-card": card,
    "@/server/artist-artwork-preview": { createArtistArtworkPreview },
  });
  const exhibition = await load<typeof import("../components/gallery-exhibition.tsx")>("../components/gallery-exhibition.tsx", {
    "@/components/artist-gallery": artistComponents,
    "@/components/community-emotes": {}, "@/components/item-cards/item-card": card,
    "@/components/item-cards/shared": {}, "@/components/item-thumbnail": {},
    "@/components/public-gallery": publicGallery,
  });
  const header = await load<typeof import("../app/play/player-header.tsx")>("../app/play/player-header.tsx", {
    "next/navigation": { useRouter: () => ({}) }, "./notification-center": {},
    "@/components/player-header/player-header": {}, "@/components/supporter-prompt-dialog": {},
  });
  const anonymous = await load<typeof import("../app/gallery/[playerId]/anonymous-gallery-view.tsx")>(
    "../app/gallery/[playerId]/anonymous-gallery-view.tsx", {
      "@/components/gallery-exhibition": exhibition, "../../play/player-header": header,
    });
  const work: Artwork = {
    _id: "public-work", artist_id: "artist-id", artist: "Public Artist", title: "Public Artwork", date: 2026,
    rarity: "common", genre: "Abstract", medium: "Oil", value_scale: 0.5, width: 80, height: 100, active: true,
  };
  const artist: PublicArtistProfile = {
    id: "artist-id", playerId: "gallery-owner", name: "Public Artist", bio: "A public portfolio.",
    featureLink: "https://youtu.be/M7lc1UVf-VE",
    portfolioUrl: "https://portfolio.example.com/", socialLinks: {}, instagramUsername: null, featured: false,
  };
  for (const profile of [artist, null]) {
    const html = renderToStaticMarkup(React.createElement(anonymous.default, { gallery: {
      artist: profile, artistWorks: profile ? [work] : [],
      galleryId: "public-gallery", finishes: galleryFinishes.DEFAULT_GALLERY_FINISHES, overviewDistanceCm: 900, visitorScale: 1.2,
      cameraHeightCm: 185, artworkCenterHeightCm: 170,
      owner: { playerId: "gallery-owner", screenName: "Collector", level: 1, vintageLevel: 0 },
      items: [createArtistArtworkPreview(work)], auctions: [], legendaryAttributes: [], metadata: null, rates: null,
    } }));
    assert.match(html, /Public Artwork/);
    assert.match(html, /Previous painting/);
    assert.match(html, /Next painting/);
    assert.match(html, /Hide visitors/);
    assert.match(html, /Copy gallery link/);
    assert.match(html, /<h1>[^<]+&#x27;s Gallery<\/h1><button aria-label="Copy gallery link" class="gallery-share"/);
    assert.doesNotMatch(html, /Public gallery link|>Copy gallery link<\/button>/);
    assert.doesNotMatch(html, /visited-gallery-player-panel|home-featured-panel|Gallery auctions|Items up for auction|Money per hour|Visitor attraction score|gallery-rarity-square/);
    assert.match(html, /Join artfunkel - create a free account/);
    assert.match(html, /href="\/play\/login\?mode=register"/);
    assert.doesNotMatch(html, /Gallery visitors|gallery-chat|Gallery navigation|Previous gallery|Next gallery|Exit gallery|Return home|Gallery finishes/);
    if (profile) {
      assert.match(html, /src="https:\/\/www.youtube-nocookie.com\/embed\/M7lc1UVf-VE"/);
      assert.doesNotMatch(html, /Featured on YouTube|Load YouTube content/);
      assert.match(html, /A public portfolio\./);
      assert.match(html, /href="https:\/\/portfolio.example.com\/"/);
      assert.match(html, /artist-gallery-showcase/);
    } else assert.match(html, /Collector&#x27;s Gallery/);
  }
  assert.deepEqual(cameraDistances, [900, 900], "Anonymous exhibition settings reach the actual gallery layout");
  assert.deepEqual(visitorScales, [1.2, 1.2], "Anonymous exhibitions apply the configured visitor scale");
  assert.deepEqual(cameraHeights, [185, 185]);
  assert.deepEqual(mountingHeights, [170, 170]);
  assert.deepEqual(ambientCounts, [4, 4], "Artist and player public links both create four default visitors per artwork");
});

test("Hide visitors sits beside Exit gallery and toggles only the scene, not the visitor icon tray", async () => {
  const states: unknown[] = [];
  const refs: { current: unknown }[] = [];
  let stateIndex = 0;
  let refIndex = 0;
  let nullRefs = 0;
  let visibilityEffect: React.EffectCallback | undefined;
  let visitorEffect: React.EffectCallback | undefined;
  const visibility: boolean[] = [];
  const sceneVisitors: unknown[] = [];
  const ambientCounts: number[] = [];
  const controller = {
    setVisitorsVisible: (visible: boolean) => visibility.push(visible),
    setVisitors: (visitors: unknown, ambientCount: number) => {
      sceneVisitors.push(visitors);
      ambientCounts.push(ambientCount);
    },
  };
  const view = await load<typeof import("../components/gallery-view.tsx")>("../components/gallery-view.tsx", {
    "next/image": {}, "./gallery-layout": galleryLayout,
    "@/server/gallery-finishes": galleryFinishes, "@/server/artwork-image-url": imageUrls,
    react: {
      ...React, useCallback: (callback: unknown) => callback, useMemo: (callback: () => unknown) => callback(),
      useState: (initial: unknown) => {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (next: unknown) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
      },
      useRef: (initial: unknown) => {
        const index = refIndex++;
        if (!(index in refs)) refs[index] = { current: initial === null && ++nullRefs === 3 ? controller : initial };
        return refs[index];
      },
      useEffect: (effect: React.EffectCallback, dependencies: unknown[]) => {
        if (dependencies.length === 1 && typeof dependencies[0] === "boolean") visibilityEffect = effect;
        if (dependencies.length === 4 && Array.isArray(dependencies[0])) visitorEffect = effect;
      },
    },
  });
  const publicGallery = await load<typeof import("../components/public-gallery.tsx")>("../components/public-gallery.tsx", {
    "./gallery-view": view, "./item-cards/selection": {}, "./item-cards/standard-item-dialog": {},
    react: { ...React, useState: () => [null, () => {}] },
  });
  const visitorContent = React.createElement("div", { className: "gallery-visitor-tray" },
    React.createElement("button", { "data-npc-id": "real-visitor" }, "Donor"));
  const tree = publicGallery.default({
    items: [], legendaryAttributes: [], owner: { playerId: "owner", screenName: "Owner", level: 1, vintageLevel: 0 },
    viewerId: "viewer", visitorContent, onExitGallery() {}, onGoHome() {},
    visitors: [{ _id: "real-visitor", quality: "gold", alreadyMet: false }], onMeetVisitor() {},
  });
  const window = React.Children.toArray(tree.props.children)[0] as React.ReactElement<{ children: React.ReactNode }>;
  const content = React.Children.toArray(window.props.children);
  const scene = content[0] as React.ReactElement<Parameters<typeof view.default>[0]>;
  type Element = React.ReactElement<{ children?: React.ReactNode; className?: string; onClick?: () => void }>;
  function elements(node: React.ReactNode): Element[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
    return [node, ...elements(node.props.children)];
  }
  for (const hidden of [false, true, false]) {
    stateIndex = refIndex = 0;
    const rendered = view.default(scene.props);
    assert.ok(visibilityEffect);
    visibilityEffect();
    assert.ok(visitorEffect);
    visitorEffect();
    const html = renderToStaticMarkup(React.createElement(React.Fragment, null, rendered, content[1]));
    assert.match(html, /data-npc-id="real-visitor">Donor<\/button>/);
    assert.ok(html.includes(`aria-pressed="${hidden}" class="gallery-navigation-control visitors"`));
    const label = hidden ? "Show visitors" : "Hide visitors";
    assert.ok(html.includes(label));
    assert.ok(html.indexOf("Exit gallery</span>") < html.indexOf(`${label}</span>`));
    assert.ok(html.indexOf(`${label}</span>`) < html.indexOf("Home</span>"));
    const toggle = elements(rendered).find(element => element.props.className === "gallery-navigation-control visitors");
    assert.ok(toggle?.props.onClick);
    toggle.props.onClick();
  }
  assert.deepEqual(visibility, [true, false, true]);
  assert.equal(sceneVisitors.length, 3);
  assert.deepEqual(ambientCounts, [0, 0, 0], "Signed-in gallery crowds remain based on real visitors");
  for (const visitors of sceneVisitors) {
    assert.ok(Array.isArray(visitors));
    assert.deepEqual(Array.from(visitors, visitor => ({ ...visitor })),
      [{ _id: "real-visitor", quality: "gold", alreadyMet: false, disabled: false }]);
  }
  const changes: boolean[] = [];
  for (const visible of [false, true]) {
    stateIndex = refIndex = 0;
    const rendered = view.default({
      ...scene.props, visitorsVisible: visible, onVisitorsVisibleChange: next => changes.push(next),
    });
    visibilityEffect();
    assert.equal(visibility.at(-1), visible, "The stored preference must override local toggle state");
    const toggle = elements(rendered).find(element => element.props.className === "gallery-navigation-control visitors");
    assert.ok(toggle?.props.onClick);
    toggle.props.onClick();
  }
  assert.deepEqual(changes, [true, false]);

  const work: Artwork = {
    _id: "public-work", artist: "Artist", title: "Artwork", date: 2026, rarity: "common",
    genre: "Abstract", medium: "Oil", value_scale: 0.5, width: 80, height: 100, active: true,
  };
  for (const itemCount of [0, 1, 3, 1, 0]) {
    const publicTree = publicGallery.default({
      ...scene.props, items: Array.from({ length: itemCount }, (_, index) => createArtistArtworkPreview({ ...work, _id: `work-${index}` })),
      owner: { playerId: "owner", screenName: "Owner", level: 1, vintageLevel: 0 },
      legendaryAttributes: [], viewerId: null, visitorsVisible: true,
      visitors: [{ _id: "should-not-show", quality: "gold", alreadyMet: false }], onMeetVisitor() {},
    });
    const galleryWindow = React.Children.toArray(publicTree.props.children)[0] as React.ReactElement<{ children: React.ReactNode }>;
    const publicScene = React.Children.toArray(galleryWindow.props.children)[0] as React.ReactElement<Parameters<typeof view.default>[0]>;
    assert.equal(publicScene.props.ambientVisitorCount, itemCount * 4);
    assert.equal(publicScene.props.visitors, undefined);
    assert.equal(publicScene.props.onMeetVisitor, undefined);
    stateIndex = refIndex = 0;
    view.default(publicScene.props);
    visitorEffect();
    visibilityEffect();
    assert.equal(visibility.at(-1), true);
    assert.equal(ambientCounts.at(-1), itemCount * 4, "Changing artwork counts updates the mounted crowd");
    assert.equal((sceneVisitors.at(-1) as unknown[]).length, 0, "Public figures never become interactable NPCs");
  }
});

test("account display preferences show saved visitor visibility and save both checkbox states", async () => {
  const requests: { url: string; settings: unknown }[] = [];
  const refresh = test.mock.fn();
  const account = await load<typeof import("../app/play/account/account-form.tsx")>("../app/play/account/account-form.tsx", {
    "next/navigation": { useRouter: () => ({ refresh }) },
    "./delete-account-section": { default: () => null },
    react: { ...React, useState: (initial: unknown) => [initial, () => {}] },
  }, {
    FormData: class {
      values: Set<string>;
      constructor(values: Set<string>) { this.values = values; }
      has(name: string) { return this.values.has(name); }
    },
    fetch: async (url: string, options: { body: string }) => {
      requests.push({ url, settings: JSON.parse(options.body) });
      return Response.json({ status: "ok" });
    },
  });
  type Element = React.ReactElement<{
    children?: React.ReactNode; name?: string; defaultChecked?: boolean; onSubmit?: (event: unknown) => Promise<void>;
  }>;
  function elements(node: React.ReactNode): Element[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement<Element["props"]>(node)) return [];
    return [node, ...elements(node.props.children)];
  }
  for (const [showGalleryVisitors, enableReveals] of [[true, false], [false, true]] as const) {
    const tree = account.default({
      email: "player@example.test", emailVerified: true, enableReveals, showGalleryVisitors,
      hasPassword: true, oauthMessage: null, providers: [], screenName: "Player",
      patreon: {
        checkedAt: null, configured: false, email: null, emailMatchesPlayer: null, isSupporter: false,
        linked: false, message: null, requiresReauthorization: false, tierAmountCents: null, tierName: null,
      },
    });
    const checkbox = elements(tree).find(element => element.props.name === "showGalleryVisitors");
    assert.ok(checkbox);
    assert.equal(checkbox.props.defaultChecked, showGalleryVisitors);
    const form = elements(tree).find(element =>
      element.type === "form" && elements(element).some(child => child.props.name === "showGalleryVisitors"));
    assert.ok(form?.props.onSubmit);
    const checked = new Set([
      ...(enableReveals ? ["enableReveals"] : []),
      ...(!showGalleryVisitors ? ["showGalleryVisitors"] : []),
    ]);
    await form.props.onSubmit({ preventDefault() {}, currentTarget: checked });
  }
  assert.deepEqual(requests, [
    { url: "/api/play/view-settings", settings: { enableReveals: false, showGalleryVisitors: false } },
    { url: "/api/play/view-settings", settings: { enableReveals: true, showGalleryVisitors: true } },
  ]);
  assert.equal(refresh.mock.callCount(), 2);
});

test("the public gallery Join link opens the existing account form in registration mode", async () => {
  const form = await load<typeof import("../app/play/login/player-login-form.tsx")>("../app/play/login/player-login-form.tsx", {
    "next/navigation": { useRouter: () => ({}) }, "@/server/oauth-providers": oauthProviders,
  });
  const page = await load<typeof import("../app/play/login/page.tsx")>("../app/play/login/page.tsx", {
    "next/navigation": {}, "@/server/session": { getPlayerSession: async () => null },
    "@/server/oauth-player": { isOAuthProviderConfigured: () => true },
    "@/server/oauth-providers": oauthProviders, "./player-login-form": form,
    "@/server/mongodb": {}, "@/server/artist-types": {},
  });
  for (const mode of [undefined, "register"]) {
    const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({ mode }) }));
    assert.equal(html.includes('name="screenName"'), mode === "register");
    assert.equal(html.includes('name="confirmPassword"'), mode === "register");
    for (const provider of ["Google", "Discord"]) assert.match(html, new RegExp(`Continue with ${provider}`));
    assert.match(html, /Sign in through Steam/);
    assert.doesNotMatch(html, /Instagram|Microsoft|\/api\/auth\/player\/(?:instagram|microsoft)/);
  }
});

test("the player account hides Microsoft synchronization while retaining other providers", async () => {
  let providers: Array<{ id: string }> | undefined;
  const page = await load<typeof import("../app/play/account/page.tsx")>("../app/play/account/page.tsx", {
    "@/server/mongodb": {
      getDatabase: async () => ({
        collection: () => ({
          findOne: async () => ({
            _id: "player-1", active: true, email: "player@example.test", screen_name: "Player",
          }),
        }),
      }),
    },
    "@/server/patreon": { isPatreonIntegrationConfigured: () => false },
    "@/server/player-view-settings": {
      getPlayerViewSettings: () => ({ enableReveals: true, showGalleryVisitors: true }),
    },
    "@/server/session": { requirePlayer: async () => ({ playerId: "player-1" }) },
    "@/server/oauth-player": { isOAuthProviderConfigured: () => true },
    "@/server/oauth-providers": oauthProviders,
    "./account-form": {
      default: (props: { providers: Array<{ id: string }> }) => {
        providers = props.providers;
        return null;
      },
    },
  });
  renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
  assert.deepEqual(providers?.map(({ id }) => id), ["google", "discord", "steam", "instagram"]);
});

test("gallery directory cards and rows distinguish contributing artists without changing player-only listings", async () => {
  const noop = () => {};
  const navigations: string[] = [];
  const cards: React.HTMLAttributes<HTMLElement>[] = [];
  const helpButtons: React.ButtonHTMLAttributes<HTMLButtonElement>[] = [];
  const jsxRuntime = require("react/jsx-runtime");
  const captureElement = (type: unknown, props: React.HTMLAttributes<HTMLElement>, key?: string, staticChildren = false) => {
    if (type === "article" && props.className?.startsWith("gallery-explorer-card")) cards.push(props);
    if (type === "button" && props.className === "gallery-attraction-help") {
      helpButtons.push(props as React.ButtonHTMLAttributes<HTMLButtonElement>);
    }
    return jsxRuntime[staticChildren ? "jsxs" : "jsx"](type, props, key);
  };
  const capturedRuntime = {
    ...jsxRuntime, jsx: captureElement,
    jsxs: (type: unknown, props: React.HTMLAttributes<HTMLElement>, key?: string) => captureElement(type, props, key, true),
  };
  const visitorTypes = [
    { id: "collector", name: "Art Collector", icon: "fa-eye" },
    { id: "donor", name: "Art Donor", icon: "fa-share-square" },
  ];
  const ratingColors = { ratingColor: () => "#f00" };
  const chart = await load("../components/gallery-attraction-chart.tsx", {
    "react/jsx-runtime": capturedRuntime,
    "./item-cards/shared": ratingColors,
    "./attribute/attribute": await load("../components/attribute/attribute.tsx", {
      "@/components/item-cards/shared": ratingColors,
    }),
  });
  const crops = [{ x: 40, y: -20, scale: 2 }, { x: -25, y: 30, scale: 1.5 }];
  const baseGallery = {
    schema_version: 4, value: 1000, score: 10, item_count: 2, display_count: 2,
    permanent_count: 0, display_capacity: 2, attributes: [], display_rarities: [],
    featured_item_id: null, featured_artwork_id: null, featured_value: 500,
    reactions: { counts: [], viewerReaction: null }, updated_at: "2026-11-02",
  };
  const data = {
    featuredArtists: [], total: 2, page: 1, pageSize: 12,
    galleries: [
      { ...baseGallery, _id: "artist-gallery", owner_id: "artist-player", owner: "Artist-Player", isArtist: true,
        featured_artwork_id: "feature-crop", featured_artwork: {
          _id: "feature-crop", feature_card_adjustment: crops[0], thumbnail_adjustment: crops[1],
        },
        attributes: [{ id: "collector", title: "Collector", type: "npc", icon: "fa-eye",
          count: 1, totalRating: 0.4, effectiveRating: 0.2 }] },
      { ...baseGallery, _id: "ordinary-gallery", owner_id: "ordinary-player", owner: "Collector", isArtist: false,
        featured_artwork_id: "thumbnail-fallback", featured_artwork: {
          _id: "thumbnail-fallback", thumbnail_adjustment: crops[1],
        },
        attributes: [{ id: "collector", title: "Collector", type: "npc", icon: "fa-eye",
          count: 2, totalRating: 1.6, effectiveRating: 0.8 }] },
    ],
  };
  const explorer = await load<typeof import("../app/play/galleries/gallery-explorer.tsx")>(
    "../app/play/galleries/gallery-explorer.tsx", {
      react: { ...React, useState: (initial: unknown) => React.useState(
        initial !== null && typeof initial === "object" && "galleries" in initial
          ? data : initial === true ? false : initial,
      ) },
      "react/jsx-runtime": capturedRuntime,
      "next/navigation": { useRouter: () => ({ replace: (href: string) => navigations.push(href) }) },
      "@/components/artwork-thumbnail": { default: ({ adjustment, fixedFocalPoint }: { adjustment: unknown; fixedFocalPoint: boolean }) => {
        assert.equal(fixedFocalPoint, true);
        return React.createElement("span", { "data-feature-crop": JSON.stringify(adjustment) });
      } },
      "@/components/item-thumbnail": {},
      "@/components/gallery-attraction-chart": chart,
      "@/components/item-cards/artwork-image-adjustments": imageAdjustments,
      "@/components/community-emotes": { CommunityReactionPicker: () => null },
      "@/components/item-cards/item-card": {}, "@/components/item-cards/shared": ratingColors,
      "@/components/public-gallery": {}, "@/components/gallery-finish-menu": {},
      "@/components/use-gallery-visitors": {}, "@/server/social-battery": {},
      "@/server/npc-gameplay": { NPC_QUALITIES: [] }, "../auctions/auction-house": {},
      "./gallery-chat": {}, "@/components/artist-gallery": { FeaturedArtistGalleries: () => null },
    }, { URLSearchParams },
  );
  for (const initialViewMode of ["grid", "list"] as const) {
    cards.length = 0;
    helpButtons.length = 0;
    const html = renderToStaticMarkup(React.createElement(explorer.default, {
      impersonating: false, initialBankBalance: 0, initialGalleryId: null,
      initialSort: "score", initialViewMode, meetingNpc: null, npcSpawnIntervalMinutes: 5,
      npcSpawnOptions: [], visitorTypes, npcRewardEffects: {}, onMeetNpc: async () => false, onGoHome: noop,
      onViewSettingsChange: noop, socialBattery: 100, viewerId: "viewer",
    }));
    const articles = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)].map(match => match[0]);
    assert.equal(articles.length, 2);
    assert.match(articles[0], /gallery-explorer-artist/);
    assert.match(articles[0], /gallery-artist-badge/);
    assert.match(articles[0], /aria-hidden="true" class="fa fa-paint-brush"/);
    assert.match(articles[0], /Contributing artist/);
    assert.match(articles[0], /@Artist-Player/);
    assert.doesNotMatch(articles[1], /gallery-explorer-artist|gallery-artist-badge|Contributing artist/);
    assert.match(articles[1], /@Collector/);
    for (const [index, article] of articles.entries()) {
      assert.match(article, /\$1,000/);
      if (initialViewMode === "grid") {
        assert.ok(article.includes(`data-feature-crop="${JSON.stringify(crops[index]).replaceAll('"', "&quot;")}"`),
          "Cards reuse the Feature card adjustment, including its thumbnail fallback");
        assert.ok(article.includes(`height:${index === 0 ? 20 : 80}%`), "Each card uses its own gallery's attraction");
        assert.match(article, /Art Donor: 0 works, 0% effective attraction/);
        assert.doesNotMatch(article, /gallery-attraction-label|gallery-attraction-help/);
        assert.match(article, /<figure aria-label="Effective attraction"/);
      } else {
        assert.doesNotMatch(article, /gallery-attraction-chart|data-feature-crop/);
      }
    }
    if (initialViewMode === "grid") {
      const currentTarget = {} as HTMLElement;
      const event = (target: HTMLElement, key: string) => ({
        currentTarget, target, key, preventDefault: noop,
      }) as React.KeyboardEvent<HTMLElement>;
      for (const key of ["Enter", " "]) cards[0].onKeyDown!(event({} as HTMLElement, key));
      assert.equal(navigations.length, 0, "Exploring chart controls must not open the gallery");
      for (const key of ["Enter", " "]) cards[0].onKeyDown!(event(currentTarget, key));
      assert.deepEqual(navigations, [
        "/play?gallery=artist-player", "/play?gallery=artist-player",
      ], "The card itself still opens with Enter and Space");
      assert.equal(helpButtons.length, 0, "Directory cards omit chart help without hiding the graph");
    }
  }
});

test("featured artist cards keep their links while synced Instagram profiles embed without extra text or controls", async () => {
  const thumbnails: Parameters<typeof import("../components/artwork-thumbnail.tsx").default>[0][] = [];
  const gallery = await load<typeof import("../components/artist-gallery.tsx")>("../components/artist-gallery.tsx", {
    "./artwork-thumbnail": { default: (props: (typeof thumbnails)[number]) => {
      thumbnails.push(props);
      return React.createElement("span", { "data-thumbnail": props.alt });
    } },
    "./item-cards/item-card": { default: ({ item }: { item: ReturnType<typeof createArtistArtworkPreview> }) =>
      React.createElement("article", { "data-preview": item._id }, item.artwork.title) },
    "@/server/artist-artwork-preview": { createArtistArtworkPreview },
  });
  const artist: FeaturedArtistGallery = {
    id: "artist-id", playerId: "artist-player", name: "Test Artist", bio: "The artist's biography.",
    featureLink: "",
    portfolioUrl: "https://portfolio.example.com/", socialLinks: { bluesky: "https://bsky.app/profile/test.example" },
    instagramUsername: "test.artist", featured: true, thumbnail: {
      _id: "rarest-work", title: "Rarest work",
      feature_card_adjustment: { x: -45, y: 60, scale: 1.8 },
      thumbnail_adjustment: { x: 30, y: -70, scale: 1.2 },
    },
  };
  const artists: FeaturedArtistGallery[] = [
    artist,
    { ...artist, id: "another-artist", playerId: "another-player", name: "Another Artist", thumbnail: null },
    { ...artist, id: "legacy-artist", playerId: "legacy-player", name: "Legacy Artist", thumbnail: {
      _id: "legacy-work", title: "Legacy work", thumbnail_adjustment: { x: 25, y: -30, scale: 1.5 },
    } },
  ];
  const visited: string[] = [];
  const props = { artists, onVisit: (playerId: string) => visited.push(playerId) };
  const cards = renderToStaticMarkup(React.createElement(gallery.FeaturedArtistGalleries, props));
  assert.equal(thumbnails.length, 2);
  for (const [index, thumbnail] of thumbnails.entries()) {
    assert.equal(thumbnail.fixedFocalPoint, true);
    assert.equal(thumbnail.variant, "card");
    assert.deepEqual(thumbnail.adjustment, index === 0
      ? artist.thumbnail!.feature_card_adjustment
      : artists[2].thumbnail!.thumbnail_adjustment);
  }
  assert.match(cards, /aria-label="Visit gallery: Test Artist"/);
  assert.match(cards, /Rarest work by Test Artist/);
  assert.match(cards, /href="https:\/\/portfolio.example.com\/"/);
  assert.match(cards, /href="https:\/\/www.instagram.com\/test.artist\/"/);
  assert.doesNotMatch(cards, /Gallery value|Gallery score|Shared works|Visitor attraction score/);
  assert.doesNotMatch(cards, /fa-arrow-right/);
  for (const [card] of cards.matchAll(/<article class="featured-artist-card"[\s\S]*?<\/article>/g)) {
    const firstAction = card.match(/<(button|a)\b[^>]*>[\s\S]*?<\/\1>/)?.[0];
    assert.ok(firstAction);
    assert.match(firstAction, /^<button[^>]*>Visit gallery<\/button>$/);
  }
  const section = gallery.FeaturedArtistGalleries(props)!;
  const grid = React.Children.toArray(section.props.children)[1] as React.ReactElement<{ children: React.ReactNode }>;
  for (const child of React.Children.toArray(grid.props.children)) {
    const article = child as React.ReactElement<{ children: React.ReactNode }>;
    const social = React.Children.toArray(article.props.children).find(element =>
      React.isValidElement(element) && element.type === gallery.ArtistSocialLinks) as
      React.ReactElement<Parameters<typeof gallery.ArtistSocialLinks>[0]>;
    const navigation = gallery.ArtistSocialLinks(social.props);
    const button = React.Children.toArray(navigation.props.children)[0] as React.ReactElement<{ onClick: () => void }>;
    assert.equal(button.type, "button");
    button.props.onClick();
  }
  assert.deepEqual(visited, artists.map(entry => entry.playerId));
  const work: Artwork = {
    _id: "work", artist_id: artist.id, artist: artist.name, title: "Active artwork", date: 2026,
    rarity: "rare", genre: "Abstract", medium: "Oil", value_scale: 0.5, width: 80, height: 100, active: true,
  };
  const showcase = renderToStaticMarkup(React.createElement(gallery.ArtistGalleryShowcase, {
    artist, works: [work], legendaryAttributes: [], onPreview() {}, viewerId: "viewer",
  }));
  const introduction = renderToStaticMarkup(React.createElement(gallery.ArtistGalleryIntroduction, { artist }));
  assert.match(introduction, /The artist&#x27;s biography/);
  assert.match(introduction, /href="https:\/\/portfolio.example.com\/"/);
  assert.match(introduction, /href="https:\/\/www.instagram.com\/test.artist\/"/);
  assert.doesNotMatch(showcase, /artist-gallery-introduction|artist-bio|artist-social-links/);
  assert.match(showcase, /data-preview="artist-preview:work"/);
  assert.match(showcase, /<iframe[^>]*src="https:\/\/www.instagram.com\/test.artist\/embed\/"/);
  const instagram = showcase.slice(showcase.indexOf('<section class="artist-instagram">'));
  assert.doesNotMatch(instagram, /<h3|<p|<a\b|<button|loading="lazy"/);
  assert.doesNotMatch(JSON.stringify(createArtistArtworkPreview(work)), /"owner":"viewer"/);
});

test("artist feature content embeds immediately without labels, descriptions, links or load buttons", async () => {
  const cases = [
    ["https://youtu.be/M7lc1UVf-VE", "YouTube"],
    ["https://vimeo.com/76979871", "Vimeo"],
    ["https://www.instagram.com/test.artist/", "Instagram"],
    ["https://www.twitch.tv/artist", "Twitch"],
    ["https://www.facebook.com/ArtistPage", "Facebook"],
    ["https://www.tiktok.com/@artist/video/6718335390845095173", "TikTok"],
    ["https://open.spotify.com/track/0123456789abcdefghijkl", "Spotify"],
    ["https://soundcloud.com/artist/track", "SoundCloud"],
  ];
  for (const [link, provider] of cases) {
    const component = await load<typeof import("../components/artist-feature.tsx")>("../components/artist-feature.tsx", {
      react: {
        ...React, useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => string) => getSnapshot(),
        useRef: () => ({ current: null }), useState: () => [280, () => {}], useEffect: () => {},
      },
    }, { window: { location: { hostname: "artfunkel.example" } } });
    const html = renderToStaticMarkup(component.default({ link, artistName: "Test Artist" }));
    assert.match(html, /<iframe[^>]*src="https:\/\//);
    assert.match(html, /referrerPolicy="strict-origin-when-cross-origin"/);
    assert.doesNotMatch(html, /<h[1-6]|<p\b|<a\b|<button|loading="lazy"/);
    const src = new URL(html.match(/src="([^"]+)"/)![1].replaceAll("&amp;", "&"));
    if (provider === "Twitch") assert.equal(src.searchParams.get("parent"), "artfunkel.example");
    if (provider === "Facebook") assert.equal(src.searchParams.get("width"), "280");
    if (provider === "YouTube") assert.equal(src.hostname, "www.youtube-nocookie.com");
  }
  const component = await load<typeof import("../components/artist-feature.tsx")>("../components/artist-feature.tsx");
  for (const link of ["https://portfolio.example.com/feature", "javascript:alert(1)", ""]) {
    assert.equal(renderToStaticMarkup(React.createElement(component.default, { link, artistName: "Test Artist" })), "");
  }
});

test("Facebook embeds load automatically after measuring their container and stay responsive", async () => {
  let width: number | null = null;
  let effect: React.EffectCallback | undefined;
  let resize: ((entries: { contentRect: { width: number } }[]) => void) | undefined;
  let disconnected = false;
  const container = {};
  const component = await load<typeof import("../components/artist-feature.tsx")>("../components/artist-feature.tsx", {
    react: {
      ...React, useSyncExternalStore: () => "artfunkel.example", useRef: () => ({ current: container }),
      useState: () => [width, (value: number) => { width = value; }],
      useEffect: (callback: React.EffectCallback) => { effect = callback; },
    },
  }, {
    ResizeObserver: class {
      constructor(callback: typeof resize) { resize = callback; }
      observe(node: unknown) { assert.equal(node, container); }
      disconnect() { disconnected = true; }
    },
  });
  const props = { link: "https://www.facebook.com/ArtistPage", artistName: "Test Artist" };
  assert.doesNotMatch(renderToStaticMarkup(component.default(props)), /src="/);
  assert.ok(effect);
  const cleanup = effect();
  assert.ok(resize);
  for (const measuredWidth of [280, 220, 600]) {
    resize([{ contentRect: { width: measuredWidth } }]);
    const html = renderToStaticMarkup(component.default(props));
    assert.ok(html.includes(`width=${Math.min(500, measuredWidth)}`));
    assert.doesNotMatch(html, /<button/);
  }
  if (typeof cleanup === "function") cleanup();
  assert.equal(disconnected, true);
});

test("the artist portal saves and removes the feature link through the profile API", async () => {
  let sent: Record<string, unknown> | undefined;
  const workspace = await load<typeof import("../app/artist/artist-workspace.tsx")>("../app/artist/artist-workspace.tsx", {
    "@/components/artwork-editor/artwork-editor-panel": { default: () => null },
    "@/server/artist-types": {},
    react: { ...React, useState: (value: unknown) => [value, () => {}] },
  }, {
    FormData: class {
      values: Record<string, string>;
      constructor(values: Record<string, string>) { this.values = values; }
      get(name: string) { return this.values[name] ?? ""; }
    },
    fetch: async (url: string, request: { body: string }) => {
      assert.equal(url, "/api/artist/profile");
      sent = JSON.parse(request.body);
      return { ok: true, json: async () => ({ status: "ok" }) };
    },
  });
  const artist: PublicArtistProfile = {
    id: "artist", playerId: "player", name: "Test Artist", bio: "Bio",
    portfolioUrl: "https://portfolio.example.com/", featureLink: "https://youtu.be/M7lc1UVf-VE",
    socialLinks: {}, instagramUsername: null, featured: false,
  };
  const tree = workspace.default({ artist, initialWorks: [], rendererOptions: [] });
  const profile = React.Children.toArray(tree.props.children)[1] as React.ReactElement<{ artist: PublicArtistProfile }>;
  const profileComponent = profile.type as (props: typeof profile.props) => React.ReactElement<{ children: React.ReactNode }>;
  const section = profileComponent(profile.props);
  const form = React.Children.toArray(section.props.children).find(child =>
    React.isValidElement(child) && child.type === "form") as React.ReactElement<{ onSubmit: (event: unknown) => Promise<void> }>;
  const html = renderToStaticMarkup(section);
  assert.match(html, /name="featureLink"/);
  assert.ok(html.includes(`value="${artist.featureLink}"`));
  for (const featureLink of ["https://vimeo.com/76979871", ""]) {
    await form.props.onSubmit({ preventDefault() {}, currentTarget: {
      featureLink, portfolioUrl: artist.portfolioUrl, bio: artist.bio,
    } });
    assert.equal(sent?.featureLink, featureLink);
    assert.equal(sent?.portfolioUrl, artist.portfolioUrl);
  }
});
