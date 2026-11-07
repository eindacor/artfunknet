import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { MongoClient, MongoServerError, ObjectId, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import ts from "typescript";

import * as accountAdmin from "./player-account-admin.ts";
import { redactPlayerMetadata } from "./player-account-admin.ts";
import * as playerAccount from "./player-account.ts";
import * as passwords from "./password.ts";
import * as supporters from "./supporter-status.ts";
import { ArtistExperienceError, getPublicArtistProfile } from "./contributing-artists.ts";
import { getPlayerLandingPath } from "./artist-types.ts";

const require = createRequire(import.meta.url);
async function load<T>(relative: string, dependencies: Record<string, unknown>) {
  const code = ts.transpileModule(await readFile(new URL(relative, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(`${code}\nexports`, {
    exports: {}, Date, URL, Error, console,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }) as T;
}

function fixturePlayer(id: string, name = id) {
  return playerAccount.createPlayerAccountRecord({
    playerId: id, screenName: name, email: `${id}@example.com`,
    passwordHash: "fixture-hash", passwordSalt: "fixture-salt",
  });
}

test("player-account administration searches literal names and emails, links catalog artists, and preserves gameplay and sign-in", async t => {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  t.after(async () => { await client.close(); await server.stop(); });
  const database = client.db("admin-player-artists");
  const alice = {
    ...fixturePlayer("alice", "Alice-Player"), account_emails: ["alice@example.com", "alice+art@example.net"],
    oauth_accounts: { google: { id: "google-alice", access_token: "private-token" } },
    supporter: { admin_override: "rare" },
  };
  const bob = fixturePlayer("bob", "Bob-Player");
  await database.collection<{ _id: string }>("players").insertMany([
    alice, bob, { ...fixturePlayer("inactive", "Inactive-Player"), active: false },
  ]);
  await database.collection<{ _id: string }>("artists").insertMany([
    { _id: "catalog", artist_name: "Existing catalog artist", date_of_birth: null, date_of_death: null },
    { _id: "unclaimed", artist_name: "Other artist" },
  ]);
  const item = { _id: "owned-item", owner: alice._id, artwork_id: "existing-work", status: "claimed" };
  await database.collection<{ _id: string }>("items").insertOne(item);
  await database.collection<{ _id: string }>("artworks").insertOne({
    _id: "existing-work", artist_id: "catalog", artist: "Existing catalog artist", title: "Existing artwork", active: true,
  });
  let authorized = true;
  const adminApi = { requireAdminApi: async () => authorized
    ? { ok: true, session: { email: "admin@example.com" } }
    : { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) } };
  const route = await load<typeof import("../app/api/admin/player-accounts/route.ts")>("../app/api/admin/player-accounts/route.ts", {
    "next/server": require("next/server"), "@/server/admin-api": adminApi,
    "@/server/mongodb": { getDatabase: async () => database }, "@/server/player-account": playerAccount,
    "@/server/player-account-admin": accountAdmin, "@/server/password": passwords, "@/server/supporter-status": supporters,
  });
  const get = (query: string) => route.GET(new Request(`http://localhost/api/admin/player-accounts?${query}`));
  const patch = (body: unknown) => route.PATCH(new Request("http://localhost/api/admin/player-accounts", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  await t.test("partial, case-insensitive names and associated emails produce bounded safe results", async () => {
    const response = await get("q=%20aLiCe%20");
    assert.equal(response.headers.get("cache-control"), "no-store");
    const { accounts } = await response.json();
    assert.deepEqual(accounts, [{
      id: alice._id, email: alice.email, screenName: alice.screen_name, active: true, artistId: null,
    }]);
    assert.equal((await (await get("q=alice%2Bart")).json()).accounts[0].id, alice._id);
    assert.equal((await (await get("q=BOB%40example")).json()).accounts[0].id, bob._id);
    assert.deepEqual(await (await get("q=.*")).json(), { accounts: [] });
    assert.deepEqual(await (await get("q=")).json(), { accounts: [] });
    await database.collection<{ _id: string }>("players").insertMany(Array.from({ length: 25 }, (_, index) =>
      fixturePlayer(`limit-${String(index).padStart(2, "0")}`, `Limit-${String(index).padStart(2, "0")}`)));
    const limited = (await (await get("q=limit")).json()).accounts;
    assert.equal(limited.length, 20);
    assert.equal(limited[0].screenName, "Limit-00");
    assert.equal(limited.at(-1).screenName, "Limit-19");
    const details = (await (await get("id=alice")).json()).account;
    assert.equal(details.metadata.password_hash, "[redacted]");
    assert.equal(details.metadata.oauth_accounts.google.access_token, "[redacted]");
    assert.equal(details.supporterStatus, "rare");
    assert.equal((await (await get("email=alice%40example.com")).json()).account.id, alice._id);
  });
  await t.test("linking upgrades both sides and grants live artist portal access without replacing records", async () => {
    const response = await patch({ action: "link-artist", playerId: alice._id, artistId: "catalog" });
    assert.equal(response.status, 200);
    const { account } = await response.json();
    assert.equal(account.artistId, "catalog");
    assert.equal(account.artistName, "Existing catalog artist");
    const upgraded = await database.collection<typeof alice>("players").findOne({ _id: alice._id });
    assert.ok(upgraded);
    for (const [key, value] of Object.entries(alice)) {
      if (!["account_type", "updated_at"].includes(key)) assert.deepEqual(upgraded[key], value, key);
    }
    assert.equal(upgraded.account_type, "artist");
    assert.equal(upgraded.artist_id, "catalog");
    assert.equal(upgraded.artist_linked_by, "admin@example.com");
    assert.equal((await database.collection<{ _id: string; player_id?: string }>("artists").findOne({ _id: "catalog" }))?.player_id, alice._id);
    assert.deepEqual(await database.collection("items").find({}).toArray(), [item]);
    assert.equal(getPlayerLandingPath(upgraded), "/artist");
    assert.equal((await getPublicArtistProfile(database, alice._id))?.name, "Existing catalog artist");
    const artistApi = await load<typeof import("./artist-api.ts")>("./artist-api.ts", {
      "next/server": require("next/server"), "./contributing-artists.ts": { ArtistExperienceError },
      "./mongodb.ts": { getDatabase: async () => database },
      "./player-api": { requirePlayerApi: async () => ({ ok: true, session: { playerId: alice._id } }) },
      "./public-url": { getPublicBaseUrl: () => "http://localhost" },
    });
    const artistAuth = await artistApi.requireArtistApi(new Request("http://localhost/api/artist/profile", {
      headers: { origin: "http://localhost" },
    }));
    assert.equal(artistAuth.ok, true);
    if (artistAuth.ok) assert.equal(artistAuth.artist._id, "catalog");
  });
  await t.test("existing assignments, unavailable records, and malformed requests cannot grant another artist", async () => {
    assert.equal((await patch({ action: "link-artist", playerId: bob._id, artistId: "catalog" })).status, 409);
    assert.equal((await patch({ action: "link-artist", playerId: alice._id, artistId: "unclaimed" })).status, 409);
    assert.equal((await patch({ action: "link-artist", playerId: "inactive", artistId: "unclaimed" })).status, 404);
    assert.equal((await patch({ action: "link-artist", playerId: bob._id, artistId: "missing" })).status, 404);
    assert.equal((await patch({ action: "link-artist", playerId: "missing", artistId: "unclaimed" })).status, 404);
    assert.equal((await patch({ action: "link-artist", playerId: bob._id })).status, 400);
    assert.equal((await patch(null)).status, 400);
    assert.equal((await patch({ action: "link-artist", playerId: alice._id, artistId: "catalog" })).status, 200);
    assert.equal((await database.collection<{ _id: string; artist_id?: string }>("players").findOne({ _id: bob._id }))?.artist_id, undefined);
  });
  await t.test("password and supporter tools continue working on linked accounts", async () => {
    const password = "A-new-admin-password-2026";
    assert.equal((await patch({ action: "reset-password", email: alice.email, password })).status, 200);
    const updated = await database.collection<playerAccount.PlayerAccountRecord>("players").findOne({ _id: alice._id });
    assert.ok(updated);
    assert.equal(await passwords.verifyPassword(password, updated.password_salt, updated.password_hash), true);
    const response = await patch({ action: "set-supporter-override", email: alice.email, supporterStatus: "legendary" });
    assert.equal(response.status, 200);
    const { account } = await response.json();
    assert.equal(account.supporterStatus, "legendary");
    assert.equal(account.artistId, "catalog");
    assert.equal(account.metadata.password_hash, "[redacted]");
  });
  await t.test("new catalog artists can be created through the existing API and linked immediately", async () => {
    const create = await load<typeof import("../app/api/admin/artists/route.ts")>("../app/api/admin/artists/route.ts", {
      "next/server": require("next/server"), mongodb: { MongoServerError, ObjectId },
      "@/server/admin-api": adminApi, "@/server/mongodb": { getDatabase: async () => database },
    });
    const response = await create.POST(new Request("http://localhost/api/admin/artists", {
      method: "POST", body: JSON.stringify({ artist_name: "Brand new artist", date_of_birth: "1990", date_of_death: "" }),
    }));
    assert.equal(response.status, 201);
    const { artist } = await response.json();
    assert.equal((await patch({ action: "link-artist", playerId: bob._id, artistId: artist._id })).status, 200);
    assert.equal((await getPublicArtistProfile(database, bob._id))?.name, "Brand new artist");
    const remove = await load<typeof import("../app/api/admin/artists/[id]/route.ts")>("../app/api/admin/artists/[id]/route.ts", {
      "next/server": require("next/server"), mongodb: { MongoServerError }, "@/server/admin-api": adminApi,
      "@/server/mongodb": { getDatabase: async () => database },
      "@/server/community-reaction-cleanup": { deleteCommunityReactions: async () => assert.fail("Linked artists must not be deleted") },
    });
    assert.equal((await remove.DELETE(new Request("http://localhost"), { params: Promise.resolve({ id: artist._id }) })).status, 409);
    assert.ok(await database.collection<{ _id: string }>("artists").findOne({ _id: artist._id }));
  });
  await t.test("search and linking require administrator authentication", async () => {
    authorized = false;
    assert.equal((await get("q=alice")).status, 401);
    assert.equal((await get("id=alice")).status, 401);
    assert.equal((await patch({ action: "link-artist", playerId: bob._id, artistId: "unclaimed" })).status, 401);
  });
});

test("artist linking preserves one-to-one ownership under concurrency and rolls back failed player writes", async t => {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  t.after(async () => { await client.close(); await server.stop(); });
  const db = client.db("concurrent-player-artists");
  await db.collection<{ _id: string }>("players").insertMany([fixturePlayer("first"), fixturePlayer("second"), fixturePlayer("third")]);
  await db.collection<{ _id: string }>("artists").insertMany([
    { _id: "shared", artist_name: "Shared" }, { _id: "left", artist_name: "Left" }, { _id: "right", artist_name: "Right" },
  ]);
  const shared = await Promise.allSettled([
    accountAdmin.linkPlayerAccountToArtist(db, "first", "shared", "admin"),
    accountAdmin.linkPlayerAccountToArtist(db, "second", "shared", "admin"),
  ]);
  assert.equal(shared.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(await db.collection("players").countDocuments({ artist_id: "shared" }), 1);
  const winner = await db.collection<{ _id: string; artist_id?: string }>("players").findOne({ artist_id: "shared" });
  assert.equal((await db.collection<{ _id: string; player_id?: string }>("artists").findOne({ _id: "shared" }))?.player_id, winner?._id);
  const competing = await Promise.allSettled([
    accountAdmin.linkPlayerAccountToArtist(db, "third", "left", "admin"),
    accountAdmin.linkPlayerAccountToArtist(db, "third", "right", "admin"),
  ]);
  assert.equal(competing.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(await db.collection("artists").countDocuments({ player_id: "third" }), 1);
  const rollback = client.db("rollback-player-artists");
  const player = fixturePlayer("rollback");
  const artist = { _id: "rollback-artist", artist_name: "Rollback" };
  await rollback.collection<{ _id: string }>("players").insertOne(player);
  await rollback.collection<{ _id: string }>("artists").insertOne(artist);
  const failingDb = {
    collection: (name: string) => {
      const collection = rollback.collection(name);
      return new Proxy(collection, { get(target, property) {
        if (name === "players" && property === "updateOne") return async () => { throw new Error("Simulated player write failure"); };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      } });
    },
  } as unknown as Db;
  await assert.rejects(accountAdmin.linkPlayerAccountToArtist(failingDb, player._id, artist._id, "admin"), /Simulated player write failure/);
  assert.deepEqual(await rollback.collection<{ _id: string }>("players").findOne({ _id: player._id }), player);
  assert.deepEqual(await rollback.collection<{ _id: string }>("artists").findOne({ _id: artist._id }), artist);
  await rollback.collection<{ _id: string }>("players").insertOne({
    ...fixturePlayer("legacy-linked"), artist_id: artist._id, account_type: "artist",
  });
  await assert.rejects(accountAdmin.linkPlayerAccountToArtist(rollback, player._id, artist._id, "admin"), /already linked/);
});

test("catalog artist edits and propagation rollback preserve concurrently added player links", async t => {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  t.after(async () => { await client.close(); await server.stop(); });
  for (const failPropagation of [false, true]) {
    const database = client.db(`catalog-player-links-${failPropagation}`);
    const artist = { _id: "catalog-artist", artist_name: "Original name", bio: "Existing biography" };
    await database.collection<{ _id: string }>("artists").insertOne(artist);
    await database.collection<{ _id: string }>("players").insertOne(fixturePlayer("player"));
    let linked = false;
    let propagationFailed = false;
    const editingDb = {
      collection: (name: string) => {
        const collection = database.collection(name);
        return new Proxy(collection, { get(target, property) {
          if (name === "artists" && property === "findOne") return async (filter: unknown) => {
            const stored = await target.findOne(filter as { _id: string });
            if (!linked) {
              linked = true;
              await accountAdmin.linkPlayerAccountToArtist(database, "player", artist._id, "admin");
            }
            return stored;
          };
          if (name === "artworks" && property === "updateMany" && failPropagation && !propagationFailed) return async () => {
            propagationFailed = true;
            throw new Error("Simulated artist propagation failure");
          };
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        } });
      },
    };
    const route = await load<typeof import("../app/api/admin/artists/[id]/route.ts")>("../app/api/admin/artists/[id]/route.ts", {
      "next/server": require("next/server"), mongodb: { MongoServerError },
      "@/server/admin-api": { requireAdminApi: async () => ({ ok: true, session: { email: "admin" } }) },
      "@/server/mongodb": { getDatabase: async () => editingDb }, "@/server/community-reaction-cleanup": {},
    });
    const edit = route.PATCH(new Request("http://localhost", {
      method: "PATCH", body: JSON.stringify({ artist_name: "New name", date_of_birth: "1990", date_of_death: "" }),
    }), { params: Promise.resolve({ id: artist._id }) });
    if (failPropagation) {
      await assert.rejects(edit, /Simulated artist propagation failure/);
      assert.deepEqual(await database.collection<{ _id: string }>("artists").findOne({ _id: artist._id }), { ...artist, player_id: "player" });
    } else {
      assert.equal((await edit).status, 200);
      const saved = await database.collection<{ _id: string; player_id?: string; artist_name: string; bio: string }>("artists").findOne({ _id: artist._id });
      assert.equal(saved?.player_id, "player");
      assert.equal(saved?.artist_name, "New name");
      assert.equal(saved?.bio, artist.bio);
    }
    assert.equal((await database.collection<{ _id: string; artist_id?: string }>("players").findOne({ _id: "player" }))?.artist_id, artist._id);
  }
});

test("player metadata redacts credentials while retaining account fields", () => {
  const result = redactPlayerMetadata({
    _id: "player-1",
    email: "player@example.com",
    password_hash: "hash",
    password_updated_at: new Date("2026-10-10T12:00:00.000Z"),
    profile: {
      level: 12,
      vintage_operation: {
        token: "secret-token",
        expires_at: "2026-10-11T12:00:00.000Z",
      },
    },
    patreon: {
      tier_name: "Legendary Tier",
      oauth: {
        encrypted_tokens: "encrypted",
        access_token_expires_at: new Date("2026-10-12T12:00:00.000Z"),
      },
    },
  });

  assert.deepEqual(result, {
    _id: "player-1",
    email: "player@example.com",
    password_hash: "[redacted]",
    password_updated_at: "2026-10-10T12:00:00.000Z",
    profile: {
      level: 12,
      vintage_operation: {
        token: "[redacted]",
        expires_at: "2026-10-11T12:00:00.000Z",
      },
    },
    patreon: {
      tier_name: "Legendary Tier",
      oauth: {
        encrypted_tokens: "[redacted]",
        access_token_expires_at: "2026-10-12T12:00:00.000Z",
      },
    },
  });
});
