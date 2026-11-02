import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

import * as jose from "jose";
import { MongoClient, type Db, type Document } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import ts from "typescript";

import * as access from "./account-data-access.ts";
import * as deletion from "./account-deletion.ts";
import * as authorization from "./authorization.ts";
import { settleExpiredAuctions } from "./auction-gameplay.ts";
import * as chatCore from "./gallery-chat-core.ts";
import * as publicCore from "./public-showcase-core.ts";
import type { GameItem } from "./gameplay.ts";

const require = createRequire(import.meta.url);
const { NextResponse } = require("next/server");
const TARGET = "target-player-123456";
const OTHER = "other-player-987654";
type Doc = Document & { _id: string };
const collection = (db: Db, name: string) => db.collection<Doc>(name);

async function load<T>(
  relative: string,
  dependencies: Record<string, unknown>,
  globals: Record<string, unknown> = {},
  expose = "",
) {
  const source = await readFile(new URL(relative, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(`${code}\n${expose}\nexports`, {
    exports: {}, console, URL, TextEncoder, Date, ...globals,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }) as T;
}

async function seed(db: Db) {
  await collection(db, "players").insertMany([
    {
      _id: TARGET, active: true, email: "erase@example.com", username: "erase@example.com",
      screen_name: "ErasedCollector", account_emails: ["alias@example.com"],
      password_hash: "test-hash", password_salt: "test-salt",
      oauth_accounts: { instagram: { id: "instagram-account", email: null } },
      patreon: { email: "patreon@example.com", oauth: { encrypted_tokens: "test-ciphertext" } },
      profile: { level: 1 },
    },
    {
      _id: OTHER, active: true, email: "other@example.com", screen_name: "OtherCollector",
      password_hash: "other-hash", profile: {
        bank_balance: 200,
        references: [TARGET, OTHER],
        receipts: { [TARGET]: "private", retained: "other" },
      },
    },
  ]);
}

async function routeHarness(db: Db) {
  let request = new Request("http://localhost");
  const session = await load<typeof import("./session.ts")>("./session.ts", {
    "server-only": {}, jose, "./authorization.ts": authorization,
    "./mongodb.ts": { getDatabase: async () => db },
    "next/headers": {
      headers: async () => request.headers,
      cookies: async () => ({
        get: (name: string) => {
          const value = request.headers.get("cookie")?.split("; ")
            .find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1);
          return value ? { value } : undefined;
        },
      }),
    },
    "next/navigation": { redirect: () => assert.fail("Unexpected navigation") },
  }, { process: { env: { SESSION_SECRET: "test-only-deletion-secret-long-enough-for-signing" } } });
  const route = await load<{ POST: (request: Request) => Promise<Response> }>(
    "../app/api/auth/player/account/delete/route.ts", {
      "next/server": { NextResponse },
      "@/server/account-data-access": access,
      "@/server/account-deletion": deletion,
      "@/server/auction-gameplay": { settleExpiredAuctions },
      "@/server/mongodb": { getDatabase: async () => db },
      "@/server/public-url": { getPublicBaseUrl: () => "http://localhost/" },
      "@/server/session": session,
    },
  );
  const token = await session.createPlayerSessionToken({
    playerId: TARGET, email: "erase@example.com", screenName: "ErasedCollector",
  });
  return {
    session,
    async invoke(body: unknown = { confirmation: deletion.ACCOUNT_DELETION_PHRASE }, options: {
      origin?: string; authenticated?: boolean; rawBody?: string;
    } = {}) {
      request = new Request("http://localhost/api/auth/player/account/delete", {
        method: "POST",
        headers: {
          origin: options.origin ?? "http://localhost",
          "content-type": "application/json",
          ...(options.authenticated !== false ? {
            cookie: `${session.PLAYER_SESSION_COOKIE}=${token}; artfunkel_instagram_oauth_state=state; ${session.ADMIN_SESSION_COOKIE}=admin`,
          } : {}),
        },
        body: options.rawBody ?? JSON.stringify(body),
      });
      return route.POST(request);
    },
    oldSession: () => session.getPlayerSession(),
  };
}

test("account deletion removes live personal data and coordinates concurrent game actions", async (t) => {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  t.after(async () => { await client.close(); await server.stop(); });

  await t.test("the endpoint requires authentication, same origin, and the exact confirmation phrase", async () => {
    const db = client.db("delete-guards");
    await seed(db);
    const api = await routeHarness(db);
    assert.equal((await api.invoke(undefined, { authenticated: false })).status, 401);
    assert.equal((await api.invoke(undefined, { origin: "https://other.invalid" })).status, 403);
    for (const confirmation of ["", "delete my account", "DELETE MY ACCOUNT "]) {
      assert.equal((await api.invoke({ confirmation })).status, 400);
    }
    assert.equal((await api.invoke(undefined, { rawBody: "{" })).status, 400);
    assert.equal(await collection(db, "players").countDocuments(), 2);
  });

  for (const obligation of ["seller", "winner", "legacy-winner", "settling", "live-event"] as const) {
    await t.test(`${obligation} obligations block deletion without erasing any records`, async () => {
      const db = client.db(`delete-block-${obligation}`);
      await seed(db);
      if (obligation === "live-event") {
        await collection(db, "metadata").insertOne({
          _id: "live-auction-event", live: true, current_item_id: "lot", winner_id: TARGET,
        });
      } else {
        await collection(db, "auctions").insertOne({
          _id: "auction", seller_id: obligation === "seller" ? TARGET : OTHER,
          current_winner_id: obligation === "seller" ? OTHER : obligation === "legacy-winner" ? null : TARGET,
          ...(obligation === "legacy-winner" ? { current_winner_name: "ErasedCollector", has_bid: true } : {}),
          expiration: new Date(Date.now() + 60_000).toISOString(),
          ...(obligation === "settling" ? { settlement_status: "settling" } : {}),
        });
      }
      const response = await (await routeHarness(db)).invoke();
      assert.equal(response.status, 409);
      assert.match((await response.json()).error, /auction/);
      assert.equal(await collection(db, "players").countDocuments(), 2);
      assert.equal((await collection(db, "players").findOne({ _id: TARGET }))?.account_deletion, undefined);
    });
  }

  await t.test("expired unsold auctions settle before deletion instead of permanently blocking it", async () => {
    const db = client.db("delete-expired");
    await seed(db);
    await collection(db, "items").insertOne({ _id: "returned", owner: TARGET, status: "auctioned" });
    await collection(db, "auctions").insertOne({
      _id: "expired", item_id: "returned", seller_id: TARGET, current_winner_id: null,
      viewer: "public",
      current_winner_name: null, has_bid: false, current_bid: 100, starting_bid: 100,
      expiration: new Date(0).toISOString(), item_snapshot: { title: "Returned work" },
    });
    const response = await (await routeHarness(db)).invoke();
    assert.equal(response.status, 200);
    assert.equal(await collection(db, "auctions").countDocuments(), 0);
    assert.equal(await collection(db, "items").countDocuments(), 0);
  });

  await t.test("all owned states, galleries, credentials, history and shared references are erased; unrelated data survives", async () => {
    const db = client.db("delete-complete");
    await seed(db);
    const states = [
      "unclaimed", "for_sale", "won", "claimed", "displayed", "collector_pending",
      "auctioned", "event_settlement_pending", "forgery_return_pending",
      "bulk_sale_pending", "bulk_donate_pending",
    ];
    await collection(db, "items").insertMany([
      ...states.map((status, i) => ({ _id: `owned-${i}`, owner: TARGET, status, permanent: i === 3 })),
      { _id: "private-lot", owner: "system:auction-house", status: "auctioned" },
      { _id: "contest-held", owner: "system:forgery-contest", forgery_contest: { original_owner: TARGET } },
      {
        _id: "other-item", owner: OTHER, status: "claimed",
        authenticity: { liable: TARGET, original_owner: TARGET, liability_pending: true },
        transaction_history: [{ from_owner: TARGET, to_owner: OTHER, source: "sale" }],
        artwork: { artist: "ErasedCollector" },
      },
    ]);
    const owned = [
      ["galleries", "owner_id"], ["npcs", "owner_id"], ["quests", "owner_id"],
      ["player_artwork_archives", "owner"], ["player_notifications", "user_id"],
      ["playthrough_snapshots", "player_id"], ["daily_event_claims", "player_id"],
      ["artwork_effect_settlements", "player_id"], ["raffle_entries", "player_id"],
      ["hall_of_fame_submissions", "player_id"],
    ];
    for (const [name, owner] of owned) {
      await collection(db, name).insertMany([
        { _id: `owned-${name}`, [owner]: TARGET, private_note: "erase@example.com" },
        { _id: `other-${name}`, [owner]: OTHER, retained: true },
      ]);
    }
    await collection(db, "auctions").insertMany([
      { _id: "private-auction", viewer: TARGET, item_id: "private-lot", seller_id: null },
      { _id: "other-auction", viewer: "public", seller_id: OTHER, commission: { player_id: TARGET, coefficient: 0.1 } },
    ]);
    await collection(db, "gallery_chat_messages").insertMany([
      { _id: "authored", author_id: TARGET, gallery_owner_id: "global", content: "private message" },
      { _id: "in-gallery", author_id: OTHER, gallery_owner_id: TARGET, content: "gallery comment" },
      {
        _id: "other-chat", author_id: OTHER, gallery_owner_id: "global",
        content: "@ErasedCollector at ERASE@example.com", reporter_ids: [TARGET, OTHER],
        edit_history: [{ content: "alias@example.com", edited_at: new Date() }],
      },
    ]);
    await collection(db, "forgery_contest_entries").insertMany([
      { _id: "owned-entry", player_id: TARGET, item_id: "contest-held" },
      { _id: "other-entry", player_id: OTHER, item_id: "other-item" },
    ]);
    await collection(db, "forgery_contest_votes").insertMany([
      { _id: "owned-vote", player_id: TARGET, entry_id: "other-entry" },
      { _id: "vote-for-deleted", player_id: OTHER, entry_id: "owned-entry" },
      { _id: "other-vote", player_id: OTHER, entry_id: "other-entry" },
    ]);
    await collection(db, "community_reactions").insertMany([
      { _id: "owned-reaction", player_id: TARGET, target_type: "gallery", target_id: OTHER },
      { _id: "gallery-reaction", player_id: OTHER, target_type: "gallery", target_id: TARGET },
      { _id: "item-reaction", player_id: OTHER, target_type: "item", target_id: "owned-0" },
      { _id: "message-reaction", player_id: OTHER, target_type: "message", target_id: "authored" },
      { _id: "other-reaction", player_id: OTHER, target_type: "item", target_id: "other-item" },
    ]);
    await collection(db, "hall_of_fame").insertMany([
      { _id: "deleted-item-exhibit", item_id: "owned-0", player_id: TARGET },
      {
        _id: "shared-exhibit", item_id: "other-item", player_id: TARGET,
        player_screen_name: "FormerCollectorName",
        item_snapshot: { owner: TARGET, artwork: { artist: "ErasedCollector" } },
      },
    ]);
    await collection(db, "metadata").insertOne({
      _id: "event-history",
      previous_winners: [{ player_id: TARGET, screen_name: "ErasedCollector" }, { player_id: OTHER, screen_name: "OtherCollector" }],
      last_winners: [{ player_id: TARGET, entry_item_snapshot: { owner: TARGET } }],
      pending_refunds: [{ player_id: TARGET, amount: 10 }, { player_id: OTHER, amount: 20 }],
      pending_winner_notification: { player_id: TARGET, title: "Win" },
      owner_name: "ErasedCollector",
    });
    const api = await routeHarness(db);
    assert.equal((await api.invoke({ confirmation: "not confirmed" })).status, 400);
    assert.equal((await api.oldSession())?.playerId, TARGET);
    const response = await api.invoke();
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    assert.match(response.headers.get("set-cookie") ?? "", /artfunkel_player_session=;.*Max-Age=0/);
    assert.match(response.headers.get("set-cookie") ?? "", /artfunkel_instagram_oauth_state=;/);
    assert.doesNotMatch(response.headers.get("set-cookie") ?? "", /artfunkel_admin_session=/);
    assert.equal(await api.oldSession(), null);
    assert.equal(await collection(db, "players").countDocuments(), 1);
    const other = await collection(db, "players").findOne({ _id: OTHER });
    assert.equal(other?.password_hash, "other-hash");
    assert.deepEqual(other?.profile.references, [OTHER]);
    assert.deepEqual(other?.profile.receipts, { retained: "other" });
    assert.equal(await collection(db, "items").countDocuments(), 1);
    const item = await collection(db, "items").findOne({ _id: "other-item" });
    assert.equal(item?.owner, OTHER);
    assert.equal(item?.authenticity.liable, "");
    assert.equal(item?.authenticity.liability_pending, false);
    assert.equal(item?.authenticity.original_owner, "[redacted]");
    assert.equal(item?.transaction_history[0].from_owner, "[redacted]");
    assert.equal(item?.artwork.artist, "ErasedCollector");
    for (const [name] of owned) {
      assert.equal(await collection(db, name).countDocuments(), 1, name);
      assert.ok(await collection(db, name).findOne({ _id: `other-${name}` }), name);
    }
    assert.equal((await collection(db, "auctions").findOne({ _id: "other-auction" }))?.commission, null);
    assert.equal(await collection(db, "community_reactions").countDocuments(), 1);
    assert.equal(await collection(db, "forgery_contest_votes").countDocuments(), 1);
    assert.equal(await collection(db, "gallery_chat_messages").countDocuments(), 1);
    const message = await collection(db, "gallery_chat_messages").findOne({ _id: "other-chat" });
    assert.equal(message?.content, "@[redacted] at [redacted]");
    assert.deepEqual(message?.reporter_ids, [OTHER]);
    assert.equal(message?.edit_history[0].content, "[redacted]");
    assert.ok(message?.edit_history[0].edited_at instanceof Date);
    assert.equal(await collection(db, "hall_of_fame").countDocuments(), 1);
    assert.equal((await collection(db, "hall_of_fame").findOne({ _id: "shared-exhibit" }))?.player_screen_name, "[redacted]");
    const history = await collection(db, "metadata").findOne({ _id: "event-history" });
    assert.equal(history?.previous_winners.length, 1);
    assert.equal(history?.last_winners.length, 0);
    assert.equal(history?.pending_refunds.length, 1);
    assert.equal(history?.pending_winner_notification, undefined);
    assert.equal(history?.owner_name, "[redacted]");
  });

  await t.test("interrupted cleanup can resume after owned records are gone, including dependent reactions and votes", async () => {
    const db = client.db("delete-resume");
    await seed(db);
    await collection(db, "items").insertOne({ _id: "owned", owner: TARGET });
    await collection(db, "gallery_chat_messages").insertOne({ _id: "message", author_id: TARGET });
    await collection(db, "community_reactions").insertOne({
      _id: "reaction", player_id: OTHER, target_type: "item", target_id: "owned",
    });
    let fail = true;
    const faulty = new Proxy(db, {
      get(target, property) {
        if (property === "collection") return (name: string) => {
          const actual = collection(db, name);
          return new Proxy(actual, {
            get(targetCollection, method) {
              if (name === "community_reactions" && method === "deleteMany") return async () => {
                if (fail) { fail = false; throw new Error("Injected cleanup failure"); }
              };
              const value = Reflect.get(targetCollection, method);
              return typeof value === "function" ? value.bind(targetCollection) : value;
            },
          });
        };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await assert.rejects(deletion.deletePlayerAccount(faulty, TARGET, settleExpiredAuctions), /Injected/);
    assert.equal(await collection(db, "items").countDocuments(), 0);
    assert.equal((await collection(db, "players").findOne({ _id: TARGET }))?.account_deletion, true);
    const api = await routeHarness(db);
    assert.equal((await api.invoke({ confirmation: "not yet" })).status, 400);
    assert.equal(await api.oldSession(), null);
    assert.equal((await api.session.getPlayerSession({ allowDeleting: true }))?.playerId, TARGET);
    assert.equal((await api.invoke()).status, 200);
    assert.equal(await collection(db, "community_reactions").countDocuments(), 0);
    assert.equal(await collection(db, "players").findOne({ _id: TARGET }), null);
  });

  await t.test("the erasure barrier drains active requests, deduplicates nested access, and queues new requests", async () => {
    const db = client.db("delete-concurrency");
    const releases: Array<() => Promise<void>> = [];
    const requestKey = {};
    await access.holdAccountDataAccess(db, requestKey, (release) => { releases.push(release); });
    let finishWrite!: () => void;
    let enteredWrite!: () => void;
    const entered = new Promise<void>((resolve) => { enteredWrite = resolve; });
    const finish = new Promise<void>((resolve) => { finishWrite = resolve; });
    const write = access.withExclusiveAccountDataAccess(db, async () => {
      enteredWrite();
      await finish;
    });
    while (!(await collection(db, "metadata").findOne({ _id: "account-erasure-gate", writer: { $exists: true } }))) {
      await sleep(5);
    }
    await access.holdAccountDataAccess(db, requestKey, () => assert.fail("Nested request access must reuse its lease"));
    let lateEntered = false;
    const lateRead = access.holdAccountDataAccess(db, {}, (release) => {
      releases.push(release);
      lateEntered = true;
    });
    await releases[0]();
    await entered;
    assert.equal(lateEntered, false);
    await assert.rejects(access.withExclusiveAccountDataAccess(db, async () => {}), access.AccountDataBusyError);
    finishWrite();
    await write;
    await lateRead;
    assert.equal(lateEntered, true);
    await releases[1]();
    assert.equal((await collection(db, "metadata").findOne({ _id: "account-erasure-gate" }))?.readers.length, 0);
  });

  await t.test("expired process leases are recoverable and failures release the game-wide pause", async () => {
    const db = client.db("delete-expired-lease");
    await collection(db, "metadata").insertOne({
      _id: "account-erasure-gate",
      readers: [{ token: "dead-reader", expires_at: new Date(0) }],
      writer: { token: "dead-writer", expires_at: new Date(0) },
    });
    await assert.rejects(access.withExclusiveAccountDataAccess(db, async () => {
      throw new Error("Failure during erasure");
    }), /Failure during erasure/);
    let release!: () => Promise<void>;
    await access.holdAccountDataAccess(db, {}, (callback) => { release = callback; });
    await release();
    const state = await collection(db, "metadata").findOne({ _id: "account-erasure-gate" });
    assert.equal(state?.writer, undefined);
    assert.deepEqual(state?.readers, []);
  });

  await t.test("background database operations participate in the pause without depending on a Next request", async () => {
    const db = client.db("delete-background-access");
    const databaseAccess = await load<typeof import("./mongodb.ts")>("./mongodb.ts", {
      "server-only": {},
      mongodb: {
        MongoClient: class {
          async connect() { return client; }
        },
        ServerApiVersion: { v1: "1" },
      },
      "next/headers": { headers: () => assert.fail("A scheduler must not read request headers") },
      "next/server": { after: () => assert.fail("A scheduler must release its own lease") },
      "./account-data-access.ts": access,
    }, {
      global: {},
      process: { env: { MONGODB_URI: server.getUri(), MONGODB_DB: db.databaseName } },
    });
    let finish!: () => void;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const job = databaseAccess.withDatabase(async (database) => {
      assert.equal(database.databaseName, db.databaseName);
      signalStarted();
      await pending;
    });
    await started;
    let entered = false;
    const writer = access.withExclusiveAccountDataAccess(db, async () => { entered = true; });
    while (!(await collection(db, "metadata").findOne({ _id: "account-erasure-gate", writer: { $exists: true } }))) {
      await sleep(5);
    }
    assert.equal(entered, false);
    finish();
    await job;
    await writer;
    assert.equal(entered, true);
    assert.equal((await collection(db, "metadata").findOne({ _id: "account-erasure-gate" }))?.readers.length, 0);
  });

  await t.test("missing player lookups expose [redacted] instead of cached names or silently hiding the owner", async () => {
    const db = client.db("delete-missing-player");
    await seed(db);
    const hydration = {
      hydrateGameItems: async (_db: Db, items: GameItem[]) =>
        items.map((item) => ({ ...item, artwork: { title: "Test", rarity: "common" } })),
    };
    const showcase = await load<typeof import("./public-showcase.ts")>("./public-showcase.ts", {
      "server-only": {}, "./item-artwork": hydration, "./public-showcase-core": publicCore,
    });
    await collection(db, "items").insertOne({
      _id: "orphan-item", owner: "missing-profile", status: "displayed", authenticity: { identified: false },
      transaction_history: [], source: "test", odds: "test",
    });
    const view = await showcase.getPublicItemView(db, "orphan-item", null);
    assert.equal(view?.displayOwner?.screenName, "[redacted]");
    await collection(db, "items").updateOne({ _id: "orphan-item" }, { $set: { status: "claimed" } });
    assert.equal((await showcase.getPublicItemView(db, "orphan-item", null))?.displayOwner, null);
    const chat = await load<{
      hydrate: (database: Db, messages: Doc[], viewerId: string) => Promise<Array<{ authorName: string }>>;
    }>("./gallery-chat.ts", {
      "server-only": {}, "node:crypto": { randomUUID },
      "./community-reaction-cleanup": { deleteCommunityReactions: async () => {} },
      "./gallery-chat-core": chatCore,
      "./item-artwork": hydration,
      "./community-reactions": {
        getCommunityReactionSummaries: async () => new Map([["orphan", {}], ["system", {}]]),
        preserveCommunityReactions: async () => {},
      },
    }, {}, "exports.hydrate = hydrateChatMessages;");
    const messages = await chat.hydrate(db, [
      {
        _id: "orphan", author_id: "missing-profile", author_name: "Old private name",
        gallery_owner_id: "global", content: "Message", created_at: new Date(), reporter_ids: [],
      },
      {
        _id: "system", author_id: chatCore.ARTFUNKEL_SYSTEM_AUTHOR_ID, author_name: "artfunkel",
        gallery_owner_id: "global", content: "System message", created_at: new Date(), reporter_ids: [],
      },
    ], OTHER);
    assert.equal(messages[0].authorName, "[redacted]");
    assert.equal(messages[1].authorName, "artfunkel");
  });
});
