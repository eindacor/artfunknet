import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { type TestContext } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import type { HydratedGameItem } from "../../server/item-artwork.ts";
import { getArtworkImageUrl } from "../../server/artwork-image-url.ts";
import {
  DEFAULT_OFFER_REVEAL_THRESHOLDS,
  getOfferRevealTier,
  isOfferRevealed,
} from "../../server/offer-reveal.ts";

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
  "offerIsRevealed",
  "clearOfferRevealTransitions",
  "revealOffer",
  "revealOffers",
  "requestOfferReveal",
  "revealQueuedOffers",
  "revealSelectedOffers",
  "confirmOfferReveal",
]);
const handlers = ts.transpileModule(
  dashboard.body!.statements.filter(
    (statement) => ts.isFunctionDeclaration(statement) && handlerNames.has(statement.name!.text),
  ).map((statement) => statement.getText(source)).join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

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
  assert.deepEqual([...h.timers.values()].map(({ delay }) => delay).sort(), [1200, 1800]);
  for (const timer of h.timers.values()) timer.callback();
  assert.equal(Object.keys(h.state.offerRevealTransitions).length, 0);
  assert.equal(h.offerRevealTimers.current.size, 0);
  assert.equal(h.setOfferRevealTransitions.mock.callCount(), 3);
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
