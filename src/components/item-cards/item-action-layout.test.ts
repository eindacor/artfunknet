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

const source = await readFile(new URL("./item-action-layout.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const ItemActionLayout = runInNewContext(`${compiled}\nexports.default`, {
  exports: {},
  require: createRequire(import.meta.url),
}) as (props: { actions: ReactNode }) => ReactElement;

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
