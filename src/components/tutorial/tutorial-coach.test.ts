import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { TutorialElement as Step, TUTORIAL_MESSAGES, type TutorialElement } from "../../shared/tutorial.ts";

type Element = {
  getClientRects: () => object[];
  contains: (candidate: Element) => boolean;
  getAttribute: (name: string) => string | null;
  matches: (selector: string) => boolean;
  title: string;
};
function element(visible = true, attributes: Record<string, string> = {}): Element {
  const result: Element = {
    getClientRects: () => visible ? [{}] : [],
    contains: candidate => candidate === result,
    getAttribute: name => attributes[name] ?? null,
    matches: () => "disabled" in attributes || attributes["aria-disabled"] === "true",
    get title() { return attributes.title ?? ""; },
  };
  return result;
}

const source = ts.createSourceFile("tutorial-coach.tsx",
  await readFile(new URL("./tutorial-coach.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const targetSource = source.statements.find(statement =>
  ts.isFunctionDeclaration(statement) && statement.name?.text === "findTarget")!;
const targetCode = ts.transpileModule(targetSource.getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const selector = (step: TutorialElement) => `[data-tutorial-element="${step}"]`;
const homeSelector = '[data-tutorial-navigation="collection"]';
const menuSelector = ".dashboard-navigation .responsive-menu-toggle";

function findTarget(elements: Map<string, Element[]>) {
  return runInNewContext(`${targetCode}\nfindTarget`, {
    Step, TUTORIAL_MESSAGES,
    document: { querySelectorAll: (query: string) => elements.get(query) ?? [] },
    getComputedStyle: () => ({ visibility: "visible" }),
  }) as (step: TutorialElement) => { element: Element; message: string; primary: boolean; step: TutorialElement };
}

test("the Feature step guides selection on Home and retargets the Feature button when it appears", () => {
  const inventory = element(), home = element(), feature = element();
  const elements = new Map([
    [selector(Step.TUTORIAL_SELECT_ITEM), [inventory]],
    [homeSelector, [home]],
  ]);
  const target = findTarget(elements);
  const fallback = target(Step.TUTORIAL_FEATURE_ITEM);
  assert.equal(fallback.element, inventory);
  assert.equal(fallback.primary, false);
  assert.equal(fallback.step, Step.TUTORIAL_FEATURE_ITEM);
  assert.match(fallback.message, /select/i);
  assert.doesNotMatch(fallback.message, /return home/i);

  elements.set(selector(Step.TUTORIAL_FEATURE_ITEM), [feature]);
  assert.equal(target(Step.TUTORIAL_FEATURE_ITEM).element, feature);
  assert.equal(target(Step.TUTORIAL_FEATURE_ITEM).primary, true);
  elements.delete(selector(Step.TUTORIAL_FEATURE_ITEM));
  assert.equal(target(Step.TUTORIAL_FEATURE_ITEM).element, inventory);
});

test("the Feature step keeps Home navigation guidance when the inventory is not visible", () => {
  const home = element(), menu = element();
  const elements = new Map([
    [selector(Step.TUTORIAL_SELECT_ITEM), [element(false)]],
    [homeSelector, [home]],
    [menuSelector, [menu]],
  ]);
  const target = findTarget(elements);
  assert.equal(target(Step.TUTORIAL_FEATURE_ITEM).element, home);
  elements.set(homeSelector, [element(false)]);
  assert.equal(target(Step.TUTORIAL_FEATURE_ITEM).element, menu);
});

test("the Feature selection fallback does not highlight inventory behind an open dialog", () => {
  const modal = element();
  const target = findTarget(new Map([
    [selector(Step.TUTORIAL_SELECT_ITEM), [element()]],
    [homeSelector, [element()]],
    ["dialog[open]", [modal]],
  ]));
  assert.equal(target(Step.TUTORIAL_FEATURE_ITEM).element, modal);
});

test("claim guidance stays in Offers when empty and retargets the Unclaimed tab or an available offer", () => {
  const offers = element(), navigation = element(), tab = element(), claim = element();
  const elements = new Map([
    [".loot-dashboard", [offers]],
    ['[data-tutorial-navigation="loot"]', [navigation]],
  ]);
  const target = findTarget(elements);
  const empty = target(Step.TUTORIAL_CLAIM_ITEM);
  assert.equal(empty.element, offers);
  assert.equal(empty.primary, false);
  assert.match(empty.message, /no unclaimed offers/i);
  assert.match(empty.message, /skip this step/i);
  assert.doesNotMatch(empty.message, /go to offers/i);
  elements.set('[data-tutorial-loot-category="unclaimed"]', [tab]);
  assert.equal(target(Step.TUTORIAL_CLAIM_ITEM).element, tab);
  assert.match(target(Step.TUTORIAL_CLAIM_ITEM).message, /choose unclaimed/i);
  elements.set(selector(Step.TUTORIAL_CLAIM_ITEM), [claim]);
  assert.equal(target(Step.TUTORIAL_CLAIM_ITEM).element, claim);
  assert.equal(target(Step.TUTORIAL_CLAIM_ITEM).primary, true);
});

test("missing collection controls guide selection on Home instead of navigating to the same page", () => {
  const inventory = element();
  const target = findTarget(new Map([
    [selector(Step.TUTORIAL_SELECT_ITEM), [inventory]],
    [homeSelector, [element()]],
  ]));
  for (const step of [Step.TUTORIAL_MODIFY_ITEM, Step.TUTORIAL_SEE_ACTION_INFO]) {
    const fallback = target(step);
    assert.equal(fallback.element, inventory);
    assert.equal(fallback.primary, false);
    assert.match(fallback.message, /select a work/i);
    assert.doesNotMatch(fallback.message, /return home/i);
  }
});

test("gallery steps guide Home navigation and the gallery button without prescribing item selection", () => {
  for (const step of [Step.TUTORIAL_GO_TO_GALLERY, Step.TUTORIAL_MEET_VISITOR]) {
    const home = element(), menu = element(), panel = element(), gallery = element();
    const elements = new Map([
      [homeSelector, [home]],
      [menuSelector, [menu]],
    ]);
    const target = findTarget(elements);
    assert.equal(target(step).element, home);
    assert.match(target(step).message, /return home.*go to your gallery/i);
    assert.doesNotMatch(target(step).message, /select/i);
    elements.set(homeSelector, [element(false)]);
    assert.equal(target(step).element, menu);
    assert.match(target(step).message, /open this menu.*return home.*go to your gallery/i);

    elements.set(".home-featured-panel", [panel]);
    elements.set(selector(Step.TUTORIAL_SELECT_ITEM), [
      element(true, { "data-tutorial-unavailable": "Your collection is empty." }),
    ]);
    assert.equal(target(step).element, panel);
    assert.match(target(step).message, /go to your gallery/i);
    assert.doesNotMatch(target(step).message, /return home|select|collection is empty/i);

    elements.set(selector(Step.TUTORIAL_GO_TO_GALLERY), [gallery]);
    assert.equal(target(step).element, gallery);
    assert.equal(target(step).primary, step === Step.TUTORIAL_GO_TO_GALLERY);
  }
});

test("default Home navigation does not add a selection requirement to unrelated steps", () => {
  const home = element();
  const target = findTarget(new Map([[homeSelector, [home]]]));
  for (const step of [Step.TUTORIAL_FILL_FEATURES, Step.TUTORIAL_MODIFY_ITEM]) {
    assert.equal(target(step).element, home);
    assert.match(target(step).message, /return home/i);
    assert.doesNotMatch(target(step).message, /select|gallery/i);
  }
});

test("attribute steps explain missing actions inside Modify instead of directing players behind the modal", () => {
  const modal = element(), attributes = element();
  modal.contains = candidate => candidate === modal || candidate === attributes;
  const target = findTarget(new Map([
    ["dialog[open]", [modal]],
    [selector(Step.TUTORIAL_SEE_MODIFY_ATTRIBUTES), [attributes]],
    [selector(Step.TUTORIAL_MODIFY_ITEM), [element()]],
    [homeSelector, [element()]],
  ]));
  for (const step of [Step.TUTORIAL_REROLL_ATTRIBUTE, Step.TUTORIAL_REROLL_VALUE]) {
    const fallback = target(step);
    assert.equal(fallback.element, attributes);
    assert.equal(fallback.primary, false);
    assert.match(fallback.message, /no suitable attributes/i);
    assert.match(fallback.message, /skip this step/i);
  }
});

test("disabled actions and empty or filtered collections explain their existing state and recover when available", () => {
  for (const scenario of [
    { step: Step.TUTORIAL_CLAIM_ITEM, attributes: { disabled: "", title: "Your inventory is currently full." } },
    { step: Step.TUTORIAL_FEATURE_ITEM, attributes: { disabled: "", title: "You have reached your featured-work limit." } },
    { step: Step.TUTORIAL_DAILY_CRATE, attributes: { disabled: "" } },
    { step: Step.TUTORIAL_REROLL_ATTRIBUTE,
      attributes: { "aria-disabled": "true", "data-tooltip": "You do not have enough money for this reroll." } },
    { step: Step.TUTORIAL_SELECT_ITEM,
      attributes: { "data-tutorial-unavailable": "No works match your collection filters." } },
  ]) {
    const attributes: Record<string, string> = { ...scenario.attributes };
    const control = element(true, attributes);
    const target = findTarget(new Map([[selector(scenario.step), [control]]]));
    const blocked = target(scenario.step);
    assert.equal(blocked.element, control);
    assert.equal(blocked.primary, false);
    assert.ok(blocked.message.startsWith(attributes["data-tutorial-unavailable"] || attributes["data-tooltip"] ||
      attributes.title || "This action isn't available right now."));
    assert.match(blocked.message, /skip this step/i);
    delete attributes.disabled;
    delete attributes["aria-disabled"];
    delete attributes["data-tutorial-unavailable"];
    assert.equal(target(scenario.step).primary, true);
    assert.equal(target(scenario.step).message, TUTORIAL_MESSAGES[scenario.step]);
  }
});
