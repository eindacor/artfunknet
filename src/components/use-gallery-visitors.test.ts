import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { GalleryVisitorView } from "./use-gallery-visitors.ts";

const source = ts.createSourceFile("use-gallery-visitors.ts",
  await readFile(new URL("./use-gallery-visitors.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true);
const filter = source.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === "filterUnexpired")!;
const filterUnexpired = runInNewContext(`${ts.transpileModule(filter.getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText}\nfilterUnexpired`, { Date }) as (visitors: GalleryVisitorView[]) => GalleryVisitorView[];

test("tutorial visitors survive client expiration filtering until met while ordinary visitors keep their normal lifecycle", () => {
  const visitors = [
    { _id: "tutorial", tutorial: true, expiration: null, alreadyMet: false },
    { _id: "met-tutorial", tutorial: true, expiration: null, alreadyMet: true },
    { _id: "expired", expiration: new Date(0).toISOString(), alreadyMet: false },
    { _id: "ordinary", expiration: new Date(Date.now() + 60_000).toISOString(), alreadyMet: false },
    { _id: "met-ordinary", expiration: new Date(Date.now() + 60_000).toISOString(), alreadyMet: true },
  ] as GalleryVisitorView[];
  assert.deepEqual(filterUnexpired(visitors).map(visitor => visitor._id), ["tutorial", "ordinary", "met-ordinary"]);
  visitors[0].alreadyMet = true;
  assert.deepEqual(filterUnexpired(visitors).map(visitor => visitor._id), ["ordinary", "met-ordinary"]);
});

test("own and visited gallery controls retain failed tutorial interactions and mark successful interactions as met", async () => {
  for (const relative of ["../app/play/game-dashboard.tsx", "../app/play/galleries/gallery-explorer.tsx"]) {
    const source = ts.createSourceFile(relative, await readFile(new URL(relative, import.meta.url), "utf8"),
      ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let callback: string | undefined;
    function visit(node: ts.Node) {
      if (ts.isJsxAttribute(node) && node.name.getText(source) === "onClick" &&
          node.initializer && ts.isJsxExpression(node.initializer) &&
          node.initializer.expression?.getText(source).includes("markVisitorMet(npc._id)")) {
        callback = node.initializer.expression.getText(source);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.ok(callback, `Missing visitor interaction handler in ${relative}`);
    const compiled = ts.transpileModule(`const click = ${callback};`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    for (const tutorial of [false, true]) {
      for (const success of [false, true]) {
        const markVisitorMet = test.mock.fn();
        const removeVisitor = test.mock.fn();
        const refreshVisitors = test.mock.fn();
        const click = runInNewContext(`${compiled}\nclick`, {
          npc: { _id: "visitor", tutorial },
          meetNpc: async () => success, onMeetNpc: async () => success,
          markVisitorMet, removeVisitor, refreshVisitors,
        }) as () => Promise<void>;
        await click();
        assert.equal(markVisitorMet.mock.callCount(), success ? 1 : 0);
        assert.equal(removeVisitor.mock.callCount(), !success && !tutorial ? 1 : 0);
        assert.equal(refreshVisitors.mock.callCount(), success ? 0 : 1);
      }
    }
  }
});
