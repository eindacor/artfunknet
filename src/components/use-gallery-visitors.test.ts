import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { getVisitorSocialBatteryCost } from "../server/social-battery.ts";
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
  for (const [relative, handler, guard] of [
    ["../app/play/game-dashboard.tsx", "meetGalleryVisitor", "galleryVisitorDisabled"],
    ["../app/play/galleries/gallery-explorer.tsx", "meetVisitor", "visitorDisabled"],
  ]) {
    const source = ts.createSourceFile(relative, await readFile(new URL(relative, import.meta.url), "utf8"),
      ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let callback: string | undefined;
    let sceneHandler: string | undefined;
    const functions = new Map<string, string>();
    function visit(node: ts.Node) {
      if (ts.isFunctionDeclaration(node) && node.name && [handler, guard].includes(node.name.text)) {
        functions.set(node.name.text, node.getText(source));
      }
      if (ts.isJsxAttribute(node) && node.name.getText(source) === "onClick" &&
          node.initializer && ts.isJsxExpression(node.initializer) &&
          node.initializer.expression?.getText(source).includes(`${handler}(npc._id)`)) {
        callback = node.initializer.expression.getText(source);
      }
      if (ts.isJsxAttribute(node) && node.name.getText(source) === "onMeetVisitor" &&
          node.initializer && ts.isJsxExpression(node.initializer)) {
        sceneHandler = node.initializer.expression?.getText(source);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.ok(callback, `Missing visitor interaction handler in ${relative}`);
    assert.ok(functions.has(handler) && functions.has(guard), `Missing shared visitor handler or guard in ${relative}`);
    assert.equal(sceneHandler, handler, "Scene and button interactions must use the same handler");
    const compiled = ts.transpileModule(`${[...functions.values()].join("\n")}\nconst click = ${callback};`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    for (const tutorial of [false, true]) {
      for (const success of [false, true]) {
        const markVisitorMet = test.mock.fn();
        const removeVisitor = test.mock.fn();
        const refreshVisitors = test.mock.fn();
        const npc = { _id: "visitor", tutorial, quality: "bronze", alreadyMet: false };
        const meet = test.mock.fn(async (visitor: typeof npc) => {
          assert.equal(visitor, npc);
          return success;
        });
        const click = runInNewContext(`${compiled}\nclick`, {
          npc, galleryVisitors: [npc], visitors: [npc],
          meetNpc: meet, onMeetNpc: meet, getVisitorSocialBatteryCost,
          pending: false, meetingNpc: null, socialBattery: 100, npcRewardEffects: {},
          ownerId: "player", viewerId: "player", gallery: null,
          meetingGalleryVisitor: { current: false }, meetingVisitor: { current: false },
          markVisitorMet, removeVisitor, refreshVisitors,
        }) as () => void;
        click();
        await new Promise<void>(resolve => setImmediate(resolve));
        assert.equal(meet.mock.callCount(), 1);
        assert.equal(markVisitorMet.mock.callCount(), success ? 1 : 0);
        assert.equal(removeVisitor.mock.callCount(), !success && !tutorial ? 1 : 0);
        assert.equal(refreshVisitors.mock.callCount(), success ? 0 : 1);
      }
    }
  }
});
