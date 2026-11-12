import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test, { type TestContext } from "node:test";
import { runInNewContext as runInVm } from "node:vm";
import ts from "typescript";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { getArtworkFeatureCardAdjustment } from "../../components/item-cards/artwork-image-adjustments.ts";
import { getDailyCrateItemCount } from "../../server/daily-crate.ts";
import { getVisitorSocialBatteryCost } from "../../server/social-battery.ts";
import type { HydratedGameItem } from "../../server/item-artwork.ts";
import { getArtworkImageUrl } from "../../server/artwork-image-url.ts";
import { getBulkAcquisitionRequirements, selectBulkPurchaseItems } from "../../server/bulk-acquisition.ts";
import { getArchiveArtStyle, getArchiveCategories } from "../../server/archive-gameplay.ts";
import { DROPPABLE_CARD_RENDERER_IDS } from "../../components/item-cards/catalog.ts";
import { DEFAULT_PLAYER_VIEW_SETTINGS } from "../../server/player-view-settings.ts";
import { getBulkItemProtection, isBulkLootCandidate, type BulkSaleProtections } from "../../server/bulk-sale.ts";
import { getRemainingOfferSelection } from "../../server/collection-inventory.ts";
import { planGallerySelection } from "../../server/gallery-selection.ts";
import { TutorialElement } from "../../shared/tutorial.ts";
import {
  FEATURE_ARTWORK_DESCRIPTION,
  getArchivePermission,
  getDisplayPermission,
  getItemDisposalPermission,
} from "../../server/item-permissions.ts";
import { getUnfulfilledHistorianTargetIds } from "../../server/art-historian-gameplay.ts";
import {
  DEFAULT_OFFER_REVEAL_THRESHOLDS,
  canQuickSellItem,
  getOfferRevealTier,
  isOfferRevealed,
  isRevealedForBulkAction,
} from "../../server/offer-reveal.ts";

const sharedSource = ts.createSourceFile("shared.tsx",
  await readFile(new URL("../../components/item-cards/shared.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const activeEffectSource = sharedSource.statements.find(statement =>
  ts.isFunctionDeclaration(statement) && statement.name?.text === "getActiveLegendaryAttribute",
)!;
const getActiveLegendaryAttribute = runInVm(`${ts.transpileModule(activeEffectSource.getText(sharedSource), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText}\ngetActiveLegendaryAttribute`, { exports: {} });
const featuredContentSource = ts.createSourceFile("featured-work-content.tsx",
  await readFile(new URL("../../components/featured-work-content.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const featuredContentFunction = featuredContentSource.statements.find(ts.isFunctionDeclaration)!;
const FeaturedWorkContent = runInVm(`${ts.transpileModule(featuredContentFunction.getText(featuredContentSource), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText}\nFeaturedWorkContent`, {
  exports: {}, React, ArtworkThumbnail: () => null, getArtworkFeatureCardAdjustment,
});

function runInNewContext(code: string, context: Record<string, unknown>) {
  context.getItemDisposalPermission = getItemDisposalPermission;
  context.FEATURE_ARTWORK_DESCRIPTION = FEATURE_ARTWORK_DESCRIPTION;
  context.getActiveLegendaryAttribute = getActiveLegendaryAttribute;
  context.FeaturedWorkContent = FeaturedWorkContent;
  context.TutorialElement = TutorialElement;
  context.updateTutorial ??= () => {};
  context.fulfillTutorial ??= async () => {};
  context.showTutorial ??= () => false;
  context.inventory ??= [];
  context.selectedCollectionItemIdsSet ??= new Set<string>();
  context.viewSettingsSaveQueue ??= { current: Promise.resolve() };
  context.DEFAULT_OFFER_REVEAL_THRESHOLDS = DEFAULT_OFFER_REVEAL_THRESHOLDS;
  context.isRevealedForBulkAction = isRevealedForBulkAction;
  context.getBulkItemProtection = getBulkItemProtection;
  context.offerRevealThresholds ??= DEFAULT_OFFER_REVEAL_THRESHOLDS;
  context.revealedOfferIds ??= new Set();
  return runInVm(code, context);
}

// Execute the actual dashboard handlers without mounting unrelated browser-only sections.
const source = ts.createSourceFile(
  "game-dashboard.tsx",
  await readFile(new URL("./game-dashboard.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const dashboard = source.statements.find(
  (statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === "GameDashboard",
)!;
const handlerNames = new Set([
  "act",
  "offerIsRevealed",
  "clearOfferRevealTransitions",
  "revealOffer",
  "revealOffers",
  "requestOfferReveal",
  "revealQueuedOffers",
  "revealSelectedOffers",
  "confirmOfferReveal",
  "saveViewSettings",
  "lootItemActions",
  "collectionItemActions",
  "collectionGalleryAction",
  "lootPrimaryAction",
  "archiveAction",
  "requestItemRemoval",
  "requestPurchaseDonation",
  "historianSubmissionDisabledReason",
  "renderLootThumbnail",
  "renderFeaturedWork",
  "visitOwnGallery",
  "toggleCollectionItemSelection",
  "updateCollectionItemSelection",
  "performLootBulkAction",
  "performCollectionBulkAction",
  "purchaseAndDonateAllLoot",
  "archiveAllLoot",
  "changeBulkKeptArtStyles",
  "meetNpc",
]);
const handlers = ts.transpileModule(
  [...dashboard.body!.statements.filter(
    (statement) => ts.isFunctionDeclaration(statement) && handlerNames.has(statement.name!.text),
  ), ...source.statements.filter(
    (statement) => ts.isFunctionDeclaration(statement) &&
      ["ItemActionButton", "AuthenticityActions", "CollectionBulkActionsPanel", "getLootBulkState", "getCollectionBulkState", "assignHistorianQuests"].includes(statement.name?.text ?? ""),
  )].map((statement) => statement.getText(source)).join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } },
).outputText;

test("visitor meetings use the server's charged battery cost, including featured-gallery discounts and free tutorial meetings", async () => {
  for (const [ownerId, cost, ok, hasInteraction] of [
    ["player", 6, true, false],
    ["featured-artist", 6, true, false],
    ["other-player", 12, true, false],
    ["player", 0, true, true],
    ["featured-artist", 6, false, false],
  ] as const) {
    let battery = 6_000;
    const refresh = test.mock.fn();
    const meet = runInNewContext(`${handlers}\nmeetNpc`, {
      playerId: "player", getVisitorSocialBatteryCost,
      setMeetingNpc() {}, setNotice() {}, setError() {},
      setSocialBattery: (update: (value: number) => number) => { battery = update(battery); },
      fetch: async () => Response.json(ok
        ? {
            status: "ok",
            socialBatteryCost: cost,
            ...(hasInteraction ? { interaction: { type: "test-result" } } : {}),
          }
        : { error: "Visitor unavailable" }, { status: ok ? 200 : 409 }),
      router: { refresh },
    }) as (npc: { _id: string; owner_id: string; quality: string; tutorial?: true }) => Promise<boolean>;
    assert.equal(await meet({
      _id: "visitor", owner_id: ownerId, quality: "bronze", ...(cost === 0 ? { tutorial: true } : {}),
    }), ok);
    assert.equal(battery, ok ? 6_000 - cost : 6_000);
    assert.equal(refresh.mock.callCount(), ok && hasInteraction ? 1 : 0);
  }
});

test("visitor buttons retain their icon, type and actual stamina cost at home, in other galleries and in featured exhibitions", async () => {
  const explorerSource = ts.createSourceFile("gallery-explorer.tsx",
    await readFile(new URL("./galleries/gallery-explorer.tsx", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  for (const [file, listName] of [[source, "galleryVisitors"], [explorerSource, "visitors"]] as const) {
    let visitorMap: ts.CallExpression | undefined;
    function findVisitorMap(node: ts.Node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "map" && node.expression.expression.getText(file) === listName &&
          node.getText(file).includes("data-npc-id")) {
        visitorMap = node;
      }
      ts.forEachChild(node, findVisitorMap);
    }
    findVisitorMap(file);
    assert.ok(visitorMap);
    const code = ts.transpileModule(`const render = () => (${visitorMap.getText(file)}); render()`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
    }).outputText;
    const visitors = [
      ...(["bronze", "silver", "gold", "platinum"] as const).map(quality => ({
        _id: quality, quality, npc_name: `${quality} visitor`, icon: "fa-user", alreadyMet: false,
      })),
      { _id: "tutorial", quality: "platinum" as const, npc_name: "Tutorial visitor", icon: "fa-user", tutorial: true, alreadyMet: false },
      { _id: "met", quality: "gold" as const, npc_name: "Met visitor", icon: "fa-user", alreadyMet: true },
    ];
    for (const [ownerId, featured] of [["player", false], ["other", false], ["artist", true]] as const) {
      for (const [pending, meetingNpc] of [[false, null], [false, "tutorial"], [true, null]] as const) {
        const discounted = listName === "galleryVisitors" || ownerId === "player" || featured;
        const rendered = runInNewContext(code, {
          React, getVisitorSocialBatteryCost, galleryVisitors: visitors, visitors, ownerId, viewerId: "player",
          gallery: { artist: { featured } }, socialBattery: 7, pending, meetingNpc,
          npcRewardEffects: {}, ART_DONOR_ATTRIBUTE_ID: "donor",
        }) as React.ReactNode;
        const html = renderToStaticMarkup(React.createElement(React.Fragment, null, rendered));
        for (const npc of visitors) {
          const cost = npc._id === "tutorial" ? 0 : getVisitorSocialBatteryCost(npc.quality, discounted);
          const button = html.match(new RegExp(`<button\\b[^>]*data-npc-id="${npc._id}"[^>]*>[\\s\\S]*?</button>`))?.[0];
          assert.ok(button, `${listName}: ${npc._id}`);
          assert.match(button, new RegExp(`^<button\\b[^>]*><i aria-hidden="true" class="fa ${npc.icon}"></i>`), "Visitor icons are direct children, without an inner wrapper");
          assert.ok(button.includes(`<span class="gallery-npc-type">${npc.npc_name}</span>`));
          assert.ok(button.includes(`aria-label="Costs ${cost} social battery"`));
          assert.ok(button.includes(`<i aria-hidden="true" class="fa fa-bolt"></i>${cost}</small>`));
          assert.equal(button.includes('disabled=""'), npc.alreadyMet || cost > 7 || meetingNpc !== null || (pending && listName === "galleryVisitors"));
          assert.equal(button.includes('aria-busy="true"'), meetingNpc === npc._id, "Only the visitor being met is busy");
          assert.equal(/\bclass="gallery-npc [^"]*\bdisabled\b/.test(button), npc.alreadyMet || cost > 7, "Request locks must not use the dimmed unavailable state");
          assert.equal(
            /\bgallery-benefit\b/.test(button),
            discounted,
            "Only own-gallery and featured-gallery visitors receive the foil treatment",
          );
        }
      }
    }
  }
  const globalCss = await readFile(
    new URL("../globals.css", import.meta.url),
    "utf8",
  );
  assert.match(
    globalCss,
    /\.gallery-npc\.gallery-benefit::before \{[^}]*animation: gallery-npc-foil-shimmer/s,
  );
});

test("scene and tray visitor meetings share stamina guards, met updates, failure handling and duplicate-request protection", async () => {
  const explorerSource = ts.createSourceFile("gallery-explorer.tsx",
    await readFile(new URL("./galleries/gallery-explorer.tsx", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  for (const [file, home, name, guard] of [
    [source, true, "meetGalleryVisitor", "galleryVisitorDisabled"],
    [explorerSource, false, "meetVisitor", "visitorDisabled"],
  ] as const) {
    const functions: string[] = [];
    function collect(node: ts.Node) {
      if (ts.isFunctionDeclaration(node) && [name, guard].includes(node.name?.text ?? "")) {
        functions.push(node.getText(file));
      }
      ts.forEachChild(node, collect);
    }
    collect(file);
    const code = ts.transpileModule(`${functions.join("\n")}\n${name}`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    for (const scenario of [
      { battery: 10, featured: true },
      { battery: 10, featured: false, blocked: !home },
      { battery: 9, featured: true, blocked: true },
      { battery: 20, met: true, blocked: true },
      { battery: 20, meeting: true, blocked: true },
      { battery: 20, pending: true, blocked: home },
      { battery: 20, rewards: true, blocked: true },
      { battery: 0, tutorial: true },
      { battery: 20, failed: true },
      { battery: 0, tutorial: true, failed: true },
    ]) {
      const npc = { _id: "visitor", quality: "gold", alreadyMet: Boolean(scenario.met), tutorial: scenario.tutorial };
      let finish: ((success: boolean) => void) | undefined;
      const backend = test.mock.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
      const mark = test.mock.fn();
      const remove = test.mock.fn();
      const refresh = test.mock.fn();
      const meet = runInNewContext(code, {
        galleryVisitors: [npc], visitors: [npc], pending: Boolean(scenario.pending), meetingNpc: scenario.meeting ? "another" : null,
        socialBattery: scenario.battery, npcRewardEffects: scenario.rewards ? { visitor: true } : {},
        gallery: { artist: { featured: scenario.featured } }, ownerId: "other", viewerId: "player",
        meetingGalleryVisitor: { current: false }, meetingVisitor: { current: false },
        getVisitorSocialBatteryCost, meetNpc: backend, onMeetNpc: backend,
        markVisitorMet: mark, removeVisitor: remove, refreshVisitors: refresh,
      }) as (id: string) => Promise<void>;
      await meet("missing");
      const request = meet(npc._id);
      await meet(npc._id);
      assert.equal(backend.mock.callCount(), scenario.blocked ? 0 : 1, `${name}: ${JSON.stringify(scenario)}`);
      finish?.(!scenario.failed);
      await request;
      assert.equal(mark.mock.callCount(), scenario.blocked || scenario.failed ? 0 : 1);
      assert.equal(remove.mock.callCount(), !scenario.blocked && scenario.failed && !scenario.tutorial ? 1 : 0);
      assert.equal(refresh.mock.callCount(), !scenario.blocked && scenario.failed ? 1 : 0);
    }
  }
});

test("the daily crate card and opening action show the first-drop count and switch to the normal count after claiming", () => {
  const stateSource = dashboard.body!.statements.filter(statement =>
    ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration =>
      ts.isIdentifier(declaration.name) && ["dailyCrateState", "dailyCrateItemCount"].includes(declaration.name.text),
    ),
  ).map(statement => statement.getText(source)).join("\n");
  let dailyButton: ts.JsxElement | undefined;
  function findButton(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "button" &&
        node.openingElement.attributes.properties.some(attribute =>
          ts.isJsxAttribute(attribute) && attribute.name.text === "data-tutorial-element" &&
          attribute.initializer?.getText(source).includes("TUTORIAL_DAILY_CRATE"))) dailyButton = node;
    ts.forEachChild(node, findButton);
  }
  findButton(dashboard);
  assert.ok(dailyButton);
  const code = ts.transpileModule(`${stateSource}\nconst render = () => (${dailyButton.getText(source)}); render()`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const claimedAt = "2026-11-04T12:00:00.000Z";
  for (const [lastClaimedAt, update, normal, expected] of [
    [null, null, 50, 8], [null, null, 20, 8], [claimedAt, null, 50, 50],
    [null, claimedAt, 50, 50], [claimedAt, null, 20, 20],
  ] as const) {
    let openedCount: number | undefined;
    const button = runInNewContext(code, {
      React, getDailyCrateItemCount, dailyDropCount: normal,
      player: { dailyCrate: { timeZone: "UTC", lastClaimedAt } },
      dailyCrateUpdate: update ? { timeZone: "UTC", lastClaimedAt: update } : null,
      crateOpening: null, pending: false, dropReady: true, CrateCardContent: () => null,
      openCrate: (crate: { itemCount: number }) => { openedCount = crate.itemCount; },
    }) as React.ReactElement<{ onClick: () => void; children: React.ReactElement<{ itemCount: number }> }>;
    assert.equal(button.props.children.props.itemCount, expected);
    button.props.onClick();
    assert.equal(openedCount, expected);
  }
});

test("refreshed offers replace a removed preview with its adjacent item without clearing failed or partial selections", () => {
  const names = new Set([
    "currentLootEntryKeys", "defaultLootEntryKey", "effectiveSelectedLootEntryKeys",
    "selectedLootEntries", "selectedLootEntry", "selectedLootItem",
  ]);
  const selectionSource = dashboard.body!.statements.filter(statement =>
    ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration =>
      ts.isIdentifier(declaration.name) && names.has(declaration.name.text),
    ) || ts.isIfStatement(statement) && statement.expression.getText(source).includes("currentLootEntryKeys.length"),
  ).map(statement => statement.getText(source)).join("\n");
  const code = ts.transpileModule(selectionSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const scenario of [
    { selected: ["middle"], remaining: ["first", "last"], expected: "last" },
    { selected: ["last"], remaining: ["first", "middle"], expected: "middle" },
    { selected: ["middle"], remaining: ["first", "middle", "last"], expected: "middle" },
    { selected: ["first", "middle"], remaining: ["middle", "last"], expected: "middle" },
  ]) {
    let selected = scenario.selected as string[] | null;
    let previous = ["first", "middle", "last"];
    let preview: { _id: string };
    for (let render = 0; render < 2; render++) {
      preview = runInNewContext(`${code}\nselectedLootItem`, {
        activeLootEntries: scenario.remaining.map(key => ({ key, item: { _id: key } })),
        previousLootEntryKeys: previous, selectedLootEntryKeys: selected, getRemainingOfferSelection,
        setPreviousLootEntryKeys: (next: string[]) => { previous = next; },
        setSelectedLootEntryKeys: (next: string[] | null) => { selected = next; },
      }) as { _id: string };
    }
    assert.equal(preview!._id, scenario.expected);
  }
});

test("bulk offer removal preserves selection until refresh, including failed and partially completed actions", async () => {
  for (const failAt of [null, 1, 2]) {
    let transition: Promise<void> | undefined;
    let requests = 0;
    const resetSelection = test.mock.fn();
    const refresh = test.mock.fn();
    const entries = ["first", "middle"].map(key => ({ key, item: item(key), auction: null }));
    runInNewContext(`${handlers}\nperformLootBulkAction("remove")`, {
      selectedLootEntries: entries, lootBulkState: { historianQuestByItemId: [], availability: { remove: { allowed: true } } },
      startTransition: (action: () => Promise<void>) => { transition = action(); },
      fetch: async () => {
        requests++;
        return requests === failAt ? Response.json({ error: "Cannot remove offer" }, { status: 409 }) : Response.json({});
      },
      setSelectedLootEntryKeys: resetSelection, setNotice() {}, setError() {},
      getLootBulkSuccessMessage: () => "Removed offers", isActionDialogResult: () => false,
      router: { refresh },
    });
    await transition;
    assert.equal(resetSelection.mock.callCount(), 0, `Failure at ${failAt} must not erase the selection`);
    assert.equal(refresh.mock.callCount(), 1);
    const remaining = failAt === null ? ["last"] : failAt === 1 ? ["first", "middle", "last"] : ["middle", "last"];
    assert.deepEqual(getRemainingOfferSelection(["first", "middle"], ["first", "middle", "last"], remaining),
      failAt === null ? ["last"] : failAt === 1 ? ["first", "middle"] : ["middle"]);
  }
});

test("art-style dropdown Select all and Select none update the checkboxes and saved bulk preferences", async () => {
  let dropdown: ts.JsxElement | undefined;
  function find(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "details" &&
      node.openingElement.attributes.getText(source).includes('className="bulk-art-style-options"')) dropdown = node;
    ts.forEachChild(node, find);
  }
  find(dashboard);
  assert.ok(dropdown);
  const dropdownCode = ts.transpileModule(`const render = () => (${dropdown.getText(source)});`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const styles = [{ id: "zine", label: "Zine" }, { id: "arcade", label: "Arcade" }] as const;
  let protections: BulkSaleProtections = { ...DEFAULT_PLAYER_VIEW_SETTINGS.bulkSaleProtections, keptArtStyleIds: ["zine"] };
  const saved: BulkSaleProtections[] = [];
  const viewSettingsSaveQueue = { current: Promise.resolve() };
  function render() {
    return runInNewContext(`${handlers}\n${dropdownCode}\nrender()`, {
      React, DROPPABLE_CARD_RENDERER_IDS, bulkArtStyleOptions: styles,
      keptActiveArtStyleCount: styles.filter(style => protections.keptArtStyleIds.includes(style.id)).length,
      bulkSaleProtections: protections,
      viewSettingsSaveQueue,
      setBulkSaleProtections: (next: BulkSaleProtections) => { protections = next; },
      setError: (message: string) => assert.fail(message),
      fetch: async (url: string, options: RequestInit) => {
        assert.equal(url, "/api/play/view-settings");
        saved.push(JSON.parse(options.body as string).bulkSaleProtections);
        return Response.json({});
      },
    }) as React.ReactElement<{ children: React.ReactNode }>;
  }
  function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
    return React.Children.toArray(node).flatMap(child =>
      React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : [],
    );
  }
  for (const [label, expected] of [["Select none", []], ["Select all", ["zine", "arcade"]]] as const) {
    const button = elements(render()).find(child => child.type === "button" && child.props.children === label)!;
    (button.props.onClick as () => void)();
    await viewSettingsSaveQueue.current;
    assert.deepEqual(Array.from(protections.keptArtStyleIds), [...expected]);
    assert.equal(protections.keepUnfoundQuestTargets, true, "style changes preserve other protection flags");
    const checkboxes = elements(render()).filter(child => child.type === "input");
    assert.ok(checkboxes.every(child => child.props.checked === (label === "Select all")));
    assert.deepEqual(saved.at(-1), JSON.parse(JSON.stringify(protections)));
  }
  const checkbox = elements(render()).find(child => child.type === "input")!;
  (checkbox.props.onChange as (event: unknown) => void)({ target: { checked: false } });
  await viewSettingsSaveQueue.current;
  assert.deepEqual(Array.from(protections.keptArtStyleIds), ["arcade"]);
  assert.deepEqual(saved.at(-1)?.keptArtStyleIds, ["arcade"]);
});

test("bulk selections protect outstanding quest targets even when owned, but not fulfilled targets or disabled preferences", () => {
  const target = {
    ...item("target", "common"), revealed: true, original: false, permanent: false, tags: [],
    values: { dealer: 10 }, authenticity: { forgery: false, identified: false },
  };
  for (const enabled of [false, true]) {
    for (const fulfilled of [false, true]) {
      const quests = [{
        _id: "quest", target: [target.artwork_id], targets: [{ artwork: { _id: target.artwork_id }, owned: true, fulfilled }],
        fulfilled_targets: fulfilled ? [{ artwork_id: target.artwork_id }] : [],
      }];
      const common = { getUnfulfilledHistorianTargetIds, canQuickSellItem, planGallerySelection, getArchivePermission, getBulkAcquisitionRequirements };
      const collection = runInNewContext(`${handlers}\ngetCollectionBulkState(options)`, {
        ...common,
        options: {
          collectionItems: [target], selectedItems: [{ ...target, status: "claimed" }], displayCap: 5,
          quests, repairingCap: 5, repairingCount: 0,
          bulkSaleProtections: { ...unprotectedBulkSettings, keepUnfoundQuestTargets: enabled },
        },
      }) as { availability: Record<string, { allowed: boolean; reason?: string }> };
      for (const action of ["sell", "donate"]) {
        assert.equal(collection.availability[action].allowed, !enabled || fulfilled, action);
      }
      for (const kind of ["unclaimed", "for_sale", "auction"]) {
        const loot = runInNewContext(`${handlers}\ngetLootBulkState(options)`, {
          ...common,
          options: {
            availableInventorySlots: 5, bankBalance: 100, dealerPriceMultiplier: 1, quests,
            bulkSaleProtections: { ...unprotectedBulkSettings, keepUnfoundQuestTargets: enabled },
            selectedEntries: [{ item: { ...target, status: kind === "auction" ? "auctioned" : kind }, auction: kind === "auction" ? {} : null }],
          },
        }) as { availability: Record<string, { allowed: boolean; reason?: string }> };
        assert.equal(loot.availability.remove.allowed, !enabled || fulfilled, kind);
        if (kind !== "auction") {
          assert.equal(loot.availability[kind === "for_sale" ? "purchase-donate" : "donate"].allowed, !enabled || fulfilled, kind);
          assert.equal(loot.availability.acquire.allowed, true);
        }
      }
    }
  }
});

test("bulk disposal handlers recheck protection and save preferences before sending bulk-marked requests", async () => {
  for (const [scope, action, status, endpoint] of [
    ["collection", "sell", "claimed", "items/first/sell"],
    ["collection", "donate", "claimed", "items/first/donate"],
    ["collection", "archive", "claimed", "items/first/archive"],
    ["loot", "remove", "unclaimed", "items/first/sell"],
    ["loot", "remove", "for_sale", "items/first/decline"],
    ["loot", "remove", "auctioned", "auctions/private/dismiss"],
    ["loot", "donate", "unclaimed", "items/first/donate"],
    ["loot", "archive", "unclaimed", "items/first/archive"],
    ["loot", "purchase-donate", "for_sale", "items/first/donate"],
    ["all", "purchase-donate", "for_sale", "items/first/donate"],
  ] as const) {
    let transition: Promise<void> | undefined;
    let finishSaving!: () => void;
    const requests: string[] = [];
    const errors: string[] = [];
    const selected = { ...item("first"), status };
    const bulkState = { availability: { [action]: { allowed: false, reason: "Protected quest target." } }, historianQuestByItemId: [] };
    const name = scope === "all" ? "purchaseAndDonateAllLoot" : scope === "collection" ? "performCollectionBulkAction" : "performLootBulkAction";
    const perform = runInNewContext(`${handlers}\n${name}`, {
      collectionBulkState: bulkState, lootBulkState: bulkState,
      selectedCollectionItems: [selected],
      selectedLootEntries: [{ item: selected, auction: status === "auctioned" ? { _id: "private" } : null }],
      purchaseDonateAllSelection: { items: [selected] },
      viewSettingsSaveQueue: { current: new Promise<void>(resolve => { finishSaving = resolve; }) },
      startTransition: (callback: () => Promise<void>) => { transition = callback(); },
      fetch: async (url: string, options: RequestInit) => {
        requests.push(url);
        assert.deepEqual(JSON.parse(options.body as string), { bulkAction: true });
        return Response.json({});
      },
      setError: (message: string) => { if (message) errors.push(message); },
      setNotice() {}, setSelectedCollectionItemIds() {}, setCreatedPrivateAuctions() {}, setDismissedPrivateAuctionIds() {},
      getCollectionBulkSuccessMessage: () => "", getLootBulkSuccessMessage: () => "", isActionDialogResult: () => false,
      router: { refresh() {} },
    }) as (action: string) => void;
    if (scope !== "all") {
      perform(action);
      assert.deepEqual(errors.splice(0), ["Protected quest target."]);
      assert.equal(transition, undefined, "a newly protected selection cannot execute after confirmation");
    }
    bulkState.availability[action].allowed = true;
    perform(action);
    assert.deepEqual(requests, [], "disposal waits for pending preference saves");
    finishSaving();
    await transition;
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, [`/api/play/${endpoint}`]);
  }
});

test("Offers retains submitted quest icons while outstanding targets in any quest stay emphasized", () => {
  const stateSource = dashboard.body!.statements.filter(statement =>
    ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration =>
      ["unsubmittedQuestTargetArtworkIds", "submittedQuestTargetArtworkIds"].includes(declaration.name.getText(source)),
    ),
  ).map(statement => statement.getText(source)).join("\n");
  const stateCode = ts.transpileModule(stateSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const [fulfilledStates, expected] of [
    [[], false], [[false], true], [[true], "submitted"], [[true, false], true],
  ] as const) {
    for (const status of ["unclaimed", "for_sale", "auctioned"] as const) {
      const work = { ...item("target", "common"), status, revealed: true, artwork: { rarity: "common", title: "Work", artist: "Artist" } };
      const tree = runInNewContext(`${handlers}\n${stateCode}\nrenderLootThumbnail(entry)`, {
        React, ItemThumbnail: () => null, OfferThumbnail: () => null,
        quests: fulfilledStates.map(fulfilled => ({ targets: [{ artwork: { _id: work.artwork_id }, fulfilled }] })),
        useMemo: (getValue: () => unknown) => getValue(),
        entry: { key: "target", item: work, auction: status === "auctioned" ? {} : null },
        getOfferRevealTier, offerRevealThresholds: DEFAULT_OFFER_REVEAL_THRESHOLDS,
        enableReveals: false, revealedLootIds: [], pendingOfferReveals: new Set(), selectedLootEntryKeysSet: new Set(),
        cancelLootEntryLongPress() {}, moveLootEntryLongPress() {},
      }) as React.ReactElement<{ children: React.ReactElement<{ researchTarget: boolean | "submitted" }> }>;
      assert.equal(tree.props.children.props.researchTarget, expected, `${status}: ${fulfilledStates}`);
    }
  }
});

test("Archive all respects Keep unarchived, other protections, and archive eligibility rules", () => {
  const statement = dashboard.body!.statements.find(statement => ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some(declaration => declaration.name.getText(source) === "bulkArchivableLoot"))!;
  const code = ts.transpileModule(statement.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const offers = [
    archiveOffer("regular"), archiveOffer("quest"), archiveOffer("submitted"),
    archiveOffer("sealed", { revealed: false }),
    archiveOffer("style", { card_renderer: "zine" }),
    ...(["rare", "legendary", "masterpiece"] as const).map(rarity => archiveOffer(rarity, { artwork: { rarity } as HydratedGameItem["artwork"] })),
    archiveOffer("original", { original: true }), archiveOffer("permanent", { permanent: true }),
    archiveOffer("repairing", { repairing: true }),
    archiveOffer("known-forgery", { authenticity: { forgery: true, identified: true } as HydratedGameItem["authenticity"] }),
    archiveOffer("archived", { archivedCategories: ["standard"] }),
    archiveOffer("new-variant", { foil: true, archivedCategories: ["standard"] }),
    archiveOffer("affordable", { status: "for_sale" }),
    archiveOffer("unaffordable", { status: "for_sale", values: { dealer: 202 } as HydratedGameItem["values"] }),
    archiveOffer("auction", { status: "auctioned" }),
  ];
  for (const keepUnarchived of [false, true]) {
    const selected = runInNewContext(`${code}\nbulkArchivableLoot`, {
      activeLootCategory: { entries: offers.map(item => ({ item, auction: item.status === "auctioned" ? {} : null })) },
      useMemo: (getValue: () => unknown) => getValue(), getArchivePermission,
      bulkSaleProtections: {
        keptArtStyleIds: ["zine"], keepRares: true, keepLegendaries: true, keepMasterpieces: true,
        keepUnfoundQuestTargets: true, keepUnarchived,
      },
      unsubmittedQuestTargetArtworkIds: new Set(["art-quest"]),
      player: { bankBalance: 100 }, dealerPriceMultiplier: 0.5,
    }) as HydratedGameItem[];
    assert.deepEqual(Array.from(selected, item => item._id), keepUnarchived ? [] : ["regular", "submitted", "new-variant", "affordable"]);
  }
});

test("all offer bulk target lists exclude sealed items even with reveal animations and every optional protection disabled", () => {
  const names = new Set([
    "bulkArchivableLoot", "bulkSellableLoot", "quickSellableLoot", "bulkDeclinableLoot",
    "bulkDismissiblePrivateAuctions", "bulkTransferablePrivateAuctions", "purchaseDonateAllSelection",
  ]);
  const declarations = dashboard.body!.statements.filter(statement =>
    ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration =>
      names.has(declaration.name.getText(source)),
    ),
  ).map(statement => statement.getText(source)).join("\n");
  const code = ts.transpileModule(`${declarations}\n({
    archive: bulkArchivableLoot, sell: quickSellableLoot, decline: bulkDeclinableLoot,
    dismiss: bulkDismissiblePrivateAuctions.map(auction => auction.item),
    transfer: bulkTransferablePrivateAuctions.map(auction => auction.item),
    donate: purchaseDonateAllSelection.items,
  })`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const enableReveals of [false, true]) {
    for (const acknowledged of [false, true]) {
      const unclaimed = [
        archiveOffer("loot"), archiveOffer("sealed", { revealed: false, odds: "unknown" }),
        archiveOffer("dealer", { status: "for_sale" }),
        archiveOffer("sealed-dealer", { status: "for_sale", revealed: false }),
      ];
      const result = runInNewContext(code, {
        enableReveals, revealedOfferIds: new Set(acknowledged ? ["sealed"] : []),
        offerRevealThresholds: { level1: 0, level2: 0, level3: 0 },
        unclaimed, activeLootCategory: { entries: unclaimed.map(item => ({ item })) },
        activePrivateAuctionLoot: [true, false].map(revealed => ({
          item: archiveOffer(revealed ? "auction" : "sealed-auction", { revealed, status: "auctioned" }),
          transferable: true,
        })),
        bulkSaleProtections: unprotectedBulkSettings, unsubmittedQuestTargetArtworkIds: new Set(),
        player: { bankBalance: 100 }, dealerPriceMultiplier: 1,
        useMemo: (getValue: () => unknown) => getValue(),
        getArchivePermission, isBulkLootCandidate, selectBulkPurchaseItems,
      }) as Record<string, HydratedGameItem[]>;
      for (const [action, expected] of Object.entries({
        archive: acknowledged ? ["loot", "sealed", "dealer"] : ["loot", "dealer"],
        sell: acknowledged ? ["loot", "sealed"] : ["loot"],
        decline: ["dealer"], donate: ["dealer"], dismiss: ["auction"], transfer: ["auction"],
      })) {
        assert.deepEqual(Array.from(result[action], item => item._id), expected, action);
      }
    }
  }
});

test("mixed unrevealed selections disable every bulk operation, without blocking revealed selections", () => {
  for (const scope of ["collection", "loot"]) {
    const evaluate = (revealed: boolean) => {
      const works = [
        archiveOffer("known"), archiveOffer("sealed", { revealed, odds: "unknown" }),
      ].map(item => ({
        ...item, status: scope === "collection" ? "claimed" : "unclaimed",
        archivePermission: { allowed: true },
      }));
      return runInNewContext(`${handlers}\n${scope === "collection" ? "getCollectionBulkState" : "getLootBulkState"}(options)`, {
        getArchivePermission, getBulkAcquisitionRequirements, getUnfulfilledHistorianTargetIds, planGallerySelection,
        options: {
          selectedItems: works, collectionItems: works, selectedEntries: works.map(item => ({ item })),
          bulkSaleProtections: unprotectedBulkSettings,
          offerRevealThresholds: { level1: 0, level2: 0, level3: 0 },
          quests: [], availableInventorySlots: 10, bankBalance: 1000, dealerPriceMultiplier: 1,
          displayCap: 10, repairingCap: 10, repairingCount: 0,
        },
      }) as { availability: Record<string, { allowed: boolean; reason?: string }> };
    };
    for (const availability of Object.values(evaluate(false).availability)) {
      assert.equal(availability.allowed, false, scope);
      assert.match(availability.reason!, /Reveal every selected item/);
    }
    const revealed = evaluate(true).availability;
    for (const action of ["archive", "donate", scope === "collection" ? "sell" : "acquire"]) {
      assert.equal(revealed[action].allowed, true, `${scope}: ${action}`);
    }
  }
});

test("selected disposal uses the same style, rarity and unarchived protections as all-item actions", () => {
  for (const protections of [
    { ...unprotectedBulkSettings, keptArtStyleIds: ["zine"] },
    { ...unprotectedBulkSettings, keepRares: true },
    { ...unprotectedBulkSettings, keepUnarchived: true },
  ]) {
    const work = archiveOffer("protected", {
      card_renderer: "zine", artwork: { rarity: "rare" } as HydratedGameItem["artwork"],
      archivePermission: { allowed: true },
    });
    for (const scope of ["collection", "loot"]) {
      const selected = { ...work, status: scope === "collection" ? "claimed" : "unclaimed" };
      const { availability } = runInNewContext(
        `${handlers}\n${scope === "collection" ? "getCollectionBulkState" : "getLootBulkState"}(options)`, {
          getArchivePermission, getBulkAcquisitionRequirements, getUnfulfilledHistorianTargetIds, planGallerySelection,
          options: {
            selectedItems: [selected], collectionItems: [selected], selectedEntries: [{ item: selected }],
            bulkSaleProtections: protections, quests: [],
            availableInventorySlots: 10, bankBalance: 1000, dealerPriceMultiplier: 1,
            displayCap: 10, repairingCap: 10, repairingCount: 0,
          },
        },
      ) as { availability: Record<string, { allowed: boolean }> };
      for (const action of ["archive", "donate", scope === "collection" ? "sell" : "remove"]) {
        assert.equal(availability[action].allowed, false, `${scope}: ${action}`);
      }
      assert.equal(availability[scope === "collection" ? "display" : "acquire"].allowed, true);
    }
  }
});

test("Archive all is disabled while Keep unarchived is checked, without overriding the editable preference", async () => {
  let action: ts.JsxElement | undefined;
  let fieldset: ts.JsxElement | undefined;
  function find(node: ts.Node) {
    if (ts.isJsxElement(node)) {
      if (node.openingElement.attributes.getText(source).includes('className="archive-all-loot"')) action = node;
      if (node.openingElement.tagName.getText(source) === "fieldset" && node.getText(source).includes("Items to preserve")) fieldset = node;
    }
    ts.forEachChild(node, find);
  }
  find(dashboard);
  assert.ok(action);
  assert.ok(fieldset);
  const code = ts.transpileModule(`const render = () => (<>${action.getText(source)}${fieldset.getText(source)}</>); render()`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  for (const category of ["unclaimed", "for-sale"]) {
    let protections = { ...DEFAULT_PLAYER_VIEW_SETTINGS.bulkSaleProtections, keepUnarchived: true };
    const saved: BulkSaleProtections[] = [];
    const queue = { current: Promise.resolve() };
    function render() {
      return runInNewContext(`${handlers}\n${code}`, {
        React, activeLootCategory: { id: category }, pending: false, bulkArchivableLoot: [archiveOffer("eligible")],
        bulkSaleProtections: protections, bulkArtStyleOptions: [], keptActiveArtStyleCount: 0,
        setBulkSaleProtections: (next: BulkSaleProtections) => { protections = next; },
        viewSettingsSaveQueue: queue, setError: (message: string) => assert.fail(message),
        fetch: async (_url: string, options: RequestInit) => {
          saved.push(JSON.parse(options.body as string).bulkSaleProtections);
          return Response.json({});
        },
      }) as React.ReactElement<{ children: React.ReactElement<Record<string, unknown>>[] }>;
    }
    function checkbox(tree: ReturnType<typeof render>, labelText: string) {
      const inputs = tree.props.children[1].props.children as React.ReactNode[];
      const labels = inputs.flat().filter(React.isValidElement<{ children: React.ReactElement[] }>);
      const label = labels.find(label => label.type === "label" && label.props.children[1]?.props.children === labelText)!;
      return label.props.children[0] as React.ReactElement<{
        checked: boolean; disabled?: boolean; onChange: (event: unknown) => void;
      }>;
    }
    let tree = render();
    assert.equal(tree.props.children[0].props.disabled, true);
    assert.equal(checkbox(tree, "Keep unarchived").props.checked, true);
    assert.ok(!checkbox(tree, "Keep unarchived").props.disabled);
    assert.deepEqual(saved, [], "rendering never changes the preference");
    checkbox(tree, "Keep unarchived").props.onChange({ target: { checked: false } });
    await queue.current;
    tree = render();
    assert.equal(tree.props.children[0].props.disabled, false);
    assert.equal(checkbox(tree, "Keep unarchived").props.checked, false);
    assert.equal(saved[0].keepUnarchived, false);
    checkbox(tree, "Keep unarchived").props.onChange({ target: { checked: true } });
    await queue.current;
    tree = render();
    assert.equal(tree.props.children[0].props.disabled, true);
    assert.equal(checkbox(tree, "Keep unarchived").props.checked, true);
    assert.ok(!checkbox(tree, "Keep unarchived").props.disabled);
    assert.equal(saved[1].keepUnarchived, true);
  }
});

test("Archive all rechecks Keep unarchived before executing a stale eligible selection", () => {
  const startTransition = test.mock.fn();
  const errors: string[] = [];
  runInNewContext(`${handlers}\narchiveAllLoot()`, {
    bulkSaleProtections: { keepUnarchived: true }, bulkArchivableLoot: [archiveOffer("eligible")],
    startTransition, setError: (message: string) => errors.push(message),
  });
  assert.equal(startTransition.mock.callCount(), 0);
  assert.deepEqual(errors, ['Turn off "Keep unarchived" to archive all offers.']);
});

test("Archive all skips redundant variants and unaffordable purchases without treating a detected forgery as archived", async () => {
  const first = archiveOffer("forgery", { status: "for_sale" });
  const duplicate = archiveOffer("duplicate", { artwork_id: first.artwork_id, status: "for_sale" });
  const variant = archiveOffer("variant", { artwork_id: first.artwork_id, status: "for_sale", foil: true });
  const redundant = archiveOffer("redundant", { artwork_id: first.artwork_id, status: "for_sale", foil: true });
  const expensive = archiveOffer("expensive", { status: "for_sale", values: { dealer: 100 } as HydratedGameItem["values"] });
  const last = archiveOffer("last", { status: "for_sale" });
  let transition: Promise<void> | undefined;
  let finishSaving!: () => void;
  const requests: string[] = [];
  const notices: string[] = [];
  const dialogs: unknown[] = [];
  const refresh = test.mock.fn();
  runInNewContext(`${handlers}\narchiveAllLoot()`, {
    bulkSaleProtections: { keepUnarchived: false },
    bulkArchivableLoot: [first, duplicate, variant, redundant, expensive, last], archives: [],
    player: { bankBalance: 60 }, dealerPriceMultiplier: 1,
    getArchivePermission, getArchiveArtStyle, getArchiveCategories,
    viewSettingsSaveQueue: { current: new Promise<void>(resolve => { finishSaving = resolve; }) },
    startTransition: (callback: () => Promise<void>) => { transition = callback(); },
    fetch: async (url: string, options: RequestInit) => {
      requests.push(url);
      assert.deepEqual(JSON.parse(options.body as string), { bulkAction: true });
      return Response.json(url.includes("/forgery/") ? {
        actionDialog: { variant: "destroyed", title: "Forgery detected", message: "No additions were archived." },
      } : {});
    },
    setError: (message: string) => { if (message) assert.fail(message); },
    setNotice: (message: string) => notices.push(message), setActionDialog: (dialog: unknown) => dialogs.push(dialog),
    isActionDialogResult: (value: unknown) => Boolean(value), router: { refresh },
  });
  assert.deepEqual(requests, []);
  finishSaving();
  await transition;
  assert.deepEqual(requests, ["forgery", "duplicate", "variant", "last"].map(id => `/api/play/items/${id}/archive`));
  assert.match(notices.at(-1)!, /Archived 3 artworks.*1 offer had a special forgery outcome/);
  assert.equal(dialogs.length, 1);
  assert.equal(refresh.mock.callCount(), 1);
});

test("Archive all reports partial failures and refreshes after already-processed offers", async () => {
  let transition: Promise<void> | undefined;
  const requests: string[] = [];
  const errors: string[] = [];
  const refresh = test.mock.fn();
  runInNewContext(`${handlers}\narchiveAllLoot()`, {
    bulkSaleProtections: { keepUnarchived: false },
    bulkArchivableLoot: ["first", "failed", "untouched"].map(id => archiveOffer(id)), archives: [],
    player: { bankBalance: 0 }, dealerPriceMultiplier: 1, getArchivePermission, getArchiveArtStyle, getArchiveCategories,
    startTransition: (callback: () => Promise<void>) => { transition = callback(); },
    fetch: async (url: string) => {
      requests.push(url);
      return url.includes("/failed/") ? Response.json({ error: "Offer changed." }, { status: 409 }) : Response.json({});
    },
    setError: (message: string) => errors.push(message), setNotice() {},
    isActionDialogResult: () => false, router: { refresh },
  });
  await transition;
  assert.deepEqual(requests, ["first", "failed"].map(id => `/api/play/items/${id}/archive`));
  assert.match(errors.at(-1)!, /1 offer was processed before archiving stopped\. Offer changed\./);
  assert.equal(refresh.mock.callCount(), 1);
});

test("featured cards select filtered-out works for the preview and visit their exact gallery position independently", () => {
  const featured = {
    ...item("featured"), status: "displayed", revealed: true,
    artwork: {
      title: "Featured Artwork", artist: "Artist", rarity: "legendary", date: 2026, effect_id: "effect",
      thumbnail_adjustment: { x: 25, y: 30, scale: 1.5 },
      feature_card_adjustment: { x: -40, y: -20, scale: 2 },
    },
    values: { actual: 100 },
  };
  const other = { ...featured, _id: "other" };
  const states: Record<string, unknown> = {
    selectedCollectionItemIds: null, exploreResetKey: 3,
  };
  const replace = test.mock.fn();
  const event = { ctrlKey: false, metaKey: false };
  const selectionSource = dashboard.body!.statements.filter(statement =>
    ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration =>
      ts.isIdentifier(declaration.name) && [
        "defaultCollectionItemId", "effectiveSelectedCollectionItemIds",
        "selectedCollectionItems", "selectedCollectionItem",
      ].includes(declaration.name.text),
    ),
  ).map(statement => statement.getText(source)).join("\n");
  const context = {
    React, getOfferRevealTier,
    legendaryAttributes: [{ id: "effect", title: "Golden Touch", description: "Earn more money.", active: true }],
    offerRevealThresholds: DEFAULT_OFFER_REVEAL_THRESHOLDS,
    enableReveals: true, revealedOfferIds: new Set<string>(), isOfferRevealed,
    OfferThumbnail: () => null, ArtworkThumbnail: () => null,
    getArtworkFeatureCardAdjustment,
    selectedCollectionItemIdsSet: new Set<string>(),
    suppressedCollectionClickRef: { current: null },
    defaultCollectionItemId: other._id,
    setSelectedCollectionItemIds: (update: (current: unknown) => unknown) => {
      states.selectedCollectionItemIds = update(states.selectedCollectionItemIds);
    },
    cancelCollectionItemLongPress() {},
    moveCollectionItemLongPress() {},
    playerId: "player/with spaces",
    setExploreGalleryId: (id: string) => { states.galleryId = id; },
    setExploreFocusedItemId: (id: string | null) => { states.focusedItemId = id; },
    setExploreResetKey: (update: (current: number) => number) => {
      states.exploreResetKey = update(states.exploreResetKey as number);
    },
    selectDashboardSection: (section: string) => { states.section = section; },
    router: { replace }, URLSearchParams, featured,
  };
  const card = runInNewContext(`${handlers}\nrenderFeaturedWork(featured)`, context) as
    React.ReactElement<{ children: React.ReactElement<{
      "aria-pressed": boolean; onClick: (event: typeof event) => void; children: React.ReactNode;
    }>[] }>;
  const [select, visit] = card.props.children;
  assert.equal(select.props["aria-pressed"], false);
  const content = React.Children.only(select.props.children) as React.ReactElement<Parameters<typeof FeaturedWorkContent>[0]>;
  const image = React.Children.toArray(FeaturedWorkContent(content.props).props.children).find(child =>
    React.isValidElement<{ variant?: string }>(child) && child.props.variant === "card",
  ) as React.ReactElement<{ adjustment: unknown; fixedFocalPoint: boolean }>;
  assert.deepEqual(image.props.adjustment, featured.artwork.feature_card_adjustment);
  assert.equal(image.props.fixedFocalPoint, true);
  visit.props.onClick(event);
  assert.equal(states.selectedCollectionItemIds, null, "Visiting does not change collection selection");
  assert.equal(states.galleryId, context.playerId);
  assert.equal(states.focusedItemId, featured._id);
  assert.equal(states.section, "explore");
  assert.equal(states.exploreResetKey, 4);
  const navigation = replace.mock.calls[0].arguments as [string, { scroll: boolean }];
  const url = new URL(navigation[0], "https://example.test");
  assert.equal(url.searchParams.get("gallery"), context.playerId);
  assert.equal(url.searchParams.get("galleryItem"), featured._id);
  assert.equal(url.searchParams.has("item"), false, "Gallery focus must not open the item-details deep link");
  assert.equal(navigation[1].scroll, false);

  select.props.onClick(event);
  const preview = runInNewContext(`${ts.transpileModule(selectionSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText}\nselectedCollectionItem`, {
    selectedCollectionItemIds: states.selectedCollectionItemIds,
    sortedHomeInventory: [other], collectionItems: [featured, other],
  }) as typeof featured;
  assert.equal(preview._id, featured._id);

  select.props.onClick({ ctrlKey: true, metaKey: false });
  assert.equal((states.selectedCollectionItemIds as string[]).length, 0);
  runInNewContext(`${handlers}\nvisitOwnGallery()`, context);
  assert.equal(states.focusedItemId, null, "The general gallery button clears a previous item target");
  const generalUrl = new URL(replace.mock.calls[1].arguments[0] as string, "https://example.test");
  assert.equal(generalUrl.searchParams.has("galleryItem"), false);
});

test("featured cards show matching active effects between the artwork details and gallery button", () => {
  const effects = [
    { id: "active", title: "Golden Touch", description: "Featured works earn more money.", active: true },
    { id: "inactive", title: "Dormant Effect", description: "This effect is disabled.", active: false },
  ];
  for (const [rarity, effectId, expected] of [
    ["legendary", "active", true], ["masterpiece", "active", true],
    ["rare", undefined, false], ["legendary", "missing", false], ["masterpiece", "inactive", false],
  ] as const) {
    const featured = {
      ...item(`featured-${rarity}-${effectId}`, rarity), revealed: true,
      artwork: { title: "Featured Artwork", artist: "Artist", rarity, date: 2026, effect_id: effectId },
      values: { actual: 100 },
    };
    const html = renderToStaticMarkup(runInNewContext(`${handlers}\nrenderFeaturedWork(featured)`, {
      React, getOfferRevealTier, featured, legendaryAttributes: effects, getArtworkFeatureCardAdjustment,
      offerRevealThresholds: DEFAULT_OFFER_REVEAL_THRESHOLDS,
      enableReveals: true, revealedOfferIds: new Set<string>(), isOfferRevealed,
      selectedCollectionItemIdsSet: new Set<string>(), ArtworkThumbnail: () => null,
      OfferThumbnail: ({ children, title, "aria-describedby": description }: React.ComponentProps<"button">) =>
        React.createElement("button", { title, "aria-describedby": description }, children),
      cancelCollectionItemLongPress() {}, moveCollectionItemLongPress() {},
    }) as React.ReactElement);
    if (expected) {
      const effectId = `featured-effect-${featured._id}`;
      assert.ok(html.includes(`aria-describedby="${effectId}"`));
      assert.ok(html.includes(`class="home-featured-effect" id="${effectId}"`));
      assert.match(html, /<strong>Golden Touch<\/strong><span>Featured works earn more money\.<\/span>/);
      assert.match(html, /title="Golden Touch: Featured works earn more money\."/);
      assert.ok(html.indexOf('class="home-featured-details"') < html.indexOf('class="home-featured-effect"'));
      assert.ok(html.indexOf('class="home-featured-effect"') < html.indexOf('class="home-featured-visit"'));
    } else {
      assert.doesNotMatch(html, /home-featured-effect|data-has-effect|aria-describedby|Golden Touch|Dormant Effect/);
    }
  }
});

test("unrevealed featured cards do not expose artwork names, artists, images, values, or unique effects", () => {
  const featured = {
    ...item("hidden-featured"), status: "displayed", drop_chance_coefficient: 0.0001,
    artwork: { title: "Secret Title", artist: "Secret Artist", rarity: "masterpiece", date: 2026, effect_id: "secret" },
    values: { actual: 987_654 },
  };
  const card = runInNewContext(`${handlers}\nrenderFeaturedWork(featured)`, {
    React, getOfferRevealTier, featured,
    legendaryAttributes: [{ id: "secret", title: "Secret Effect", description: "Secret bonus.", active: true }],
    offerRevealThresholds: DEFAULT_OFFER_REVEAL_THRESHOLDS,
    enableReveals: true, revealedOfferIds: new Set<string>(), isOfferRevealed,
    selectedCollectionItemIdsSet: new Set([featured._id]),
    OfferThumbnail: ({ children }: { children: React.ReactNode }) => React.createElement("button", null, children),
    cancelCollectionItemLongPress() {}, moveCollectionItemLongPress() {},
  }) as React.ReactElement;
  const html = renderToStaticMarkup(card);
  assert.doesNotMatch(html, /Secret Title|Secret Artist|987,654|<img|artwork-thumbnail|Secret Effect|Secret bonus|home-featured-effect|aria-describedby/);
  assert.match(html, /Unrevealed featured work/);
  assert.match(html, /data-selected="true"/);
});

test("collect and set for sale follows claim capacity and blocks disabled clicks", async (t) => {
  for (const scenario of [
    { name: "available slot", full: false, pending: false, disabled: false },
    { name: "full inventory", full: true, pending: false, disabled: true },
    { name: "Original cannot be offered to Collectors", full: true, original: true, pending: false, disabled: true },
    { name: "Vintage bypasses capacity", full: true, vintage: true, pending: false, disabled: false },
    { name: "pending action", full: false, pending: true, disabled: true },
    { name: "pending Original", full: true, original: true, pending: true, disabled: true },
  ]) {
    await t.test(scenario.name, () => {
      const act = t.mock.fn();
      const work = {
        ...item("claimable"), values: { sell: 125 },
        archivePermission: { allowed: false, reason: "No new archive entries." },
        original: scenario.original ?? false, vintage: scenario.vintage ?? false,
      };
      const actions = runInNewContext(`${handlers}\nact = onAction;\nlootItemActions(work)`, {
        React, work, onAction: act, pending: scenario.pending, inventoryFull: scenario.full,
        historianQuestsForItem: () => [],
        historianSubmissionDisabledReason: () => undefined,
        archiveAction: () => null,
      }) as React.ReactElement<{ children: React.ReactElement<{
        label: string; disabled: boolean; disabledReason?: string; onClick: () => void;
      }>[] }>;
      const action = actions.props.children.find((child) =>
        child?.props.label === "Collect and set for sale",
      )!;
      assert.equal(action.props.disabled, scenario.disabled);
      if (scenario.full && !scenario.original && !scenario.vintage) {
        assert.equal(action.props.disabledReason, "Your inventory is currently full.");
      }
      const button = (action.type as (props: typeof action.props) => React.ReactElement<{
        onClick: () => void;
      }>)(action.props);
      button.props.onClick();
      assert.equal(act.mock.callCount(), scenario.disabled ? 0 : 1);
      if (!scenario.disabled) {
        assert.equal(act.mock.calls[0].arguments[0], "/api/play/items/claimable/claim-and-set-for-sale");
      }
    });
  }
});

test("Feature buttons explain visitor attraction and earnings while keeping unavailable reasons visible", () => {
  const description = "Featured works attract visitors to your gallery and earn money and XP over time.";
  const limitReason = "You have reached your featured-work limit.";
  const work = {
    ...item("work"), status: "claimed", permanent: false, original: false, repairing: false,
    tags: [], values: { sell: 125 }, condition: 0.5, archivePermission: { allowed: true },
  };
  type ActionProps = {
    label: string; description?: string; disabled: boolean; disabledReason?: string; onClick: () => void;
  };
  for (const full of [false, true]) {
    const context = {
      React, work, pending: false, now: Date.now(), inventory: [work],
      items: full ? [work, { ...work, _id: "other", artwork_id: "other-art", status: "displayed" }] : [work],
      player: { displayCap: 1, repairingCap: 5 }, repairingCount: 0, getDisplayPermission,
      historianQuestsForItem: () => [{}],
      tagItemAction: () => null, permanentItemAction: () => null,
    };
    const primary = runInNewContext(`${handlers}\ncollectionGalleryAction(work)`, { ...context }) as
      React.ReactElement<{ title: string; disabled: boolean; children: React.ReactNode }>;
    assert.equal(primary.props.disabled, full);
    assert.equal(primary.props.title, full ? limitReason : description);
    assert.ok(React.Children.toArray(primary.props.children).some(child =>
      typeof child === "string" && child.trim() === "Feature",
    ));
    const actions = runInNewContext(`${handlers}\ncollectionItemActions(work, true)`, { ...context }) as
      React.ReactElement<{ children: React.ReactElement<ActionProps>[] }>;
    const feature = actions.props.children.find(child => child?.props.label === "Feature in gallery")!;
    assert.ok(feature);
    const button = (feature.type as (props: ActionProps) => React.ReactElement<{
      "data-tooltip": string; "aria-label": string; "aria-disabled": boolean;
    }>)(feature.props);
    assert.equal(button.props["aria-disabled"], full);
    assert.equal(button.props["data-tooltip"], full ? limitReason : description);
    assert.equal(button.props["aria-label"], full
      ? `Feature in gallery. Unavailable: ${limitReason}`
      : `Feature in gallery. ${description}`);
  }
});

test("bulk Feature actions share the explanatory tooltip and use Stop featuring when already featured", () => {
  const availability = Object.fromEntries(
    ["display", "take-down", "set-gallery", "tag", "collector-sale", "repair", "sell", "historian", "archive", "donate"]
      .map(action => [action, { allowed: action !== "take-down" }]),
  ) as Record<string, { allowed: boolean; reason?: string }>;
  type ButtonProps = { "aria-label": string; title: string; disabled: boolean };
  const render = () => {
    const tree = runInNewContext(`${handlers}\nCollectionBulkActionsPanel(props)`, {
      React,
      props: {
        attributeScore: 0, attributes: [], availability, displayCapacity: 5,
        itemCount: 2, onAction: () => {}, pending: false, totalValue: 250,
      },
    }) as React.ReactElement<{ children: React.ReactElement<{
      children: React.ReactElement<ButtonProps>[];
    }>[] }>;
    return tree.props.children[1].props.children;
  };
  assert.equal(render().find(button => button.props["aria-label"] === "Feature")?.props.title,
    "Featured works attract visitors to your gallery and earn money and XP over time.");
  availability.display = { allowed: false, reason: "Your gallery is full." };
  const unavailable = render().find(button => button.props["aria-label"].startsWith("Feature."))!;
  assert.equal(unavailable.props.disabled, true);
  assert.equal(unavailable.props.title, "Your gallery is full.");
  availability["take-down"] = { allowed: true };
  assert.ok(render().some(button => button.props["aria-label"] === "Stop featuring"));
});

test("dealer purchase controls require space, but direct disposal controls do not", () => {
  for (const flags of [{}, { original: true }, { vintage: true }]) {
    const work = {
      ...item("dealer"), ...flags, status: "for_sale", values: { dealer: 100 },
      archivePermission: { allowed: true },
    };
    const context = {
      React, work, inventoryFull: true, pending: false, dealerPriceMultiplier: 1,
      player: { bankBalance: 1_000 },
      historianQuestsForItem: () => [{}],
      historianSubmissionDisabledReason: () => undefined,
    };
    type ActionProps = { label: string; disabled: boolean; disabledReason?: string };
    const actions = runInNewContext(`${handlers}\nlootItemActions(work)`, context) as
      React.ReactElement<{ children: React.ReactElement<ActionProps>[] }>;
    const props = actions.props.children.filter(Boolean).map((child) => child.props);
    const purchase = props.find(({ label }) => label === "Purchase and set for sale")!;
    const exempt = "original" in flags || "vintage" in flags;
    assert.equal(purchase.disabled, Boolean("original" in flags) || !exempt);
    if (!exempt) assert.equal(purchase.disabledReason, "Your inventory is currently full.");
    for (const name of ["Purchase and donate", "Purchase and archive", "Purchase and send to Historian"]) {
      assert.equal(props.find(({ label }) => label.startsWith(name))!.disabled, name === "Purchase and donate" && "original" in flags);
    }
    const primary = runInNewContext(`${handlers}\nlootPrimaryAction(work)`, context) as
      React.ReactElement<{ disabled: boolean }>;
    assert.equal(primary.props.disabled, !exempt);
  }
});

test("auction and Collector sale actions render after the divider in previews and shared dialog actions", async () => {
  const layoutSource = await readFile(new URL("../../components/item-cards/item-action-layout.tsx", import.meta.url), "utf8");
  const layoutCode = ts.transpileModule(layoutSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const ItemActionLayout = runInNewContext(`${layoutCode}\nexports.default`, {
    exports: {}, require: (id: string) => id === "@/shared/tutorial"
      ? { TutorialElement } : createRequire(import.meta.url)(id),
  }) as (props: { actions: React.ReactNode }) => React.ReactElement;
  for (const render of [
    "collectionItemActions(work)", "collectionItemActions(work, true)",
    "lootItemActions({ ...work, status: 'unclaimed' })",
    "lootItemActions({ ...work, status: 'for_sale' })",
  ]) {
    const work = {
      ...item("work"), status: "claimed", original: false, permanent: false, tags: [],
      condition: 0.5, values: { sell: 125, dealer: 10 },
      authenticity: { identified: false, forgery: false },
      archivePermission: { allowed: true }, authenticationPermission: { allowed: true, cost: 10 },
    };
    const actions = runInNewContext(`${handlers}\n${render}`, {
      React, work, pending: false, now: Date.now(), items: [work],
      inventoryFull: false, dealerPriceMultiplier: 1,
      player: { displayCap: 5, repairingCap: 5, bankBalance: 1_000 },
      repairingCount: 0, getDisplayPermission,
      historianQuestsForItem: () => [], tagItemAction: () => null, permanentItemAction: () => null,
    }) as React.ReactElement;
    const html = renderToStaticMarkup(React.createElement(ItemActionLayout, { actions }));
    const left = html.match(/<section aria-label="Non-destructive actions"[^>]*>(.*?)<\/section>/)![1];
    const right = html.match(/<section aria-label="Destructive actions"[^>]*>(.*?)<\/section>/)![1];
    assert.match(right, /(?:Offer to Art Collectors|Collect and set for sale|Purchase and set for sale)/, render);
    assert.doesNotMatch(left, /(?:Offer to Art Collectors|Collect and set for sale|Purchase and set for sale|Put up for auction)/, render);
    if (render.startsWith("collection")) {
      assert.match(right, /Put up for auction/, render);
      assert.match(left, /Repair item/, render);
      assert.match(left, /Modify attributes/, render);
    }
  }
});

test("bulk dealer disposal ignores capacity but still requires funds and eligibility", () => {
  const work = {
    ...item("dealer"), revealed: true, status: "for_sale", values: { dealer: 100 },
    artwork: { title: "Test" }, archivePermission: { allowed: true },
  };
  const evaluate = (bankBalance: number) => runInNewContext(
    `${handlers}\ngetLootBulkState(options)`,
    {
      getBulkAcquisitionRequirements, getUnfulfilledHistorianTargetIds,
      options: {
        availableInventorySlots: 0, bankBalance, dealerPriceMultiplier: 1,
        quests: [{ _id: "quest", target: [work.artwork_id] }],
        selectedEntries: [{ item: work }],
      },
    },
  ) as { availability: Record<string, { allowed: boolean }> };
  const { availability } = evaluate(100);
  assert.equal(availability.acquire.allowed, false);
  assert.equal(availability["collector-sale"].allowed, false);
  for (const action of ["purchase-donate", "archive", "historian"]) {
    assert.equal(availability[action].allowed, true);
    assert.equal(evaluate(99).availability[action].allowed, false);
  }
});

test("Original selections cannot be sold, donated, or offered to Collectors, but may still be acquired", () => {
  const original = {
    ...item("original", "common"), revealed: true, original: true, permanent: false, status: "claimed",
    condition: 0.5, tags: [], artwork: { title: "Original", rarity: "common" },
    archivePermission: { allowed: false, reason: "Original artwork cannot be archived." },
  };
  const { availability } = runInNewContext(`${handlers}\ngetCollectionBulkState(options)`, {
    canQuickSellItem, planGallerySelection, getArchivePermission,
    options: {
      collectionItems: [original], selectedItems: [original], displayCap: 5,
      quests: [], repairingCap: 5, repairingCount: 0,
    },
  }) as { availability: Record<string, { allowed: boolean; reason?: string }> };
  for (const action of ["sell", "donate", "collector-sale"]) {
    assert.equal(availability[action].allowed, false);
    assert.match(availability[action].reason!, /Original/);
  }
  assert.equal(availability.display.allowed, true);
  for (const status of ["unclaimed", "for_sale"]) {
    const { availability: loot } = runInNewContext(`${handlers}\ngetLootBulkState(options)`, {
      getBulkAcquisitionRequirements, getUnfulfilledHistorianTargetIds,
      options: {
        selectedEntries: [{ item: { ...original, status, values: { dealer: 10 } } }],
        availableInventorySlots: 0, bankBalance: 100, dealerPriceMultiplier: 1, quests: [],
      },
    }) as { availability: Record<string, { allowed: boolean }> };
    assert.equal(loot.acquire.allowed, true);
    assert.equal(loot["collector-sale"].allowed, false);
    assert.equal(loot.donate.allowed, false);
    assert.equal(loot["purchase-donate"].allowed, false);
    if (status === "unclaimed") assert.equal(loot.remove.allowed, false);
  }
});

test("Original removal requests stop before confirmation or network actions", () => {
  for (const operation of ['requestItemRemoval(work, "sell")', 'requestItemRemoval(work, "donate")', "requestPurchaseDonation(work)"]) {
    const errors: string[] = [];
    runInNewContext(`${handlers}\n${operation}`, {
      work: { original: true }, setError: (message: string) => errors.push(message),
    });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Original artwork cannot/);
  }
});

test("promoted artwork disables disposal and repair while retaining modification and authentication", (t) => {
  const work = {
    ...item("promoted"), status: "displayed", revealed: true, tags: [], original: false,
    values: { sell: 125 }, condition: 0.5, repairing: false,
    authenticity: { identified: false },
    archivePermission: { allowed: true }, authenticationPermission: { allowed: true, cost: 10 },
  };
  type ActionProps = {
    label: string; disabled: boolean; disabledReason?: string; onClick: () => void;
    item?: typeof work; act?: unknown;
  };
  const onAction = t.mock.fn();
  const actions = runInNewContext(`${handlers}\nact = onAction;\ncollectionItemActions(work)`, {
    React, work, pending: false, now: Date.now(), player: { repairingCap: 5 }, repairingCount: 0,
    onAction,
    historianQuestsForItem: () => [{}], historianSubmissionDisabledReason: () => undefined,
    tagItemAction: () => null, permanentItemAction: () => null,
  }) as React.ReactElement<{ children: React.ReactElement<ActionProps>[] }>;
  const props = actions.props.children.filter(Boolean).map(child => child.props);
  assert.equal(props.find(action => action.label === "Modify attributes")?.disabled, false);
  for (const label of ["Offer to Art Collectors", "Put up for auction",
    "Sell for $125", "Donate for Karma", "Send to Historian"]) {
    assert.equal(props.find(action => action.label === label)?.disabled, true, label);
    assert.match(props.find(action => action.label === label)?.disabledReason ?? "", /^Featured works and works in your permanent collection can't be /);
  }
  assert.equal(props.some(action => action.label === "Stop featuring"), false);
  const repair = actions.props.children.find(child => child?.props.label === "Repair item")!;
  assert.equal(repair.props.disabled, true);
  assert.match(repair.props.disabledReason!, /cannot be repaired while being featured/i);
  const repairButton = (repair.type as (props: typeof repair.props) => React.ReactElement<{
    onClick: () => void; "aria-disabled": boolean; "aria-label": string; "data-tooltip": string;
  }>)(repair.props);
  assert.equal(repairButton.props["aria-disabled"], true);
  assert.match(repairButton.props["aria-label"], /cannot be repaired while being featured/i);
  assert.match(repairButton.props["data-tooltip"], /cannot be repaired while being featured/i);
  repairButton.props.onClick();
  assert.equal(onAction.mock.callCount(), 0);
  const authentic = actions.props.children.find(child => child?.props.item === work)!;
  const authenticated = (authentic.type as (props: typeof authentic.props) => React.ReactElement<{
    children: React.ReactElement<ActionProps>;
  }>)(authentic.props);
  assert.equal(authenticated.props.children.props.disabled, false);
});

test("promoted selections block bulk disposal and Collector offerings without changing archive permissions", () => {
  for (const { original, permanent } of [
    { original: false, permanent: false }, { original: true, permanent: false },
    { original: false, permanent: true },
  ]) {
    const work = {
      ...item("promoted"), status: "displayed", revealed: true, original, permanent, tags: [],
      condition: 0.5, artwork: { title: "Work" }, archivePermission: { allowed: !original && !permanent },
    };
    const { availability } = runInNewContext(`${handlers}\ngetCollectionBulkState(options)`, {
      canQuickSellItem, planGallerySelection, getArchivePermission, getUnfulfilledHistorianTargetIds,
      options: { collectionItems: [work], selectedItems: [work], displayCap: 5,
        quests: [{ _id: "quest", target: [work.artwork_id] }], repairingCap: 5, repairingCount: 0 },
    }) as { availability: Record<string, { allowed: boolean; reason?: string }> };
    for (const action of ["sell", "donate", "collector-sale", "historian"]) {
      assert.equal(availability[action].allowed, false, action);
      assert.match(availability[action].reason!, /^Featured works and works in your permanent collection can't be /);
    }
    assert.equal(availability.archive.allowed, !original && !permanent);
    assert.equal(availability.repair.allowed, false);
    assert.match(availability.repair.reason!, /cannot be repaired while being featured/i);
  }
});

test("protected work buttons share action-specific hover and accessibility messages in both layouts", () => {
  let inventoryActions: ts.ArrowFunction | undefined;
  function findInventoryActions(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "InventorySection") {
      const actions = node.attributes.properties.find(
        (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === "actions",
      );
      if (actions && ts.isJsxAttribute(actions) && actions.initializer &&
        ts.isJsxExpression(actions.initializer) && actions.initializer.expression &&
        ts.isArrowFunction(actions.initializer.expression)) {
        inventoryActions = actions.initializer.expression;
      }
    }
    ts.forEachChild(node, findInventoryActions);
  }
  findInventoryActions(dashboard);
  assert.ok(inventoryActions);
  const inventoryRenderer = ts.transpileModule(
    `const inventoryActions = ${inventoryActions.getText(source)};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } },
  ).outputText;
  type ActionProps = { label: string; disabled: boolean; disabledReason?: string; onClick: () => void };
  type ButtonProps = {
    "aria-disabled": boolean; "aria-label": string; "data-tooltip": string; onClick: () => void;
  };
  for (const { status, original, permanent, pending } of [
    { status: "claimed", original: false, permanent: true, pending: false },
    { status: "displayed", original: false, permanent: false, pending: false },
    { status: "displayed", original: false, permanent: true, pending: true },
    { status: "claimed", original: true, permanent: true, pending: true },
  ]) {
    const work = {
      ...item("permanent"), status, original, permanent, tags: [], condition: 0.5,
      repairing: false, values: { sell: 125 },
      archivePermission: { allowed: false, reason: "Works in your permanent collection can't be archived." },
    };
    const context = {
      React, work, pending, items: [work], now: Date.now(),
      player: { displayCap: 5, repairingCap: 5, bankBalance: 1_000 },
      repairingCount: 0, historianQuestsForItem: () => [],
      getDisplayPermission: () => ({ allowed: true }),
      tagItemAction: () => null, permanentItemAction: () => null,
    };
    for (const render of ["collectionItemActions(work)", "inventoryActions(work)"]) {
      const actions = runInNewContext(`${handlers}\n${inventoryRenderer}\n${render}`, { ...context }) as
        React.ReactElement<{ children: React.ReactElement<ActionProps>[] }>;
      const expected = {
        "Sell for $125": "Featured works and works in your permanent collection can't be sold.",
        "Donate for Karma": "Featured works and works in your permanent collection can't be donated.",
        "Offer to Art Collectors": "Featured works and works in your permanent collection can't be sold to Art Collectors.",
        "Put up for auction": "Featured works and works in your permanent collection can't be auctioned.",
        "Send to Historian": "Featured works and works in your permanent collection can't be sent to the Historian.",
        ...(status === "claimed" ? {
          "Archive permanently": "Works in your permanent collection can't be archived.",
        } : {}),
      };
      for (const [label, reason] of Object.entries(expected)) {
        const action = actions.props.children.find(child => child?.props.label === label)!;
        assert.ok(action, `${render}: ${label}`);
        assert.equal(action.props.disabled, true, label);
        assert.equal(action.props.disabledReason, reason, label);
        const button = (action.type as (props: ActionProps) => React.ReactElement<ButtonProps>)(action.props);
        assert.equal(button.props["aria-disabled"], true);
        assert.equal(button.props["data-tooltip"], reason);
        assert.equal(button.props["aria-label"], `${label}. Unavailable: ${reason}`);
        button.props.onClick();
      }
    }
  }
});

test("bulk permanent restrictions use the same action-specific wording, including Originals", () => {
  for (const status of ["claimed", "displayed"]) {
    for (const original of [false, true]) {
      const work = {
        ...item("permanent"), status, original, permanent: true, tags: [], revealed: true,
        condition: 0.5, artwork: { title: "Work" },
      };
      const { availability } = runInNewContext(`${handlers}\ngetCollectionBulkState(options)`, {
        canQuickSellItem, planGallerySelection, getArchivePermission, getUnfulfilledHistorianTargetIds,
        options: { collectionItems: [work], selectedItems: [work], displayCap: 5,
          quests: [], repairingCap: 5, repairingCount: 0 },
      }) as { availability: Record<string, { allowed: boolean; reason?: string }> };
      for (const [action, reason] of Object.entries({
        sell: "Featured works and works in your permanent collection can't be sold.",
        donate: "Featured works and works in your permanent collection can't be donated.",
        "collector-sale": "Featured works and works in your permanent collection can't be sold to Art Collectors.",
        historian: "Featured works and works in your permanent collection can't be sent to the Historian.",
        archive: "Works in your permanent collection can't be archived.",
      })) {
        assert.equal(availability[action].allowed, false, action);
        assert.equal(availability[action].reason, reason, action);
      }
    }
  }
});

test("Collector offer removal stays available and ordinary pending actions retain their busy reason", () => {
  const work = {
    ...item("work"), status: "claimed", permanent: true, original: true,
    tags: ["for sale"], values: { sell: 125 }, condition: 0.5,
    archivePermission: { allowed: false },
  };
  const context = {
    React, work, pending: false, now: Date.now(), player: { repairingCap: 5 }, repairingCount: 0,
    historianQuestsForItem: () => [{}], tagItemAction: () => null, permanentItemAction: () => null,
  };
  type ActionProps = { label: string; disabled: boolean; disabledReason?: string; onClick: () => void };
  function donationAndCollectorActions() {
    return runInNewContext(`${handlers}\ncollectionItemActions(work)`, context) as
      React.ReactElement<{ children: React.ReactElement<ActionProps>[] }>;
  }
  const stopOffering = donationAndCollectorActions().props.children.find(
    child => child?.props.label === "Stop offering to Art Collectors",
  )!;
  assert.equal(stopOffering.props.disabled, false);
  assert.equal(stopOffering.props.disabledReason, undefined);
  Object.assign(work, { permanent: false, original: false });
  context.pending = true;
  const donation = donationAndCollectorActions().props.children.find(
    child => child?.props.label === "Donate for Karma",
  )!;
  assert.equal(donation.props.disabled, true);
  const button = (donation.type as (props: ActionProps) => React.ReactElement<{
    "data-tooltip": string;
  }>)(donation.props);
  assert.equal(button.props["data-tooltip"], "Another action is being processed.");
});

test("permanent selections can be promoted and promoted permanent works consume capacity", () => {
  const work = {
    ...item("permanent"), revealed: true, status: "claimed", permanent: true, tags: [],
    condition: 0.5, artwork: { title: "Work" }, archivePermission: { allowed: false },
  };
  const evaluate = (collectionItems: unknown[]) => runInNewContext(`${handlers}\ngetCollectionBulkState(options)`, {
    canQuickSellItem, planGallerySelection, getArchivePermission, getUnfulfilledHistorianTargetIds,
    options: { collectionItems, selectedItems: [work], displayCap: 1,
      quests: [], repairingCap: 5, repairingCount: 0 },
  }) as { availability: Record<string, { allowed: boolean; reason?: string }> };
  const available = evaluate([work]).availability;
  assert.equal(available.display.allowed, true);
  assert.equal(available["set-gallery"].allowed, true);
  const full = evaluate([work, { ...work, _id: "other", artwork_id: "other-art", status: "displayed" }]).availability;
  assert.equal(full.display.allowed, false);
  assert.match(full.display.reason!, /gallery limit/i);
  assert.equal(full["set-gallery"].allowed, true);
});

test("promoted permanent works appear once in the collection and in the promoting section", () => {
  const statements = dashboard.body!.statements.filter(statement =>
    ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration =>
      ["inventory", "displayed", "collectionItems"].includes(declaration.name.getText(source)),
    ),
  ).map(statement => statement.getText(source)).join("\n");
  const code = ts.transpileModule(statements, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const items = [
    { ...item("permanent"), status: "displayed", permanent: true },
    { ...item("promoted"), status: "displayed", permanent: false },
    { ...item("stored"), status: "claimed", permanent: true },
    { ...item("auctioned"), status: "auctioned", permanent: false },
  ];
  const state = runInNewContext(`${code}\n({ inventory, displayed, collectionItems })`, {
    items, useMemo: (getItems: () => unknown) => getItems(),
  }) as Record<string, HydratedGameItem[]>;
  assert.deepEqual([...state.displayed].map(item => item._id), ["permanent", "promoted"]);
  assert.deepEqual([...state.inventory].map(item => item._id), ["stored", "auctioned"]);
  assert.equal(state.collectionItems.length, 4);
  assert.equal(new Set(state.collectionItems.map(item => item._id)).size, 4);
});

test("gallery format and visitor visibility changes update shared preferences and persist through the settings queue", async () => {
  const changed: string[] = [];
  const visibility: boolean[] = [];
  const requests: { url: string; settings: unknown }[] = [];
  const queue = { current: Promise.resolve() };
  const save = runInNewContext(`${handlers}\nsaveViewSettings`, {
    setPreferredGalleryView: (mode: string) => changed.push(mode),
    setGalleryVisitorsVisible: (visible: boolean) => visibility.push(visible),
    viewSettingsSaveQueue: queue,
    setError: (message: string) => assert.fail(message),
    fetch: async (url: string, options: { body: string }) => {
      requests.push({ url, settings: JSON.parse(options.body) });
      return Response.json({ status: "ok" });
    },
  }) as (settings: Record<string, unknown>) => void;
  save({ galleryView: "list" });
  save({ galleryView: "expanded" });
  save({ gallerySort: "name" });
  save({ showGalleryVisitors: false });
  save({ showGalleryVisitors: true });
  assert.deepEqual(changed, ["list", "expanded"]);
  assert.deepEqual(visibility, [false, true]);
  await queue.current;
  assert.deepEqual(requests.map(({ settings }) => settings), [
    { galleryView: "list" }, { galleryView: "expanded" }, { gallerySort: "name" },
    { showGalleryVisitors: false }, { showGalleryVisitors: true },
  ]);
  assert.ok(requests.every(({ url }) => url === "/api/play/view-settings"));
});

function item(id: string, rarity = "masterpiece") {
  return {
    _id: id,
    artwork_id: `art-${id}`,
    artwork: { rarity },
    status: "unclaimed",
    revealed: false,
  } as HydratedGameItem;
}

function archiveOffer(id: string, overrides: Partial<HydratedGameItem> = {}): HydratedGameItem {
  return {
    ...item(id, "common"), revealed: true, tags: [], original: false, permanent: false, repairing: false,
    mint: false, foil: false, unlocked: false, seasonal: false, lottery: 0, vintage: false,
    authenticity: { forgery: false, identified: false }, values: { actual: 100, dealer: 20 },
    ...overrides,
  } as HydratedGameItem;
}

const unprotectedBulkSettings: BulkSaleProtections = {
  keptArtStyleIds: [], keepRares: false, keepLegendaries: false, keepMasterpieces: false,
  keepUnfoundQuestTargets: false, keepUnarchived: false,
};

function createHarness(t: TestContext) {
  type Update<T> = T | ((current: T) => T);
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const responses = new Map<string, (response: Response) => void>();
  let sequence = 0;
  const state = {
    enableReveals: true,
    revealedOfferIds: new Set<string>(),
    pendingOfferReveals: new Set<string>(),
    offerRevealTransitions: {} as Record<string, number | "burst">,
    offerRevealItem: null as HydratedGameItem | null,
    revealingOfferBatch: false,
    offerRevealError: "",
    error: "",
  };
  function setter<Key extends keyof typeof state>(key: Key) {
    return t.mock.fn((update: Update<(typeof state)[Key]>) => {
      state[key] = typeof update === "function" ? update(state[key]) : update;
    });
  }
  const setters = {
    setRevealedOfferIds: setter("revealedOfferIds"),
    setPendingOfferReveals: setter("pendingOfferReveals"),
    setOfferRevealTransitions: setter("offerRevealTransitions"),
    setOfferRevealItem: setter("offerRevealItem"),
    setRevealingOfferBatch: setter("revealingOfferBatch"),
    setOfferRevealError: setter("offerRevealError"),
    setError: setter("error"),
  };
  const context = {
    ...setters,
    AbortController,
    offerRevealThresholds: DEFAULT_OFFER_REVEAL_THRESHOLDS,
    getOfferRevealTier,
    getArtworkImageUrl,
    isOfferRevealed,
    offerRevealRequests: { current: new Map<string, AbortController>() },
    offerRevealTimers: { current: new Map<string, number>() },
    offerRevealMounted: { current: true },
    offerRevealContext: { current: 0 },
    offerRevealSection: { current: "loot" },
    offerRevealQueue: { current: [] as HydratedGameItem[] },
    router: { refresh: t.mock.fn() },
    window: {
      Image: class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(value: string) {
          if (value) queueMicrotask(() => this.onload?.());
        }
        decode() { return Promise.resolve(); }
      },
      setTimeout(callback: () => void, delay: number) {
        timers.set(++sequence, { callback, delay });
        return sequence;
      },
      clearTimeout(id: number) { timers.delete(id); },
    },
    fetch: t.mock.fn((url: string, { signal }: { signal: AbortSignal }) =>
      new Promise<Response>((resolve, reject) => {
        responses.set(decodeURIComponent(url.split("/").at(-2)!), resolve);
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }),
    ),
  };
  Object.keys(state).forEach((key) => Object.defineProperty(context, key, {
    get: () => state[key as keyof typeof state],
  }));
  const api = runInNewContext(
    `${handlers}\n({ revealSelectedOffers, requestOfferReveal, confirmOfferReveal, clearOfferRevealTransitions })`,
    context,
  ) as {
    revealSelectedOffers: (items: HydratedGameItem[]) => Promise<void>;
    requestOfferReveal: (item: HydratedGameItem) => void;
    confirmOfferReveal: () => Promise<void>;
    clearOfferRevealTransitions: () => void;
  };
  return {
    ...context, ...api, state, timers,
    respond(id: string, error?: string) {
      assert.ok(responses.has(id), `Missing reveal request for ${id}`);
      responses.get(id)!(Response.json(
        error ? { error } : { itemId: id, revealed: true },
        { status: error ? 409 : 200 },
      ));
      responses.delete(id);
    },
  };
}

test("large mixed top-tier batches publish results, animate, and refresh once", async (t) => {
  const h = createHarness(t);
  const items = Array.from({ length: 100 }, (_, index) =>
    item(`${index}`, index < 80 ? "masterpiece" : "legendary"),
  );
  const revealing = h.revealSelectedOffers(items);
  assert.equal(h.fetch.mock.callCount(), items.length);
  assert.equal(h.setPendingOfferReveals.mock.callCount(), 1);
  assert.equal(h.state.revealingOfferBatch, true);
  for (const work of [...items].reverse()) h.respond(work._id);
  await revealing;

  assert.equal(h.setRevealedOfferIds.mock.callCount(), 1);
  assert.equal(h.setOfferRevealTransitions.mock.callCount(), 1);
  assert.equal(h.setPendingOfferReveals.mock.callCount(), 2);
  assert.equal(h.router.refresh.mock.callCount(), 1);
  assert.equal(h.state.revealedOfferIds.size, items.length);
  assert.equal(h.state.pendingOfferReveals.size, 0);
  assert.equal(h.offerRevealRequests.current.size, 0);
  assert.equal(h.state.revealingOfferBatch, false);
  assert.equal(h.state.offerRevealItem, null);
  for (const work of items) {
    assert.equal(h.state.offerRevealTransitions[work._id], work.artwork.rarity === "masterpiece" ? "burst" : 2);
  }
  assert.deepEqual([...h.timers.values()].map(({ delay }) => delay), [120]);
  for (const timer of h.timers.values()) timer.callback();
  assert.equal(Object.keys(h.state.offerRevealTransitions).length, 0);
  assert.equal(h.offerRevealTimers.current.size, 0);
  assert.equal(h.setOfferRevealTransitions.mock.callCount(), 2);
});

test("partial batch failures keep successful reveals and allow the failed item to retry", async (t) => {
  const h = createHarness(t);
  const items = [item("a"), item("b"), item("c")];
  const revealing = h.revealSelectedOffers(items);
  h.respond("a");
  h.respond("b", "Try this offer again.");
  h.respond("c");
  await revealing;
  assert.deepEqual([...h.state.revealedOfferIds], ["a", "c"]);
  assert.equal(h.state.error, "Try this offer again.");
  assert.equal(h.state.pendingOfferReveals.size, 0);
  assert.equal(h.router.refresh.mock.callCount(), 1);

  h.requestOfferReveal(items[1]);
  assert.equal(h.state.offerRevealItem?._id, "b");
  const retrying = h.confirmOfferReveal();
  h.respond("b");
  await retrying;
  assert.equal(h.state.revealedOfferIds.size, 3);
  assert.equal(h.state.error, "");
  assert.equal(h.state.offerRevealItem, null);
  assert.equal(h.state.offerRevealTransitions.b, 3);
  assert.equal(h.fetch.mock.callCount(), 4);
  assert.equal(h.router.refresh.mock.callCount(), 2);
});

test("switching sections during a bulk reveal does not restart reveal animations", async (t) => {
  const h = createHarness(t);
  const revealing = h.revealSelectedOffers([item("a"), item("b")]);
  h.clearOfferRevealTransitions();
  h.offerRevealSection.current = "profile";
  h.respond("a");
  h.respond("b");
  await revealing;
  assert.equal(h.state.revealedOfferIds.size, 2);
  assert.equal(Object.keys(h.state.offerRevealTransitions).length, 0);
  assert.equal(h.setOfferRevealTransitions.mock.callCount(), 1);
  assert.equal(h.offerRevealTimers.current.size, 0);
  assert.equal(h.state.revealingOfferBatch, false);
});

test("unmounting aborts a pending batch without publishing results or refreshing", async (t) => {
  const h = createHarness(t);
  const revealing = h.revealSelectedOffers([item("a"), item("b")]);
  h.offerRevealMounted.current = false;
  h.offerRevealRequests.current.forEach((request) => request.abort());
  await revealing;
  assert.equal(h.setRevealedOfferIds.mock.callCount(), 0);
  assert.equal(h.setOfferRevealTransitions.mock.callCount(), 0);
  assert.equal(h.setPendingOfferReveals.mock.callCount(), 1);
  assert.equal(h.router.refresh.mock.callCount(), 0);
  assert.equal(h.offerRevealRequests.current.size, 0);
  assert.equal(h.timers.size, 0);
});

async function dashboardAction(fetchResponse: () => Promise<Response>) {
  const errors: string[] = [];
  const notices: string[] = [];
  const dialogs: unknown[] = [];
  const transitions: Promise<void>[] = [];
  let refreshed = 0;
  let succeeded = 0;
  const act = runInNewContext(`${handlers}\nact`, {
    fetch: fetchResponse,
    setError: (message: string) => errors.push(message),
    setNotice: (message: string) => notices.push(message),
    setActionDialog: (dialog: unknown) => dialogs.push(dialog),
    startTransition: (work: () => Promise<void>) => transitions.push(work()),
    router: { refresh: () => { refreshed++; } },
  }) as (url: string, onSuccess: () => void) => void;
  act("/api/play/items/favorite/permanent", () => { succeeded++; });
  await Promise.all(transitions);
  return { errors, notices, dialogs, refreshed, succeeded };
}

test("dashboard actions report empty or malformed server responses without crashing", async (t) => {
  for (const [label, body, status] of [
    ["empty error", null, 500],
    ["HTML error", "<html>Bad gateway</html>", 502],
    ["empty success", null, 200],
    ["invalid JSON success", "{", 200],
    ["JSON null", "null", 200],
  ] as const) {
    await t.test(label, async () => {
      const result = await dashboardAction(async () => new Response(body, { status }));
      assert.match(result.errors.at(-1) ?? "", new RegExp(`HTTP ${status}`));
      assert.match(result.errors.at(-1) ?? "", /refresh/i);
      assert.equal(result.succeeded, 0);
      assert.equal(result.refreshed, 0);
      assert.deepEqual(result.dialogs, []);
      assert.deepEqual(result.notices, [""]);
    });
  }
});

test("dashboard actions retain structured server errors", async () => {
  const result = await dashboardAction(async () => Response.json({
    error: "Your 12-item permanent collection is full.",
  }, { status: 409 }));
  assert.equal(result.errors.at(-1), "Your 12-item permanent collection is full.");
  assert.equal(result.succeeded, 0);
  assert.equal(result.refreshed, 0);
});

test("dashboard actions preserve successful notices, dialogs, callbacks and refreshes", async () => {
  const actionDialog = { title: "Artwork updated", message: "Done." };
  const result = await dashboardAction(async () => Response.json({
    message: "Added to your permanent collection.", actionDialog,
  }));
  assert.deepEqual(result.errors, [""]);
  assert.equal(result.notices.at(-1), "Added to your permanent collection.");
  assert.deepEqual(result.dialogs, [actionDialog]);
  assert.equal(result.succeeded, 1);
  assert.equal(result.refreshed, 1);
});

test("dashboard actions handle network failures without rejecting the React transition", async () => {
  const result = await dashboardAction(async () => { throw new TypeError("fetch failed"); });
  assert.match(result.errors.at(-1) ?? "", /could not be completed/i);
  assert.equal(result.succeeded, 0);
  assert.equal(result.refreshed, 0);
});
