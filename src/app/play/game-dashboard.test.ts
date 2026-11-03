import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test, { type TestContext } from "node:test";
import { runInNewContext as runInVm } from "node:vm";
import ts from "typescript";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { HydratedGameItem } from "../../server/item-artwork.ts";
import { getArtworkImageUrl } from "../../server/artwork-image-url.ts";
import { getBulkAcquisitionRequirements } from "../../server/bulk-acquisition.ts";
import { planGallerySelection } from "../../server/gallery-selection.ts";
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
} from "../../server/offer-reveal.ts";

function runInNewContext(code: string, context: Record<string, unknown>) {
  context.getItemDisposalPermission = getItemDisposalPermission;
  context.FEATURE_ARTWORK_DESCRIPTION = FEATURE_ARTWORK_DESCRIPTION;
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
  "renderFeaturedWork",
  "visitOwnGallery",
  "toggleCollectionItemSelection",
  "updateCollectionItemSelection",
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

test("featured cards select filtered-out works for the preview and visit their exact gallery position independently", () => {
  const featured = {
    ...item("featured"), status: "displayed", revealed: true,
    artwork: { title: "Featured Artwork", artist: "Artist", rarity: "rare", date: 2026 },
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
    offerRevealThresholds: DEFAULT_OFFER_REVEAL_THRESHOLDS,
    enableReveals: true, revealedOfferIds: new Set<string>(), isOfferRevealed,
    OfferThumbnail: () => null, ArtworkThumbnail: () => null,
    getArtworkThumbnailAdjustment: () => undefined,
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
      "aria-pressed": boolean; onClick: (event: typeof event) => void;
    }>[] }>;
  const [select, visit] = card.props.children;
  assert.equal(select.props["aria-pressed"], false);
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

test("unrevealed featured cards do not expose artwork names, artists, images, or values", () => {
  const featured = {
    ...item("hidden-featured"), status: "displayed", drop_chance_coefficient: 0.0001,
    artwork: { title: "Secret Title", artist: "Secret Artist", rarity: "rare", date: 2026 },
    values: { actual: 987_654 },
  };
  const card = runInNewContext(`${handlers}\nrenderFeaturedWork(featured)`, {
    React, getOfferRevealTier, featured,
    offerRevealThresholds: DEFAULT_OFFER_REVEAL_THRESHOLDS,
    enableReveals: true, revealedOfferIds: new Set<string>(), isOfferRevealed,
    selectedCollectionItemIdsSet: new Set([featured._id]),
    OfferThumbnail: ({ children }: { children: React.ReactNode }) => React.createElement("button", null, children),
    cancelCollectionItemLongPress() {}, moveCollectionItemLongPress() {},
  }) as React.ReactElement;
  const html = renderToStaticMarkup(card);
  assert.doesNotMatch(html, /Secret Title|Secret Artist|987,654|<img|artwork-thumbnail/);
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
    exports: {}, require: createRequire(import.meta.url),
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
    ...item("dealer"), status: "for_sale", values: { dealer: 100 },
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
    ...item("original", "common"), original: true, permanent: false, status: "claimed",
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
    ...item("permanent"), status: "claimed", permanent: true, tags: [],
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

test("gallery format changes update the section-remount preference and persist through the settings queue", async () => {
  const changed: string[] = [];
  const requests: { url: string; settings: unknown }[] = [];
  const queue = { current: Promise.resolve() };
  const save = runInNewContext(`${handlers}\nsaveViewSettings`, {
    setPreferredGalleryView: (mode: string) => changed.push(mode),
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
  assert.deepEqual(changed, ["list", "expanded"]);
  await queue.current;
  assert.deepEqual(requests.map(({ settings }) => settings), [
    { galleryView: "list" }, { galleryView: "expanded" }, { gallerySort: "name" },
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
