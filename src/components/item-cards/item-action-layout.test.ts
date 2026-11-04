import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

import {
  Children,
  createElement,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as tutorialElements from "../../shared/tutorial.ts";

const source = await readFile(new URL("./item-action-layout.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { ItemActionLayout, getRenderedActionGuide } = runInNewContext(
  `${compiled}\n({ ItemActionLayout: exports.default, getRenderedActionGuide })`, {
  exports: {},
  require: (id: string) => id === "@/shared/tutorial" ? tutorialElements : createRequire(import.meta.url)(id),
}) as {
  ItemActionLayout: (props: { actions?: ReactNode; showHelp?: boolean }) => ReactElement | null;
  getRenderedActionGuide: (container: Element | null) => readonly (readonly [string, string, string])[];
};

function guideForIcons(icons: Iterable<string>) {
  return getRenderedActionGuide({
    querySelectorAll: () => Array.from(icons, icon => ({ classList: ["fa", icon] })),
  } as unknown as Element);
}

function Action({ id }: { id: string; destructive?: boolean }) {
  return createElement("button", { id }, id);
}

function actionKeys(layout: ReactNode) {
  const keys = new Map<string, string | null>();
  function visit(children: ReactNode) {
    Children.forEach(children, (child) => {
      if (!isValidElement<{ id: string; children?: ReactNode }>(child)) return;
      if (child.type === Action) keys.set(child.props.id, child.key);
      else visit(child.props.children);
    });
  }
  visit(layout);
  return keys;
}

test("a single helper-created action renders without a missing-key warning", (t) => {
  const errors = t.mock.method(console, "error", () => {});
  const html = renderToStaticMarkup(createElement(ItemActionLayout, {
    actions: createElement(Action, { id: "tags" }),
  }));
  assert.match(html, /<button id="tags">tags<\/button>/);
  assert.equal(errors.mock.callCount(), 0);
});

test("nested fragments preserve action grouping and scope repeated local keys", (t) => {
  const errors = t.mock.method(console, "error", () => {});
  const first = createElement(Fragment, { key: "first" },
    createElement(Action, { id: "first-tags", key: "tags" }),
    createElement(Action, { id: "sell", destructive: true, key: "remove" }),
  );
  const second = createElement(Fragment, { key: "second" },
    createElement(Fragment, null,
      createElement(Action, { id: "second-tags", key: "tags" }),
      false,
      null,
    ),
  );
  const layout = ItemActionLayout({ actions: [first, second] });
  const keys = actionKeys(layout);
  assert.equal(keys.size, 3);
  assert.ok([...keys.values()].every((key) => key !== null));
  assert.equal(new Set(keys.values()).size, keys.size);
  const reordered = actionKeys(ItemActionLayout({ actions: [second, first] }));
  for (const [id, key] of keys) assert.equal(reordered.get(id), key);

  const html = renderToStaticMarkup(layout);
  const nonDestructive = html.match(/<section aria-label="Non-destructive actions"[^>]*>(.*?)<\/section>/)![1];
  const destructive = html.match(/<section aria-label="Destructive actions"[^>]*>(.*?)<\/section>/)![1];
  assert.match(nonDestructive, /first-tags/);
  assert.match(nonDestructive, /second-tags/);
  assert.doesNotMatch(nonDestructive, /id="sell"/);
  assert.match(destructive, /id="sell"/);
  assert.equal(errors.mock.callCount(), 0);
});

test("the preview action guide is opt-in and does not create controls for an empty card", () => {
  const actions = createElement(Action, { id: "tags" });
  assert.doesNotMatch(
    renderToStaticMarkup(createElement(ItemActionLayout, { actions })),
    /Artwork action guide|role="tooltip"/,
  );
  assert.equal(ItemActionLayout({ showHelp: true }), null);
});

test("the accessible preview guide does not expose unrelated entries before reading its controls", () => {
  const html = renderToStaticMarkup(createElement(ItemActionLayout, {
    actions: createElement(Action, { id: "tags" }),
    showHelp: true,
  }));
  const helpId = html.match(/aria-describedby="([^"]+)" aria-label="Artwork action guide"/)?.[1];
  assert.ok(helpId);
  assert.ok(html.includes(`id="${helpId}" popover="auto" role="tooltip"`));
  assert.doesNotMatch(html, /<li>|Offer actions may purchase or collect the work first/);
});

test("only rendered action icons receive help, including conditional authenticity and cosmetic actions", () => {
  const icons = (...values: string[]) => Array.from(guideForIcons(values), ([icon]) => icon);
  assert.deepEqual(icons("fa-plus", "fa-usd", "fa-archive"), ["fa-usd", "fa-archive", "fa-plus"]);
  assert.deepEqual(icons("fa-search", "fa-paint-brush"), ["fa-paint-brush", "fa-search"]);
  assert.deepEqual(icons("fa-undo", "fa-tags"), ["fa-undo", "fa-tags"]);
  assert.deepEqual(icons("fa-gavel", "fa-globe", "fa-times"), ["fa-gavel", "fa-times", "fa-globe"]);
  assert.deepEqual(icons("fa-tags", "fa-tags"), ["fa-tags"]);
  assert.deepEqual(icons("fa-info-circle"), []);
  assert.equal(getRenderedActionGuide(null).length, 0);
});

test("every current preview action has an explanation when its icon is rendered", async () => {
  const actionIcons = new Set<string>();
  const dashboard = ts.createSourceFile("game-dashboard.tsx",
    await readFile(new URL("../../app/play/game-dashboard.tsx", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const helpers = new Set([
    "archiveAction", "collectionGalleryAction", "tagItemAction", "permanentItemAction",
    "lootItemActions", "lootPrimaryAction", "collectionItemActions", "AuthenticityActions",
  ]);
  function collectIcons(node: ts.Node) {
    if (ts.isJsxAttribute(node) && ["icon", "className"].includes(node.name.getText()) &&
        node.initializer && ts.isStringLiteral(node.initializer)) {
      for (const token of node.initializer.text.split(" ")) {
        if (token.startsWith("fa-")) actionIcons.add(token);
      }
    }
    ts.forEachChild(node, collectIcons);
  }
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name && helpers.has(node.name.text)) collectIcons(node);
    else ts.forEachChild(node, visit);
  }
  visit(dashboard);
  const artStyle = ts.createSourceFile("art-style-action-button.tsx",
    await readFile(new URL("./art-style-action-button.tsx", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  collectIcons(artStyle);
  assert.ok(actionIcons.size >= 16, "Preview actions were found in the actual controls");
  const guideIcons = new Set(guideForIcons(actionIcons).map(([icon]) => icon));
  for (const icon of actionIcons) assert.ok(guideIcons.has(icon), `${icon} needs an action-guide explanation`);
});
