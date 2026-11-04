import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import * as tutorial from "../../shared/tutorial.ts";
import { TutorialElement as Step, type TutorialProgress } from "../../shared/tutorial.ts";

type TutorialContext = ReturnType<typeof import("./tutorial-provider.tsx").useTutorial>;
const require = createRequire(import.meta.url);
const providerCode = ts.transpileModule(
  await readFile(new URL("./tutorial-provider.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
const dashboardSource = ts.createSourceFile("game-dashboard.tsx",
  await readFile(new URL("../../app/play/game-dashboard.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const dashboard = dashboardSource.statements.find((statement): statement is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(statement) && statement.name?.text === "GameDashboard")!;
const offersEffect = dashboard.body!.statements.find(statement =>
  ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) &&
  statement.expression.expression.getText(dashboardSource) === "useEffect" &&
  statement.getText(dashboardSource).includes("TUTORIAL_SEE_OFFERS"))!;
const offersEffectCode = ts.transpileModule(offersEffect.getText(dashboardSource), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function createHarness(initialProgress: TutorialProgress) {
  const states: unknown[] = [];
  let hook = 0;
  const requests: {
    body: { element: tutorial.TutorialElement; revision: number };
    respond: (response: Response) => void;
  }[] = [];
  function useState<T>(initial: T): [T, (next: T | ((current: T) => T)) => void] {
    const index = hook++;
    if (!(index in states)) states[index] = initial;
    return [states[index] as T, next => {
      states[index] = typeof next === "function"
        ? (next as (current: T) => T)(states[index] as T) : next;
    }];
  }
  const Provider = runInNewContext(`${providerCode}\nexports.TutorialProvider`, {
    exports: {},
    fetch: (url: string, init: RequestInit) => {
      assert.equal(url, "/api/play/tutorial/fulfill");
      return new Promise<Response>(respond => requests.push({
        body: JSON.parse(init.body as string), respond,
      }));
    },
    require: (id: string) => {
      if (id === "@/shared/tutorial") return tutorial;
      if (id === "react") return {
        ...React, useState,
        useRef: <T>(initial: T) => useState({ current: initial })[0],
        useCallback: (callback: unknown) => callback,
      };
      return require(id);
    },
  }) as (props: { initialProgress: TutorialProgress; children: null }) =>
    React.ReactElement<{ value: TutorialContext }>;
  return {
    requests,
    render() {
      hook = 0;
      return Provider({ initialProgress, children: null }).props.value;
    },
    visitOffers(context: TutorialContext, section = "loot") {
      let completed = Promise.resolve();
      runInNewContext(offersEffectCode, {
        section, TutorialElement: Step,
        useEffect: (effect: () => void) => effect(),
        fulfillTutorial: (element: tutorial.TutorialElement) => {
          completed = context.fulfillTutorial(element);
          return completed;
        },
      });
      return completed;
    },
  };
}

test("visiting Offers records its step even while an earlier gallery save is pending", async t => {
  for (const galleryFirst of [true, false]) {
    for (const galleryFails of [false, true]) {
      await t.test(`gallery finishes ${galleryFirst ? "first" : "last"} and ${galleryFails ? "fails" : "succeeds"}`, async () => {
        const h = createHarness({ step: Step.TUTORIAL_GO_TO_GALLERY, revision: 3 });
        const gallerySave = h.render().fulfillTutorial(Step.TUTORIAL_GO_TO_GALLERY);
        assert.equal(h.requests.length, 1);
        h.render().updateTutorial({ step: Step.TUTORIAL_SEE_OFFERS, revision: 5 });
        await h.visitOffers(h.render(), "explore");
        assert.equal(h.requests.length, 1);
        const offersSave = h.visitOffers(h.render());
        assert.equal(h.requests.length, 2, "The gallery request must not discard the Offers completion");
        assert.deepEqual(h.requests[1].body, { element: Step.TUTORIAL_SEE_OFFERS, revision: 5 });
        await h.visitOffers(h.render());
        await h.render().fulfillTutorial(Step.TUTORIAL_REROLL_VALUE);
        assert.equal(h.requests.length, 2, "Duplicate and inactive steps must not send requests");

        const completeGallery = async () => {
          h.requests[0].respond(galleryFails
            ? Response.json({ error: "Old gallery save failed" }, { status: 503 })
            : Response.json({ tutorial: { step: Step.TUTORIAL_MEET_VISITOR, revision: 4 } }));
          await gallerySave;
        };
        const completeOffers = async () => {
          h.requests[1].respond(Response.json({ tutorial: { step: Step.TUTORIAL_CLAIM_ITEM, revision: 6 } }));
          await offersSave;
        };
        await (galleryFirst ? completeGallery() : completeOffers());
        assert.equal(h.render().saving, true, "Saving stays active until both requests settle");
        assert.equal(h.render().error, "", "An old request must not surface an error on the current step");
        await h.visitOffers(h.render());
        assert.equal(h.requests.length, 2);
        await (galleryFirst ? completeOffers() : completeGallery());
        const current = h.render();
        assert.deepEqual(current.progress, { step: Step.TUTORIAL_CLAIM_ITEM, revision: 6 });
        assert.equal(current.saving, false);
        assert.equal(current.error, "");
        await h.visitOffers(current);
        assert.equal(h.requests.length, 2, "The completed step must not be submitted again");
      });
    }
  }
});

test("a late gallery failure preserves the current Offers error and its retry", async () => {
  const h = createHarness({ step: Step.TUTORIAL_GO_TO_GALLERY, revision: 3 });
  const gallerySave = h.render().fulfillTutorial(Step.TUTORIAL_GO_TO_GALLERY);
  h.render().updateTutorial({ step: Step.TUTORIAL_SEE_OFFERS, revision: 5 });
  const offersSave = h.visitOffers(h.render());
  h.requests[1].respond(Response.json({ error: "Please retry saving Offers" }, { status: 503 }));
  await offersSave;
  assert.equal(h.render().error, "Please retry saving Offers");
  h.requests[0].respond(Response.json({ error: "Old gallery save failed" }, { status: 503 }));
  await gallerySave;
  assert.equal(h.render().error, "Please retry saving Offers");
  assert.equal(h.render().saving, false);
  assert.deepEqual(h.render().progress, { step: Step.TUTORIAL_SEE_OFFERS, revision: 5 });

  const retry = h.render().retryTutorial();
  await h.visitOffers(h.render());
  assert.equal(h.requests.length, 3, "Retry and navigation must not duplicate the active request");
  assert.deepEqual(h.requests[2].body, { element: Step.TUTORIAL_SEE_OFFERS, revision: 5 });
  h.requests[2].respond(Response.json({ tutorial: { step: Step.TUTORIAL_CLAIM_ITEM, revision: 6 } }));
  await retry;
  assert.deepEqual(h.render().progress, { step: Step.TUTORIAL_CLAIM_ITEM, revision: 6 });
  assert.equal(h.render().saving, false);
  assert.equal(h.render().error, "");
});
