import assert from "node:assert/strict";
import test from "node:test";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import {
  ensureOAuthIdentityIndexes, findPlayerByAuthEmail, OAuthIdentityError,
  resolveOAuthIdentity, type OAuthIdentity, type OAuthPlayer,
} from "./oauth-identity.ts";
import { createPlayerAccountRecord, ensurePlayerAccountIndexes } from "./player-account.ts";
import { OAUTH_PROVIDERS } from "./oauth-providers.ts";
import { setupTestDb, STARTING_INVENTORY_TEST_OPTIONS } from "./test-utils/db-setup.ts";

test("OAuth identities keep player ownership explicit and email claims unique", async (t) => {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  t.after(async () => { await client.close(); await server.stop(); });
  const db = client.db("oauth-identities");
  await setupTestDb(db, null, STARTING_INVENTORY_TEST_OPTIONS);
  const players = db.collection<OAuthPlayer>("players");
  await ensurePlayerAccountIndexes(db);
  await ensureOAuthIdentityIndexes(db);
  const identity = (overrides: Partial<OAuthIdentity> = {}): OAuthIdentity => ({
    provider: "google", accountId: "google-id", email: "Player@Example.com",
    emailVerified: true, displayName: "Gallery-Owner", ...overrides,
  });
  const seed = async (id: string, email = `${id}@example.com`, extra: Record<string, unknown> = {}) => {
    const player = {
      ...createPlayerAccountRecord({
        playerId: id, email, screenName: id, passwordSalt: "salt", passwordHash: "hash",
      }),
      ...extra,
    };
    await players.insertOne(player);
    return player;
  };
  const rejects = (operation: Promise<unknown>, result: OAuthIdentityError["result"]) =>
    assert.rejects(operation, (error: unknown) => error instanceof OAuthIdentityError && error.result === result);

  await t.test("all providers retain detected emails without pretending unverified emails are verified", async () => {
    for (const { id } of OAUTH_PROVIDERS) {
      await players.deleteMany({});
      const verified = id === "google" || id === "discord";
      const hasEmail = id !== "steam" && id !== "instagram";
      const { player, accountCreated } = await resolveOAuthIdentity(db, identity({
        provider: id, accountId: `${id}-id`, email: hasEmail ? "  Player@Example.com " : undefined,
        emailVerified: verified,
      }));
      assert.equal(accountCreated, true);
      assert.equal(await db.collection("items").countDocuments({ owner: player._id }), 12);
      assert.equal(player.email_verified, verified);
      assert.deepEqual(player.verified_emails, verified ? ["player@example.com"] : []);
      if (hasEmail) assert.equal(player.email, "player@example.com");
      else assert.ok(player.email.endsWith("@oauth.artfunkel.invalid"));
      assert.equal(player.oauth_accounts?.[id]?.email, hasEmail ? "player@example.com" : null);
      assert.equal(player.oauth_accounts?.[id]?.email_verified, verified);
      assert.ok(player.oauth_accounts?.[id]?.verified_at instanceof Date);
    }
  });

  await t.test("signing up again after deletion never reuses the deleted player's session subject", async () => {
    await players.deleteMany({});
    const first = await resolveOAuthIdentity(db, identity());
    await players.deleteOne({ _id: first.player._id });
    const second = await resolveOAuthIdentity(db, identity());
    assert.equal(second.accountCreated, true);
    assert.notEqual(second.player._id, first.player._id);
  });

  await t.test("matching primary or legacy provider emails require existing-account sign-in for every provider", async () => {
    for (const { id } of OAUTH_PROVIDERS) {
      await players.deleteMany({});
      await seed("existing-player", "different@example.com", {
        oauth_accounts: { discord: { id: "legacy-id", email: "PLAYER@example.com" } },
      });
      await rejects(resolveOAuthIdentity(db, identity({ provider: id, accountId: "new-id" })), "existing-account");
      assert.equal(await players.countDocuments(), 1);
      assert.equal((await players.findOne({ _id: "existing-player" }))?.oauth_accounts?.[id]?.id,
        id === "discord" ? "legacy-id" : undefined);
    }
    await players.deleteMany({});
    await seed("existing-player", "PLAYER@EXAMPLE.COM");
    await rejects(resolveOAuthIdentity(db, identity({ emailVerified: false })), "existing-account");
    assert.equal(await findPlayerByAuthEmail(db, "playerX@example.com"), null);
  });

  await t.test("legacy Google identity and existing duplicate-email accounts still sign into their own players", async () => {
    await players.deleteMany({});
    await seed("google-player", "shared@example.com", { google_sub: "google-id" });
    await seed("discord-player", "legacy@oauth.artfunkel.invalid", {
      oauth_accounts: { discord: { id: "discord-id", email: "shared@example.com" } },
    });
    const google = await resolveOAuthIdentity(db, identity({ email: "shared@example.com" }));
    const discord = await resolveOAuthIdentity(db, identity({
      provider: "discord", accountId: "discord-id", email: "shared@example.com",
    }));
    assert.equal(google.player._id, "google-player");
    assert.equal(discord.player._id, "discord-player");
    assert.equal(google.player.oauth_accounts?.google?.id, "google-id");
    assert.equal(await players.countDocuments(), 2);
    await rejects(resolveOAuthIdentity(db, identity({
      provider: "microsoft", accountId: "new-id", email: "shared@example.com",
    })), "existing-account");
    await players.updateOne({ _id: "google-player" }, { $set: { active: false } });
    await rejects(resolveOAuthIdentity(db, identity({ email: "shared@example.com" })), "inactive");
  });

  await t.test("conflicting legacy Google identity records cannot silently replace an existing link", async () => {
    await players.deleteMany({});
    await seed("legacy-player", "player@example.com", {
      google_sub: "google-id", oauth_accounts: { google: { id: "different-id", email: "player@example.com" } },
    });
    await rejects(resolveOAuthIdentity(db, identity()), "conflict");
    assert.equal((await players.findOne({ _id: "legacy-player" }))?.oauth_accounts?.google?.id, "different-id");
  });

  await t.test("sync verifies and links the current player without changing game state or link creation time", async () => {
    await players.deleteMany({});
    const original = await seed("current-player");
    const first = await resolveOAuthIdentity(db, identity({ email: original.email }), original._id);
    const second = await resolveOAuthIdentity(db, identity({ email: original.email }), original._id);
    assert.equal(first.player._id, original._id);
    assert.equal(second.accountCreated, false);
    assert.equal(await players.countDocuments(), 1);
    assert.deepEqual(second.player.profile, original.profile);
    assert.equal(second.player.password_hash, original.password_hash);
    assert.equal(second.player.email_verified, true);
    assert.deepEqual(second.player.verified_emails, [original.email]);
    assert.deepEqual(first.player.oauth_accounts?.google?.linked_at, second.player.oauth_accounts?.google?.linked_at);
  });

  await t.test("sync cannot steal identities, replace an existing link, or claim another active player's email", async () => {
    await players.deleteMany({});
    await seed("current-player");
    const other = await resolveOAuthIdentity(db, identity());
    await rejects(resolveOAuthIdentity(db, identity(), "current-player"), "conflict");
    await rejects(resolveOAuthIdentity(db, identity({ accountId: "other-id" }), "current-player"), "conflict");
    await rejects(resolveOAuthIdentity(db, identity({
      email: "new@example.com", accountId: "replacement-id",
    }), other.player._id), "conflict");
    await players.updateOne({ _id: other.player._id }, { $set: { active: false } });
    await rejects(resolveOAuthIdentity(db, identity(), "current-player"), "conflict");
    assert.equal((await players.findOne({ _id: "current-player" }))?.oauth_accounts, undefined);
  });

  await t.test("email-free providers can sync, and a later email-bearing provider replaces an internal placeholder", async () => {
    await players.deleteMany({});
    const created = await resolveOAuthIdentity(db, identity({
      provider: "instagram", accountId: "instagram-id", email: undefined, emailVerified: false,
    }));
    const steam = await resolveOAuthIdentity(db, identity({
      provider: "steam", accountId: "steam-id", email: undefined, emailVerified: false,
    }), created.player._id);
    assert.ok(steam.player.email.endsWith("@oauth.artfunkel.invalid"));
    const google = await resolveOAuthIdentity(db, identity(), created.player._id);
    assert.equal(google.player.email, "player@example.com");
    assert.equal(google.player.username, "player@example.com");
    assert.equal(google.player.email_verified, true);
    assert.ok(google.player.oauth_accounts?.steam);
    assert.ok(google.player.oauth_accounts?.instagram);
  });

  await t.test("synced email aliases prevent subsequent OAuth and password registrations", async () => {
    await players.deleteMany({});
    await seed("current-player");
    await resolveOAuthIdentity(db, identity({ email: "alias+name@example.com" }), "current-player");
    assert.equal((await findPlayerByAuthEmail(db, "ALIAS+NAME@example.com"))?._id, "current-player");
    assert.equal(await findPlayerByAuthEmail(db, "aliasXname@example.com"), null);
    await rejects(resolveOAuthIdentity(db, identity({
      provider: "discord", accountId: "discord-id", email: "alias+name@example.com",
    })), "existing-account");
    await assert.rejects(seed("password-player", "alias+name@example.com"), { code: 11000 });
  });

  await t.test("concurrent registrations cannot fall back to duplicate synthetic-email players", async () => {
    await players.deleteMany({});
    const result = await Promise.allSettled([
      resolveOAuthIdentity(db, identity()),
      resolveOAuthIdentity(db, identity({ provider: "discord", accountId: "discord-id" })),
    ]);
    assert.equal(result.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(result.filter(({ status }) => status === "rejected").length, 1);
    assert.equal(await players.countDocuments(), 1);
    assert.equal((await players.findOne({}))?.email, "player@example.com");
    await players.deleteMany({});
    const same = await Promise.all([resolveOAuthIdentity(db, identity()), resolveOAuthIdentity(db, identity())]);
    assert.equal(same[0].player._id, same[1].player._id);
    assert.equal(await players.countDocuments(), 1);
  });

  await t.test("concurrent syncs cannot claim the same email or overwrite the same platform", async () => {
    await players.deleteMany({});
    await seed("first-player");
    await seed("second-player");
    const aliases = await Promise.allSettled([
      resolveOAuthIdentity(db, identity(), "first-player"),
      resolveOAuthIdentity(db, identity({ provider: "discord", accountId: "discord-id" }), "second-player"),
    ]);
    assert.equal(aliases.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(await players.countDocuments({ account_emails: "player@example.com" }), 1);
    await players.deleteMany({});
    await seed("current-player");
    const links = await Promise.allSettled([
      resolveOAuthIdentity(db, identity({ email: undefined }), "current-player"),
      resolveOAuthIdentity(db, identity({ accountId: "different-id", email: undefined }), "current-player"),
    ]);
    assert.equal(links.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(links.filter(({ status }) => status === "rejected").length, 1);
  });
});
