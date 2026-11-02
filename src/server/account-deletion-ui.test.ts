import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const Link = { default: ({ children, ...props }: { children: ReactNode; href: string }) =>
  createElement("a", props, children) };

async function load<T>(
  file: string,
  dependencies: Record<string, unknown>,
  globals: Record<string, unknown> = {},
  expose = "",
) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return runInNewContext(`${code}\n${expose}\nexports`, {
    exports: {}, console, ...globals,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }) as T;
}

type Element = ReactElement<Record<string, unknown>>;
function elements(node: ReactNode): Element[] {
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  const children = element.props.children as ReactNode;
  return [element, ...(Array.isArray(children) ? children : [children]).flatMap(elements)];
}

test("policy and deletion instructions render publicly without authentication or database dependencies", async () => {
  const dependencies = { "next/link": Link, "react/jsx-runtime": require("react/jsx-runtime") };
  const privacy = await load<typeof import("../app/privacy/page.tsx")>("../app/privacy/page.tsx", dependencies);
  const instructions = await load<typeof import("../app/data-deletion/page.tsx")>("../app/data-deletion/page.tsx", dependencies);
  const html = renderToStaticMarkup(createElement(privacy.default));
  assert.match(html, /Privacy policy/);
  assert.match(html, /instagram_business_basic/);
  assert.match(html, /do not currently offer separate Facebook-account login/);
  assert.match(html, /mailto:artfunkelgame@gmail.com/);
  assert.match(html, /href="\/data-deletion"/);
  assert.match(html, /manually deletes them/);
  const initial = renderToStaticMarkup(await instructions.default({ searchParams: Promise.resolve({}) }));
  assert.match(initial, /DELETE MY ACCOUNT/);
  assert.match(initial, /selling or winning an active auction/);
  assert.match(initial, /If you cannot sign in/);
  assert.doesNotMatch(initial, /Your artfunkel account and associated live game data have been deleted/);
  const deleted = renderToStaticMarkup(await instructions.default({ searchParams: Promise.resolve({ deleted: "1" }) }));
  assert.match(deleted, /role="status"/);
  assert.match(deleted, /have been deleted/);
});

test("the native confirmation dialog gates submission, prevents dismissal while busy, and handles errors and success", async () => {
  const values: unknown[] = [];
  let hook = 0;
  let cancelCount = 0;
  let redirected = "";
  let calls = 0;
  let requestBody = "";
  let complete!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => { complete = resolve; });
  let response = () => pending;
  const dialog = {
    open: false,
    showModal() { this.open = true; },
    close() { this.open = false; },
  };
  let effect: (() => (() => void)) | undefined;
  const component = await load<{
    dialog: (props: { onCancel: () => void }) => Element;
  }>("../app/play/account/delete-account-section.tsx", {
    "next/link": Link,
    "react/jsx-runtime": require("react/jsx-runtime"),
    react: {
      useRef: () => ({ current: dialog }),
      useEffect: (callback: () => (() => void)) => { effect = callback; },
      useState: (initial: unknown) => {
        const index = hook++;
        if (!(index in values)) values[index] = initial;
        return [values[index], (value: unknown) => { values[index] = value; }];
      },
    },
  }, {
    fetch: async (_url: string, options: RequestInit) => {
      calls++;
      requestBody = String(options.body);
      return response();
    },
    window: { location: { replace: (url: string) => { redirected = url; } } },
  }, "exports.dialog = DeleteAccountDialog;");
  const render = () => {
    hook = 0;
    return component.dialog({ onCancel: () => { cancelCount++; } });
  };
  let view = render();
  const cleanup = effect?.();
  assert.equal(dialog.open, true);
  const html = renderToStaticMarkup(view);
  assert.match(html, /Deleting your player also removes all synced-account information stored by artfunkel/);
  assert.match(html, /stored Patreon authorization/);
  const find = (type: string) => elements(view).find((element) => element.type === type)!;
  const confirmButton = () => elements(view).find((element) =>
    element.type === "button" && element.props.type === "submit")!;
  const submit = () => (find("form").props.onSubmit as (event: unknown) => Promise<void>)({
    preventDefault() {},
  });
  assert.equal(confirmButton().props.disabled, true);
  await submit();
  assert.equal(calls, 0);
  const change = (text: string) => {
    (find("input").props.onChange as (event: unknown) => void)({ target: { value: text } });
    view = render();
  };
  change("delete my account");
  assert.equal(confirmButton().props.disabled, true);
  change("DELETE MY ACCOUNT");
  assert.equal(confirmButton().props.disabled, false);
  const submitting = submit();
  view = render();
  assert.equal(confirmButton().props.disabled, true);
  assert.equal(find("input").props.disabled, true);
  (view.props.onCancel as (event: unknown) => void)({ preventDefault() {} });
  assert.equal(cancelCount, 0);
  assert.equal(JSON.parse(requestBody).confirmation, "DELETE MY ACCOUNT");
  complete(Response.json({ error: "You are winning an active auction." }, { status: 409 }));
  await submitting;
  view = render();
  assert.equal(confirmButton().props.disabled, false);
  assert.equal(elements(view).find((element) => element.props.role === "alert")?.props.children,
    "You are winning an active auction.");
  assert.equal(redirected, "");
  response = async () => Response.json({ status: "deleted" });
  await submit();
  assert.equal(redirected, "/data-deletion?deleted=1");
  assert.equal(calls, 2);
  cleanup?.();
  assert.equal(dialog.open, false);
});
