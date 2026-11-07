import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { MongoClient, type Db, type Document } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import ts from "typescript";
import * as artists from "./contributing-artists.ts";
import * as artistTypes from "./artist-types.ts";
import { createPlayerAccountRecord, normalizePlayerEmail } from "./player-account.ts";
import { authenticatePlayerPassword } from "./player-password-auth.ts";
import { verifyPassword } from "./password.ts";
import {
  createFeaturedArtistVisitors, getGalleryNpcs, refreshNpcSpawns, visitorUsesOwnGalleryBenefits,
} from "./npc-gameplay.ts";
import { deletePlayerAccount } from "./account-deletion.ts";
import type { Artwork, GameItem, ItemAttribute, LootData } from "./gameplay.ts";
import * as gameplay from "./gameplay.ts";
import { createArtistArtworkPreview } from "./artist-artwork-preview.ts";
import * as artworkInput from "./artwork-create-input.ts";
import { DEFAULT_ACTUAL_GAMEPLAY_CONFIG, getGameplaySettings, toStoredGameplayConfig, validateGameplayConfig } from "./game-settings.ts";
import { MASTERPIECE_EFFECT_CODES } from "./masterpiece-effects.ts";
import * as masterpieceEffects from "./masterpiece-effects.ts";
import * as legendary from "./legendary-attributes.ts";
import * as npcGameplay from "./npc-gameplay.ts";
import * as tutorial from "./tutorial.ts";
import * as tutorialElements from "../shared/tutorial.ts";
import * as artworkEffects from "./artwork-effects.ts";
import * as rareSpecialAttributes from "./rare-special-attributes.ts";
import * as itemArtwork from "./item-artwork.ts";
import * as socialBattery from "./social-battery.ts";
import { calculateGalleryRates, getAverageDropValueForLevel, getXpChunk } from "./collection-gameplay.ts";
import { grantStandardNpcReward } from "./standard-npc-reward-service.ts";
import * as settingsCore from "./game-settings.ts";
import * as publicShowcaseCore from "./public-showcase-core.ts";
import * as galleryMetadataCore from "./gallery-metadata-core.ts";
import * as galleryFinishes from "./gallery-finishes.ts";
import * as playerGalleryFinishes from "./player-gallery-finishes.ts";
import * as adminItemCreator from "./admin-item-creator.ts";
import * as itemAttributeCounts from "./item-attribute-counts.ts";
import * as itemDropChance from "./item-drop-chance.ts";
import * as itemSerials from "./item-serials.ts";
import * as offerReveal from "./offer-reveal.ts";
import { getItemDisposalFilter } from "./item-permissions.ts";
import * as cardCatalog from "../components/item-cards/catalog.ts";
import { setupTestDb, STARTING_INVENTORY_TEST_OPTIONS } from "./test-utils/db-setup.ts";

const require = createRequire(import.meta.url);
const { NextResponse } = require("next/server");
type Doc = Document & { _id: string };
const documents = (database: Db, name: string) => database.collection<Doc>(name);
const password = "An-example-password-for-tests-2026";
const applicationInput = {
  name: "Example Artist", email: "applicant@example.com", dateOfBirth: "2000-01-02",
  portfolioUrl: "https://portfolio.example.com/", bio: "An artist biography.",
  featureLink: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
  screenName: "Artist-Player", password, confirmPassword: password,
};

async function load<T>(relative: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const source = await readFile(new URL(relative, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return runInNewContext(`${code}\nexports`, {
    exports: {}, console, URL, Date, Request, Response, FormData, File, ...globals,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }) as T;
}

async function seedArtist(database: Db, index: number, featured = false) {
  const id = `artist-player-${index}`;
  const artistId = `artist-${index}`;
  await documents(database, "players").insertOne({
    ...createPlayerAccountRecord({
      playerId: id, email: `artist-${index}@example.com`, screenName: `Artist-${index}`,
      passwordHash: "fixture-hash", passwordSalt: "fixture-salt",
    }),
    account_type: "artist", artist_id: artistId,
    ...(featured ? { artist_featured: true, artist_featured_slot: index + 1 } : {}),
  });
  await documents(database, "artists").insertOne({
    _id: artistId, artist_name: `Artist ${index}`, player_id: id,
    date_of_birth: "2000-01-01", portfolio_url: "https://example.com/", bio: "Biography", social_links: {},
  });
  return { id, artistId };
}

test("artist applications, publication and featured galleries persist without granting artist privileges to players", async t => {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  t.after(async () => { await client.close(); await server.stop(); });

  await t.test("applications validate the eighteenth birthday boundary and safe portfolio URLs", () => {
    const now = new Date("2026-11-02T12:00:00Z");
    assert.equal(artists.validateArtistApplication({ ...applicationInput, featureLink: "" }, now).feature_link, "");
    assert.equal(artists.validateArtistApplication({ ...applicationInput, featureLink: undefined }, now).feature_link, "");
    for (const featureLink of ["javascript:alert(1)", "https://user:password@example.com", `https://example.com/${"a".repeat(2048)}`]) {
      assert.throws(() => artists.validateArtistApplication({ ...applicationInput, featureLink }, now), /valid http or https/);
      assert.throws(() => artists.validateArtistProfile({ portfolioUrl: applicationInput.portfolioUrl, featureLink }), /valid http or https/);
    }
    assert.equal(artists.validateArtistApplication({ ...applicationInput, dateOfBirth: "2008-11-02" }, now).date_of_birth, "2008-11-02");
    for (const dateOfBirth of ["2008-11-03", "2020-01-01", "2000-02-31", "", "invalid"]) {
      assert.throws(() => artists.validateArtistApplication({ ...applicationInput, dateOfBirth }, now), /at least 18/);
    }
    for (const portfolioUrl of ["", "javascript:alert(1)", "file:///private", "https://user:password@example.com/"]) {
      assert.throws(() => artists.validateArtistApplication({ ...applicationInput, portfolioUrl }, now), /valid http or https/);
    }
  });

  await t.test("new applicants have only hashed credentials pending approval; approval creates linked artist and playable account exactly once", async () => {
    const db = client.db("artist-application-new");
    await setupTestDb(db, null, STARTING_INVENTORY_TEST_OPTIONS);
    const id = await artists.submitArtistApplication(db, applicationInput);
    assert.equal(await documents(db, "players").countDocuments(), 0);
    const pending = await documents(db, "artist_applications").findOne({ _id: id });
    assert.equal(pending?.feature_link, applicationInput.featureLink);
    assert.ok(pending?.credentials.hash);
    assert.equal(JSON.stringify(pending).includes(password), false);
    assert.ok(await verifyPassword(password, pending.credentials.salt, pending.credentials.hash));
    const approvals = await Promise.allSettled([
      artists.approveArtistApplication(db, id, "admin@example.com"),
      artists.approveArtistApplication(db, id, "admin@example.com"),
    ]);
    assert.equal(approvals.filter(result => result.status === "fulfilled").length, 1);
    const player = await documents(db, "players").findOne({ email: applicationInput.email });
    assert.equal(player?.account_type, "artist");
    assert.equal(player?.role, "player");
    assert.equal(player?.artist_id, id);
    assert.equal(player?.screen_name, applicationInput.screenName);
    assert.ok(player?.profile.inventory_cap > 0);
    assert.equal(await documents(db, "items").countDocuments({ owner: player!._id }), 6);
    assert.equal(artistTypes.getPlayerLandingPath(player!), "/artist");
    assert.ok(await documents(db, "artists").findOne({ _id: id, player_id: player!._id }));
    assert.equal((await artists.getPublicArtistProfile(db, player!._id))?.featureLink, applicationInput.featureLink);
    assert.equal((await documents(db, "artist_applications").findOne({ _id: id }))?.credentials, undefined);
    const login = await load<{ POST: (request: Request) => Promise<Response> }>("../app/api/auth/player/login/route.ts", {
      "next/server": { NextResponse }, "@/server/mongodb": { getDatabase: async () => db },
      "@/server/player-account": { normalizePlayerEmail }, "@/server/player-password-auth": { authenticatePlayerPassword },
      "@/server/patreon": { syncPatreonMembershipAfterSignIn: async () => {} },
      "@/server/session": { PLAYER_SESSION_COOKIE: "artfunkel_player_session", playerSessionCookieOptions: { path: "/" },
        createPlayerSessionToken: async () => "artist-player-session" },
    });
    const signIn = await login.POST(new Request("http://localhost/api/auth/player/login", {
      method: "POST", body: JSON.stringify({ email: applicationInput.email, password }),
    }));
    assert.equal(signIn.status, 200);
    assert.equal((await signIn.json()).redirectTo, "/artist");
  });

  await t.test("artist profile updates persist, replace and clear feature links while legacy records default to no feature", async () => {
    const db = client.db("artist-feature-profile");
    const account = await seedArtist(db, 0);
    assert.equal((await artists.getPublicArtistProfile(db, account.id))?.featureLink, "");
    const route = await load<typeof import("../app/api/artist/profile/route.ts")>("../app/api/artist/profile/route.ts", {
      "next/server": { NextResponse },
      "@/server/artist-api": {
        requireArtistApi: async () => ({ ok: true, database: db, artist: { _id: account.artistId } }),
        artistErrorResponse: (error: Error) => NextResponse.json({ error: error.message }, { status: 400 }),
      },
      "@/server/contributing-artists": { validateArtistProfile: artists.validateArtistProfile },
    });
    for (const featureLink of [applicationInput.featureLink, " https://vimeo.com/76979871 ", "https://portfolio.example.com/feature", ""]) {
      const result = await route.PATCH(new Request("http://localhost/api/artist/profile", {
        method: "PATCH", body: JSON.stringify({
          portfolioUrl: applicationInput.portfolioUrl, bio: applicationInput.bio, featureLink,
          socialLinks: { instagram: "https://www.instagram.com/test.artist/" },
        }),
      }));
      assert.equal(result.status, 200);
      assert.equal((await documents(db, "artists").findOne({ _id: account.artistId }))?.feature_link, featureLink.trim());
      const profile = await artists.getPublicArtistProfile(db, account.id);
      assert.equal(profile?.featureLink, featureLink.trim());
      assert.equal(profile?.bio, applicationInput.bio);
      assert.equal(profile?.socialLinks.instagram, "https://www.instagram.com/test.artist/");
    }
    const invalid = await route.PATCH(new Request("http://localhost/api/artist/profile", {
      method: "PATCH", body: JSON.stringify({ portfolioUrl: applicationInput.portfolioUrl, featureLink: "javascript:alert(1)" }),
    }));
    assert.equal(invalid.status, 400);
    assert.equal((await artists.getPublicArtistProfile(db, account.id))?.featureLink, "");
  });

  await t.test("existing-player applications ignore supplied account fields, block duplicates and preserve player progress", async () => {
    const db = client.db("artist-application-existing");
    const player = createPlayerAccountRecord({
      email: "existing@example.com", screenName: "Existing-Player", passwordHash: "retained", passwordSalt: "retained",
    });
    await documents(db, "players").insertOne({
      ...player, oauth_accounts: { discord: { id: "discord-test", email: "alias@example.com" } },
      profile: { ...player.profile, bank_balance: 987654, xp: 123 },
    });
    await assert.rejects(artists.submitArtistApplication(db, { ...applicationInput, email: "ALIAS@example.com" }), /Log in.*Become a contributing artist/);
    const id = await artists.submitArtistApplication(db, {
      ...applicationInput, email: "attacker@example.com", screenName: "Replaced-Player", password: "ignored",
    }, player._id);
    const pending = await documents(db, "artist_applications").findOne({ _id: id });
    assert.equal(pending?.email, player.email);
    assert.equal(pending?.screen_name, player.screen_name);
    assert.equal(pending?.credentials, undefined);
    await assert.rejects(artists.submitArtistApplication(db, applicationInput, player._id), /already awaiting review/);
    await artists.approveArtistApplication(db, id, "admin@example.com");
    const upgraded = await documents(db, "players").findOne({ _id: player._id });
    assert.equal(upgraded?.profile.bank_balance, 987654);
    assert.equal(upgraded?.profile.xp, 123);
    assert.equal(upgraded?.password_hash, "retained");
    assert.equal(upgraded?.screen_name, player.screen_name);
    assert.equal(upgraded?.artist_id, id);
    assert.equal(await documents(db, "players").countDocuments(), 1);
  });

  await t.test("approval refuses an email acquired by another player after submission without merging accounts", async () => {
    const db = client.db("artist-approval-email-race");
    const id = await artists.submitArtistApplication(db, applicationInput);
    const player = createPlayerAccountRecord({
      email: applicationInput.email, screenName: "Different-Player", passwordSalt: "salt", passwordHash: "hash",
    });
    await documents(db, "players").insertOne(player);
    await assert.rejects(artists.approveArtistApplication(db, id, "admin@example.com"), /apply from Account settings/);
    assert.equal(await documents(db, "artists").countDocuments(), 0);
    assert.equal((await documents(db, "players").findOne({ _id: player._id }))?.artist_id, undefined);
    assert.equal((await documents(db, "artist_applications").findOne({ _id: id }))?.status, "pending");
  });

  await t.test("the three-featured-artist limit is enforced across concurrent requests and a removed flag frees a slot", async () => {
    const db = client.db("artist-featured-limit");
    const accounts = await Promise.all(Array.from({ length: 6 }, (_, index) => seedArtist(db, index)));
    await documents(db, "npcs").insertMany(accounts.map(account => ({ _id: account.id, owner_id: account.id })));
    const results = await Promise.allSettled(accounts.map(account => artists.setArtistFeatured(db, account.id, true)));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 3);
    assert.equal(await documents(db, "players").countDocuments({ artist_featured: true }), 3);
    const featured = await documents(db, "players").find({ artist_featured: true }).toArray();
    assert.equal(new Set(featured.map(player => player.artist_featured_slot)).size, 3);
    assert.equal(await documents(db, "npcs").countDocuments({ owner_id: { $in: featured.map(player => player._id) } }), 0);
    await documents(db, "npcs").insertOne({ _id: "featured-visitor", owner_id: featured[0]._id, players_met: ["viewer"] });
    await artists.setArtistFeatured(db, featured[0]._id, true);
    assert.ok(await documents(db, "npcs").findOne({ _id: "featured-visitor" }));
    const unfeatured = await documents(db, "players").findOne({ artist_featured: { $ne: true } });
    await documents(db, "players").updateOne({ _id: featured[0]._id }, { $set: { active: false } });
    await artists.setArtistFeatured(db, featured[0]._id, false);
    assert.equal(await documents(db, "npcs").findOne({ _id: "featured-visitor" }), null);
    await assert.rejects(artists.setArtistFeatured(db, featured[0]._id, true), /not found/);
    await artists.setArtistFeatured(db, unfeatured!._id, true);
    assert.equal(await documents(db, "players").countDocuments({ artist_featured: true }), 3);
  });

  await t.test("featured cards pick the rarest active work and expose no application, credential or licensing data", async () => {
    const db = client.db("artist-public-data");
    const account = await seedArtist(db, 0, true);
    await documents(db, "players").updateOne({ _id: account.id }, {
      $set: { oauth_accounts: { instagram: { id: "instagram-id", username: "test.artist" } } },
    });
    const featureAdjustment = { x: -45, y: 60, scale: 1.8 };
    const thumbnailAdjustment = { x: 30, y: -70, scale: 1.2 };
    const works = [
      { _id: "common", title: "Common", rarity: "common", active: true },
      { _id: "rare", title: "Rare", rarity: "rare", active: true,
        feature_card_adjustment: featureAdjustment, thumbnail_adjustment: thumbnailAdjustment },
      { _id: "pending-masterpiece", title: "Pending", rarity: "masterpiece", active: false },
    ];
    await documents(db, "artworks").insertMany(works.map(work => ({
      ...work, artist_id: account.artistId, artist: "Artist 0", submitted_by: account.id,
      artist_license: { private: true }, created_by: "admin-private@example.com",
    })));
    const [card] = await artists.getFeaturedArtistGalleries(db);
    assert.equal(card.thumbnail?._id, "rare");
    assert.deepEqual(card.thumbnail?.feature_card_adjustment, featureAdjustment);
    assert.deepEqual(card.thumbnail?.thumbnail_adjustment, thumbnailAdjustment);
    assert.equal(card.instagramUsername, "test.artist");
    assert.equal(JSON.stringify(card).includes("date_of_birth"), false);
    assert.equal(JSON.stringify(card).includes("artist-0@example.com"), false);
    const publicWorks = await artists.getArtistWorks(db, account.artistId);
    assert.deepEqual(publicWorks.map(work => work._id), ["rare", "common"]);
    assert.deepEqual(publicWorks[0].feature_card_adjustment, featureAdjustment);
    assert.doesNotMatch(JSON.stringify(publicWorks), /submitted_by|artist_license|admin-private/);
  });

  await t.test("public artist gallery lookup uses live artist-player links without exposing private account data", async () => {
    const db = client.db("artist-gallery-links");
    const account = await seedArtist(db, 0);
    await documents(db, "artists").insertOne({
      _id: "historical-artist", artist_name: "Historical Artist", player_id: account.id,
    });
    const route = await load<typeof import("../app/api/artists/[artistId]/gallery/route.ts")>(
      "../app/api/artists/[artistId]/gallery/route.ts", {
        "next/server": { NextResponse }, "@/server/mongodb": { getDatabase: async () => db },
      },
    );
    const lookup = async (artistId: string) => {
      const result = await route.GET(new Request("http://localhost/api/artists/artist/gallery"), {
        params: Promise.resolve({ artistId }),
      });
      assert.equal(result.status, 200);
      assert.equal(result.headers.get("cache-control"), "no-store");
      return result.json();
    };
    assert.deepEqual(await lookup(account.artistId), { playerId: account.id });
    await documents(db, "players").updateOne({ _id: account.id }, { $set: { artist_featured: true } });
    assert.deepEqual(await lookup(account.artistId), { playerId: account.id });
    for (const artistId of ["historical-artist", "unknown-artist", account.id]) {
      assert.deepEqual(await lookup(artistId), { playerId: null });
    }
    await documents(db, "players").updateOne({ _id: account.id }, { $set: { active: false } });
    assert.deepEqual(await lookup(account.artistId), { playerId: null });
    await documents(db, "players").updateOne({ _id: account.id }, { $set: { active: true, account_deletion: true } });
    assert.deepEqual(await lookup(account.artistId), { playerId: null });
    await documents(db, "players").deleteOne({ _id: account.id });
    assert.ok(await documents(db, "artists").findOne({ _id: account.artistId }));
    assert.deepEqual(await lookup(account.artistId), { playerId: null });
  });

  await t.test("admin artist Originals go only to the linked artist without random variants and remain unique across concurrent creation", async () => {
    const db = client.db("artist-admin-originals");
    const account = await seedArtist(db, 0);
    await documents(db, "players").insertOne(createPlayerAccountRecord({
      playerId: "unrelated-player", email: "other@example.com", screenName: "Other",
      passwordHash: "hash", passwordSalt: "salt",
    }));
    const work: Artwork = {
      _id: "eligible", artist_id: account.artistId, artist: "Artist 0", title: "Artist work",
      date: 2026, genre: "Abstract", medium: "Oil", rarity: "rare", value_scale: 0.5,
      width: 80, height: 100, active: true, special_attributes: ["special"],
    };
    await documents(db, "artworks").insertMany([
      work, { ...work, _id: "already-original" }, { ...work, _id: "concurrent" },
      { ...work, _id: "legacy", artist_id: "unlinked-artist" },
      { ...work, _id: "inactive-work", active: false },
    ]);
    await documents(db, "attributes").insertMany(["first", "second", "special"].map(id => ({
      _id: id, title: id, type: "test", active: true, description: id, icon: "fa-star", npc_name: id,
    })));
    const lootData: LootData = {
      basic_crate_cost: 1, items_per_basic_crate: 1, crate_expense_per_masterpiece: 1,
      rarity_values: {
        common: { min: 1, max: 10 }, uncommon: { min: 10, max: 20 }, rare: { min: 20, max: 30 },
        legendary: { min: 30, max: 40 }, masterpiece: { min: 40, max: 50 },
      },
      seasonal_items: { common: [], uncommon: [], rare: [], legendary: [], masterpiece: [] },
      global_foil_chance: 1, global_unlocked_chance: 1, global_patreon_chance: 0, global_misprint_chance: 0,
    };
    const config = {
      ...DEFAULT_ACTUAL_GAMEPLAY_CONFIG,
      foilProbability: 1, mintProbability: 1, unlockedProbability: 1, cardRendererProbability: 1,
    };
    await documents(db, "metadata").insertMany([
      { _id: "loot-data", loot_data: lootData },
      { _id: "gameplay-settings", gameplay: { configs: { actual: toStoredGameplayConfig(config) } } },
    ]);
    let authorized = true;
    const route = await load<typeof import("../app/api/admin/items/route.ts")>(
      "../app/api/admin/items/route.ts", {
        "next/server": { NextResponse }, "@/server/mongodb": { getDatabase: async () => db },
        "@/server/admin-api": { requireAdminApi: async () => authorized
          ? { ok: true, session: { email: "admin@example.com" } }
          : { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } },
        "@/components/item-cards/catalog": cardCatalog, "@/server/admin-item-creator": adminItemCreator,
        "@/server/item-attribute-counts": itemAttributeCounts, "@/server/item-drop-chance": itemDropChance,
        "@/server/item-serials": itemSerials, "@/server/game-settings": settingsCore,
        "@/server/offer-reveal": offerReveal, "@/server/raffle-gameplay": { RAFFLE_MAX_POTENCY: 10 },
        "@/server/live-auction-event": {},
      },
    );
    const lookup = (artworkId: string) => route.GET(new Request(`http://localhost/api/admin/items?artworkId=${artworkId}`));
    const draft: adminItemCreator.AdminItemCustomization = {
      condition: 0.6, mint: true, foil: true, unlocked: true, cardRenderer: "legacy",
      original: false, level: 1, rollCount: 0, rerollSpent: 0, seasonal: false, lottery: 0,
      patreon: false, vintage: false, permanent: false, debug: false, source: "admin grant", tags: [],
      misprint: false, forgery: false, forgeryQuality: 0.5, forgeryIdentified: false,
      attributes: {
        locked: [], unlocked: [{ attributeId: "first", value: 0.6 }, { attributeId: "second", value: 0.7 }],
        special: [{ attributeId: "special", value: 0.9 }],
      },
    };
    const create = (artworkId: string, type = "artist_original") => route.POST(new Request("http://localhost/api/admin/items", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ destination: { type, playerId: "unrelated-player" }, item: { ...draft, artworkId } }),
    }));
    const eligibility = await lookup(work._id);
    assert.equal(eligibility.headers.get("cache-control"), "no-store");
    assert.deepEqual(await eligibility.json(), { artistOriginalRecipient: { id: account.id, screenName: "Artist-0" } });
    const created = await create(work._id);
    assert.equal(created.status, 200, JSON.stringify(await created.clone().json()));
    const { itemId } = await created.json();
    const saved = await db.collection<GameItem>("items").findOne({ _id: itemId });
    assert.ok(saved);
    assert.equal(saved.owner, account.id);
    assert.equal(saved.original, true);
    assert.equal(saved.serial_number, 0);
    assert.equal(saved.status, "claimed");
    assert.equal(saved.foil, false);
    assert.equal(saved.unlocked, false);
    assert.equal(saved.mint, false);
    assert.equal(saved.mint_value_multiplier, 1);
    assert.equal(saved.condition, draft.condition);
    assert.equal(saved.card_renderer, "museum");
    assert.equal(saved.transaction_history[0].to_owner, account.id);
    assert.deepEqual(saved.attributes.locked.map(attribute => attribute._id), ["first"]);
    assert.deepEqual(saved.attributes.unlocked.map(attribute => attribute._id), ["second"]);
    assert.deepEqual(saved.attributes.special.map(attribute => attribute._id), ["special"]);
    assert.equal((await documents(db, "artworks").findOne({ _id: work._id }))?.serial_counter, undefined);
    assert.deepEqual(await (await lookup(work._id)).json(), { artistOriginalRecipient: null });
    assert.equal((await create(work._id)).status, 409);

    await db.collection<GameItem>("items").insertOne({
      ...saved, _id: "existing-original", artwork_id: "already-original", owner: "unrelated-player", status: "auctioned",
    });
    assert.deepEqual(await (await lookup("already-original")).json(), { artistOriginalRecipient: null });
    assert.equal((await create("already-original")).status, 409);
    assert.equal((await create("inactive-work")).status, 200, "The admin creator still supports inactive catalog artwork");
    const simultaneous = await Promise.all([create("concurrent"), create("concurrent")]);
    assert.deepEqual(simultaneous.map(result => result.status).sort(), [200, 409]);
    assert.equal(await db.collection<GameItem>("items").countDocuments({ artwork_id: "concurrent", original: true }), 1);
    assert.deepEqual(await (await lookup("legacy")).json(), { artistOriginalRecipient: null });
    assert.equal((await create("legacy")).status, 404);
    for (const changes of [{ active: false }, { active: true, account_deletion: true }]) {
      await documents(db, "players").updateOne({ _id: account.id }, { $set: changes });
      await documents(db, "items").deleteMany({ artwork_id: "concurrent" });
      assert.deepEqual(await (await lookup("concurrent")).json(), { artistOriginalRecipient: null });
      assert.equal((await create("concurrent")).status, 404);
    }

    const ordinary = await create("legacy", "player");
    assert.equal(ordinary.status, 200);
    const ordinaryItem = await db.collection<GameItem>("items").findOne({ _id: (await ordinary.json()).itemId });
    assert.equal(ordinaryItem?.owner, "unrelated-player");
    assert.equal(ordinaryItem?.original, false);
    assert.equal(ordinaryItem?.foil, true);
    assert.equal(ordinaryItem?.unlocked, true);
    assert.equal(ordinaryItem?.mint, true);
    assert.equal(ordinaryItem?.card_renderer, "legacy");
    authorized = false;
    assert.equal((await lookup("eligible")).status, 401);
    assert.equal((await create("legacy")).status, 401);
  });

  await t.test("artist galleries combine active uploads with featured and permanent game items and persist owner-only finishes", async () => {
    const db = client.db("combined-artist-gallery");
    await setupTestDb(db, null, STARTING_INVENTORY_TEST_OPTIONS);
    await documents(db, "metadata").updateOne({ _id: "gameplay-settings" }, {
      $set: {
        "gameplay.configs.actual.gallery_overview_distance_cm": 1250,
        "gameplay.configs.actual.gallery_visitor_scale": 0.65,
        "gameplay.configs.actual.gallery_camera_height_cm": 175,
        "gameplay.configs.actual.gallery_artwork_center_height_cm": 160,
      },
    }, { upsert: true });
    const account = await seedArtist(db, 0, true);
    await documents(db, "players").insertOne(createPlayerAccountRecord({
      playerId: "ordinary-player", email: "ordinary@example.com", screenName: "Ordinary",
      passwordSalt: "salt", passwordHash: "hash",
    }));
    const uploaded: Artwork = {
      _id: "uploaded", artist_id: account.artistId, artist: "Artist 0", title: "Uploaded",
      date: 2026, genre: "Abstract", medium: "Oil", rarity: "legendary", effect_id: "uploaded-effect",
      height: 100, width: 80, active: true, value_scale: 0.5,
    };
    const acquired: Artwork = {
      ...uploaded, _id: "acquired", title: "Acquired", artist_id: "another-artist",
      artist: "Another Artist", effect_id: "game-effect",
    };
    await documents(db, "artworks").insertMany([
      uploaded, acquired, { ...uploaded, _id: "pending", active: false, submission_status: "pending" },
    ]);
    await documents(db, "artwork_effects").insertMany(["uploaded-effect", "game-effect"].map(id => ({
      _id: id, title: id, description: id, flavor_text: id, code: id, effect_type: "legendary", active: true,
    })));
    const featured = { ...createArtistArtworkPreview(acquired), _id: "featured-copy", owner: account.id };
    const permanent = {
      ...featured, _id: "permanent-copy", permanent: true, status: "claimed",
      card_renderer: "museum", values: { ...featured.values, actual: 123 },
    };
    await documents(db, "items").insertMany([
      featured, permanent, { ...featured, _id: "private-inventory", status: "claimed" },
      { ...featured, _id: "ordinary-copy", owner: "ordinary-player" },
      { ...featured, _id: "auction-copy", status: "auctioned" },
    ]);
    await documents(db, "auctions").insertOne({
      _id: "gallery-auction", item_id: "auction-copy", seller_id: account.id, seller_name: "Artist",
      viewer: "public", current_bid: 250, buy_now: 500, current_winner_id: null,
      expiration: new Date(Date.now() + 60_000).toISOString(),
    });
    await documents(db, "galleries").insertOne({ _id: "artist-existing-gallery", owner_id: account.id, active: true });
    const publicShowcase = await load<typeof import("./public-showcase.ts")>("./public-showcase.ts", {
      "server-only": {}, "./item-artwork": itemArtwork, "./public-showcase-core": publicShowcaseCore,
    });
    const metadata = await load<typeof import("./gallery-metadata.ts")>("./gallery-metadata.ts", {
      "server-only": {}, "./masterpiece-effects.ts": masterpieceEffects,
      "./gallery-metadata-core": galleryMetadataCore, "./public-showcase-core.ts": publicShowcaseCore,
    });
    let viewerId = "ordinary-player";
    const playerApi = { requirePlayerApi: async () => ({ ok: true, session: { playerId: viewerId } }) };
    const galleryDependencies = {
        "next/server": { NextResponse }, "@/server/gallery-metadata": metadata,
        "@/server/community-reactions": { getCommunityReactionSummary: async () => ({ counts: [], viewerReaction: null }) },
        "@/server/artwork-effects": artworkEffects, "@/server/item-artwork": itemArtwork,
        "@/server/mongodb": { getDatabase: async () => db }, "@/server/npc-gameplay": { getGalleryNpcs },
        "@/server/player-api": playerApi, "@/server/player-gallery-finishes": playerGalleryFinishes,
        "@/server/public-showcase": publicShowcase, "@/server/public-showcase-core": publicShowcaseCore,
        "@/server/contributing-artists": artists, "@/server/artist-artwork-preview": { createArtistArtworkPreview },
        "@/server/collection-gameplay": { calculateGalleryRates },
        "@/server/game-settings": { getGameplaySettings },
    };
    const exhibition = await load<typeof import("./gallery-exhibition.ts")>("./gallery-exhibition.ts", {
      "server-only": {}, ...galleryDependencies,
    });
    const route = await load<typeof import("../app/api/play/galleries/[playerId]/route.ts")>(
      "../app/api/play/galleries/[playerId]/route.ts", {
        ...galleryDependencies, "@/server/gallery-exhibition": exhibition,
      });
    const get = async (playerId = account.id) => {
      const response = await route.GET(new Request("http://localhost/api/play/galleries"), { params: Promise.resolve({ playerId }) });
      assert.equal(response.status, 200);
      return response.json();
    };
    const gallery = await get();
    assert.equal(gallery.overviewDistanceCm, 1250);
    assert.equal(gallery.visitorScale, 0.65);
    assert.equal(gallery.cameraHeightCm, 175);
    assert.equal(gallery.artworkCenterHeightCm, 160);
    assert.deepEqual(gallery.items.map((item: { _id: string }) => item._id).sort(), ["artist-preview:uploaded", "featured-copy", "permanent-copy"]);
    assert.deepEqual(gallery.artistWorks.map((work: { _id: string }) => work._id), ["uploaded"]);
    assert.deepEqual(gallery.legendaryAttributes.map((effect: { id: string }) => effect.id).sort(), ["game-effect", "uploaded-effect"]);
    assert.equal(gallery.items.find((item: { _id: string }) => item._id === "featured-copy").owner, "unknown");
    assert.equal(gallery.items.find((item: { _id: string }) => item._id === "permanent-copy").permanent, true);
    assert.equal(gallery.metadata.item_count, 2, "Unowned showcase previews do not boost game gallery metadata");
    assert.equal(gallery.metadata.permanent_count, 1);
    assert.equal(gallery.galleryId, "artist-existing-gallery");
    assert.deepEqual(gallery.auctions.map((auction: { item: { _id: string } }) => auction.item._id), ["auction-copy"]);
    const expectedRates = await calculateGalleryRates(db, gallery.owner.level,
      await itemArtwork.hydrateGameItems(db, [featured]), new Date(), (await getGameplaySettings(db)).active);
    assert.deepEqual(gallery.rates, expectedRates, "Rates use the owner's real featured items, not artist previews or permanent works");
    const forgery = { ...featured, authenticity: { ...featured.authenticity, forgery: true, forgery_quality: 0.25 } };
    await documents(db, "items").updateOne({ _id: featured._id }, { $set: { authenticity: forgery.authenticity } });
    const forgedGallery = await get();
    assert.deepEqual(forgedGallery.rates, await calculateGalleryRates(db, gallery.owner.level,
      await itemArtwork.hydrateGameItems(db, [forgery]), new Date(), (await getGameplaySettings(db)).active),
    "Rates must be calculated before public authenticity masking hides the forgery penalty");
    assert.ok(forgedGallery.rates.moneyPerHour < gallery.rates.moneyPerHour);
    assert.ok(forgedGallery.rates.xpPerHour < gallery.rates.xpPerHour);
    assert.equal(forgedGallery.items.find((item: { _id: string }) => item._id === featured._id).authenticity.forgery, undefined);
    await documents(db, "items").updateOne({ _id: featured._id }, { $set: { authenticity: featured.authenticity } });
    await documents(db, "artworks").updateOne({ _id: acquired._id }, { $set: {
      artist_license: { private: "private-license" }, submitted_by: "private-submitter", created_by: "private-admin",
    } });
    const anonymous = await exhibition.getGalleryExhibition(db, account.id, null);
    assert.ok(anonymous);
    assert.equal(anonymous.overviewDistanceCm, 1250);
    assert.equal(anonymous.visitorScale, 0.65);
    assert.equal(anonymous.cameraHeightCm, 175);
    assert.equal(anonymous.artworkCenterHeightCm, 160);
    assert.deepEqual(Array.from(anonymous.items, item => item._id).sort(), ["artist-preview:uploaded", "featured-copy", "permanent-copy"]);
    assert.equal(anonymous.items.find(item => item._id === "featured-copy")?.owner, "unknown");
    assert.equal(anonymous.metadata, null);
    assert.equal(anonymous.rates, null);
    assert.deepEqual(Array.from(anonymous.auctions), []);
    assert.doesNotMatch(JSON.stringify(anonymous), /private-inventory|private-license|private-submitter|private-admin|password_hash|password_salt/);
    assert.equal("npcs" in anonymous, false);
    let signedIn: string | null = null;
    const page = await load<typeof import("../app/gallery/[playerId]/page.tsx")>("../app/gallery/[playerId]/page.tsx", {
      "next/navigation": {
        redirect: (href: string) => { throw new Error(`Redirect: ${href}`); },
        notFound: () => { throw new Error("Not found"); },
      },
      "react/jsx-runtime": require("react/jsx-runtime"),
      "@/server/mongodb": { getDatabase: async () => db },
      "@/server/session": { getPlayerSession: async () => signedIn ? { playerId: signedIn } : null },
      "@/server/gallery-exhibition": exhibition,
      "./anonymous-gallery-view": { default: () => null },
    });
    for (const id of [account.id, "ordinary-player"]) {
      const element = await page.default({ params: Promise.resolve({ playerId: id }) });
      assert.equal(element.props.gallery.owner.playerId, id);
      assert.equal(element.props.gallery.artist?.id ?? null, id === account.id ? account.artistId : null);
      signedIn = "ordinary-player";
      await assert.rejects(page.default({ params: Promise.resolve({ playerId: id }) }), {
        message: `Redirect: /play?gallery=${encodeURIComponent(id)}`,
      });
      signedIn = null;
    }
    await assert.rejects(page.default({ params: Promise.resolve({ playerId: "missing" }) }), /Not found/);
    for (const fields of [{ active: false }, { active: true, account_deletion: true }]) {
      await documents(db, "players").updateOne({ _id: "ordinary-player" }, { $set: fields });
      await assert.rejects(page.default({ params: Promise.resolve({ playerId: "ordinary-player" }) }), /Not found/);
      assert.equal(await exhibition.getGalleryExhibition(db, "ordinary-player", null), null);
    }
    await documents(db, "players").updateOne({ _id: "ordinary-player" }, {
      $set: { active: true }, $unset: { account_deletion: "" },
    });
    const ownWork = {
      ...createArtistArtworkPreview(uploaded), _id: "own-work-copy", owner: account.id,
      status: "claimed", original: true, values: { ...featured.values, actual: 456 },
    };
    await documents(db, "items").insertOne(ownWork);
    assert.deepEqual((await get()).items.map((item: { _id: string }) => item._id).sort(),
      ["artist-preview:uploaded", "featured-copy", "permanent-copy"],
      "Private inventory must not suppress the artist preview");
    for (const display of [{ status: "displayed", permanent: false }, { status: "claimed", permanent: true }]) {
      await documents(db, "items").updateOne({ _id: ownWork._id }, { $set: display });
      for (const viewer of ["ordinary-player", account.id]) {
        viewerId = viewer;
        const displayed = await get();
        assert.deepEqual(displayed.items.map((item: { _id: string }) => item._id).sort(),
          ["featured-copy", "own-work-copy", "permanent-copy"],
          "Displayed own works must replace, not accompany, their artist previews");
        const realItem = displayed.items.find((item: { _id: string }) => item._id === ownWork._id);
        assert.equal(realItem.original, true);
        assert.equal(realItem.values.actual, 456);
        assert.equal(realItem.permanent, display.permanent);
        assert.deepEqual(displayed.artistWorks.map((work: { _id: string }) => work._id), ["uploaded"]);
        assert.equal(displayed.metadata.item_count, 3);
      }
    }
    viewerId = "ordinary-player";
    await documents(db, "items").updateOne({ _id: ownWork._id }, { $set: { status: "claimed", permanent: false } });
    assert.deepEqual((await get()).items.map((item: { _id: string }) => item._id).sort(),
      ["artist-preview:uploaded", "featured-copy", "permanent-copy"],
      "Taking down the real item must restore the artist preview");
    const finishRoute = await load<typeof import("../app/api/play/gallery-finishes/route.ts")>(
      "../app/api/play/gallery-finishes/route.ts", {
        "next/server": { NextResponse }, "@/server/gallery-finishes": galleryFinishes,
        "@/server/mongodb": { getDatabase: async () => db }, "@/server/player-api": playerApi,
        "@/server/player-gallery-finishes": playerGalleryFinishes,
      },
    );
    const finishes = galleryFinishes.getGalleryFinishes({
      wall: [0.1, 0.2, 0.3], floor: [0.4, 0.5, 0.6], frame_width: 0.07, matte_width: 0.1, spacing: 2.38, brightness: 0.8,
    });
    const saveRequest = (spacing = finishes.spacing) => new Request("http://localhost/api/play/gallery-finishes", {
      method: "PATCH", body: JSON.stringify({ galleryId: gallery.galleryId, finishes: { ...finishes, spacing } }),
    });
    assert.equal((await finishRoute.PATCH(saveRequest())).status, 404);
    viewerId = account.id;
    assert.equal((await finishRoute.PATCH(saveRequest())).status, 200);
    for (const spacing of [0.499, 4.001]) {
      const response = await finishRoute.PATCH(saveRequest(spacing));
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /spacing \(0.5-4 meters\)/);
    }
    assert.deepEqual((await get()).finishes, finishes);
    assert.deepEqual((await exhibition.getGalleryExhibition(db, account.id, null))?.finishes, finishes,
      "Public links use the owner's saved spacing along with their other finishes");
    assert.deepEqual((await documents(db, "players").findOne({ _id: account.id }))?.gallery_finishes[gallery.galleryId], finishes);
    await documents(db, "artworks").updateOne({ _id: uploaded._id }, { $set: { active: false } });
    assert.deepEqual((await get()).items.map((item: { _id: string }) => item._id).sort(), ["featured-copy", "permanent-copy"]);
    const ordinary = await get("ordinary-player");
    assert.equal(ordinary.artist, null);
    assert.deepEqual(ordinary.items.map((item: { _id: string }) => item._id), ["ordinary-copy"]);
    const directory = await load<typeof import("../app/api/play/galleries/route.ts")>(
      "../app/api/play/galleries/route.ts", {
        "next/server": { NextResponse }, "@/server/gallery-metadata": metadata,
        "@/server/community-reactions": { getCommunityReactionSummaries: async () => new Map() },
        "@/server/mongodb": { getDatabase: async () => db }, "@/server/player-api": playerApi,
        "@/server/contributing-artists": artists,
      },
    );
    const getListings = async () => (await directory.GET(new Request("http://localhost/api/play/galleries"))).json();
    for (const featured of [true, false]) {
      await documents(db, "players").updateOne({ _id: account.id }, { $set: { artist_featured: featured } });
      const listings = await getListings();
      assert.equal(listings.galleries.find((entry: { owner_id: string }) => entry.owner_id === account.id)?.isArtist, true);
      assert.equal(listings.galleries.find((entry: { owner_id: string }) => entry.owner_id === "ordinary-player")?.isArtist, false);
      assert.doesNotMatch(JSON.stringify(listings), /password_hash|password_salt|artist-0@example.com/);
    }
    await documents(db, "players").updateOne({ _id: account.id }, { $unset: { artist_id: "" } });
    const listings = await getListings();
    assert.equal(listings.galleries.find((entry: { owner_id: string }) => entry.owner_id === account.id)?.isArtist, false);
  });

  await t.test("featured galleries add one independent visitor pass to normal gallery spawning without resetting met visitors", async () => {
    const db = client.db("artist-visitors");
    const account = await seedArtist(db, 0, true);
    const attributes: ItemAttribute[] = Array.from({ length: 8 }, (_, index) => ({
      _id: `visitor-${index}`, title: `Visitor ${index}`, type: "primary", active: index < 7,
      npc_name: `Visitor ${index}`, icon: "fa-user", description: "", value: 1,
    }));
    await documents(db, "attributes").insertMany(attributes);
    const now = new Date("2026-11-02T12:00:00Z");
    const end = new Date(now.getTime() + 60_000);
    assert.equal(createFeaturedArtistVisitors(account.id, "Artist", attributes, now, end, 0).length, 0);
    assert.equal(createFeaturedArtistVisitors(account.id, "Artist", attributes, now, end, 1).length, 7);
    await Promise.all([
      refreshNpcSpawns(db, now, 1, account.id, 1),
      refreshNpcSpawns(db, now, 1, account.id, 1),
    ]);
    const npcs = await getGalleryNpcs(db, account.id, now);
    assert.equal(npcs.length, 7);
    assert.equal(new Set(npcs.map(npc => npc.attribute_id)).size, 7);
    const rareWork: Artwork = {
      _id: "rare-work", artist_id: account.artistId, artist: "Artist", title: "Rare",
      date: 2026, genre: "Abstract", medium: "Oil", rarity: "rare", value_scale: 0.5,
      height: 100, width: 80, active: true,
    };
    const masterpiece: Artwork = { ...rareWork, _id: "masterpiece", rarity: "masterpiece", effect_id: "rare-double" };
    await documents(db, "artworks").insertMany([rareWork, masterpiece]);
    await documents(db, "artwork_effects").insertOne({
      _id: "rare-double", code: MASTERPIECE_EFFECT_CODES.rareVisitorDouble, active: true,
    });
    await documents(db, "items").insertMany([rareWork, masterpiece].map(work => ({
      ...createArtistArtworkPreview(work), owner: account.id, attributes: { locked: [attributes[0]], unlocked: [], special: [] },
    })));
    await documents(db, "players").updateOne({ _id: account.id }, {
      $set: { artist_featured: false, "profile.level": 50, "profile.display_cap": 2 },
    });
    await refreshNpcSpawns(db, now, 1, account.id, 0);
    const bonusIds = new Set(npcs.map(npc => npc._id));
    const normalNpcs = (await getGalleryNpcs(db, account.id, now)).filter(npc => !bonusIds.has(npc._id));
    assert.ok(normalNpcs.length > 0, "A nonfeatured artist's displayed game items must attract normal visitors");
    const normalIds = new Set(normalNpcs.map(npc => npc._id));
    await documents(db, "items").updateMany({ owner: account.id }, { $set: { permanent: true } });
    await documents(db, "npcs").deleteMany({ owner_id: account.id });
    await refreshNpcSpawns(db, now, 1, account.id, 0);
    assert.deepEqual(await getGalleryNpcs(db, account.id, now), normalNpcs,
      "Promoted permanent works must retain normal visitor attraction and artwork effects");
    await documents(db, "npcs").deleteMany({ owner_id: account.id });
    await documents(db, "players").updateOne({ _id: account.id }, { $set: { artist_featured: true } });
    await refreshNpcSpawns(db, now, 1, account.id);
    const defaultBonus = createFeaturedArtistVisitors(account.id, "Artist", attributes, now, end);
    const defaultNpcs = await getGalleryNpcs(db, account.id, now);
    assert.deepEqual(defaultNpcs.map(npc => npc._id).sort(), [
      ...normalIds, ...defaultBonus.map(npc => npc._id),
    ].sort(), "The default 25% pass must supplement the same normal visitors, including artwork effects");
    assert.deepEqual(defaultNpcs.filter(npc => normalIds.has(npc._id)), normalNpcs);
    await documents(db, "npcs").updateMany({ owner_id: account.id }, { $addToSet: { players_met: "already-met" } });
    await Promise.all([
      refreshNpcSpawns(db, new Date(now.getTime() + 30_000), 1, account.id, 1),
      refreshNpcSpawns(db, new Date(now.getTime() + 40_000), 1, account.id, 1),
    ]);
    const combinedNpcs = await getGalleryNpcs(db, account.id, now);
    assert.deepEqual(combinedNpcs.map(npc => npc._id).sort(), [...normalIds, ...bonusIds].sort());
    for (const npc of defaultNpcs) {
      assert.deepEqual(combinedNpcs.find(current => current._id === npc._id)?.players_met, ["already-met"]);
    }
    await documents(db, "npcs").deleteMany({ owner_id: account.id });
    await refreshNpcSpawns(db, new Date(now.getTime() + 45_000), 1, account.id, 0);
    assert.deepEqual(await getGalleryNpcs(db, account.id, now), normalNpcs,
      "Disabling the featured bonus must preserve exactly the ordinary gallery spawn results");
    await refreshNpcSpawns(db, end, 1, account.id, 0);
    const nextCycleNpcs = await getGalleryNpcs(db, account.id, end);
    assert.ok(nextCycleNpcs.every(npc => npc.attribute_id === attributes[0]._id && npc.spawned_at.getTime() === end.getTime()));
    assert.equal(await documents(db, "npcs").countDocuments({ owner_id: account.id, spawn_key: /^featured:/ }), 0);
    assert.equal(await visitorUsesOwnGalleryBenefits(db, { owner_id: account.id }, "visiting-player"), true);
    await artists.setArtistFeatured(db, account.id, false);
    assert.equal(await visitorUsesOwnGalleryBenefits(db, { owner_id: account.id }, "visiting-player"), false);
    assert.equal(await visitorUsesOwnGalleryBenefits(db, { owner_id: account.id }, account.id), true);
    const stored = toStoredGameplayConfig({ ...DEFAULT_ACTUAL_GAMEPLAY_CONFIG, featuredArtistVisitorChance: 0.6 });
    await documents(db, "metadata").insertOne({ _id: "gameplay-settings", gameplay: { configs: { actual: stored } } });
    assert.equal((await getGameplaySettings(db)).active.featuredArtistVisitorChance, 0.6);
    assert.equal(validateGameplayConfig({ ...DEFAULT_ACTUAL_GAMEPLAY_CONFIG, featuredArtistVisitorChance: 1.1 }).ok, false);
  });

  await t.test("artist upload authorization, submission agreement, forced inactive ownership, admin rarity editing and denial use real persisted records", async () => {
    const db = client.db("artist-artwork-route");
    const account = await seedArtist(db, 0);
    let signedIn: string | null = null;
    let isAdmin = false;
    let removedImages = 0;
    let cleanupFails = false;
    const artistApi = await load<typeof import("./artist-api.ts")>("./artist-api.ts", {
      "next/server": { NextResponse }, "./contributing-artists.ts": artists,
      "./mongodb.ts": { getDatabase: async () => db },
      "./public-url": { getPublicBaseUrl: () => "http://localhost/" },
      "./player-api": { requirePlayerApi: async () => signedIn
        ? { ok: true, session: { playerId: signedIn, email: "artist@example.com", screenName: "Artist", role: "player" } }
        : { ok: false, response: NextResponse.json({ error: "Sign in" }, { status: 401 }) } },
    });
    const image = { version: 2, variants: { full: { width: 800, height: 1000 } } };
    const storage = {
      publishArtworkUpload: async () => image,
      deleteArtworkImageRecord: async () => {
        if (cleanupFails) throw new Error("Simulated storage outage.");
        removedImages++;
      },
    };
    const upload = await load<{ POST: (request: Request) => Promise<Response> }>("../app/api/artist/artworks/route.ts", {
      "node:crypto": require("node:crypto"), "next/server": { NextResponse },
      "@/server/artist-api": artistApi, "@/server/contributing-artists": artists,
      "@/server/artist-types": artistTypes, "@/server/artwork-create-input": artworkInput,
      "@/server/artwork-storage": storage,
    });
    const metadata = {
      artist_id: "forged-artist", title: "Artist submission", date: 2026, genre: "Abstract",
      medium: "Oil", height: 100, rarity: "masterpiece", active: true, effect_id: "forged-effect",
      agreementAccepted: true, agreementVersion: artistTypes.ARTIST_AGREEMENT_VERSION,
    };
    const request = (changes = {}) => {
      const body = new FormData();
      body.set("image", new File(["test image"], "image.png", { type: "image/png" }));
      body.set("metadata", JSON.stringify({ ...metadata, ...changes }));
      return new Request("http://localhost/api/artist/artworks", { method: "POST", headers: { origin: "http://localhost" }, body });
    };
    assert.equal((await upload.POST(request())).status, 401);
    signedIn = "ordinary-player";
    await documents(db, "players").insertOne({ _id: signedIn, active: true });
    assert.equal((await upload.POST(request())).status, 403);
    signedIn = account.id;
    assert.equal((await upload.POST(request({ agreementAccepted: false }))).status, 400);
    assert.equal((await upload.POST(request({ agreementVersion: "unaccepted-version" }))).status, 400);
    const response = await upload.POST(request());
    assert.equal(response.status, 201);
    const artwork = (await response.json()).artwork;
    assert.equal(artwork.artist_id, account.artistId);
    assert.equal(artwork.active, false);
    assert.equal(artwork.rarity, "common");
    assert.equal(artwork.effect_id, undefined);
    assert.equal(artwork.width, 80);
    assert.equal(artwork.submission_status, "pending");
    assert.equal(artwork.artist_license.type, "until_removal_request");
    assert.equal(artwork.artist_license.agreement_version, artistTypes.ARTIST_AGREEMENT_VERSION);
    assert.equal((await artists.getArtistWorks(db, account.artistId)).length, 0);
    await documents(db, "metadata").insertOne({ _id: "loot-data", loot_data: { seasonal_items: {} } });
    await documents(db, "attributes").insertOne({ _id: "rare-attribute", active: true });
    const adminRoute = await load<{
      PATCH: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
      DELETE: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
    }>("../app/api/admin/artworks/[id]/route.ts", {
      "next/server": { NextResponse },
      "@/server/admin-api": { requireAdminApi: async () => isAdmin ? { ok: true, session: { email: "admin@example.com" } }
        : { ok: false, response: NextResponse.json({ error: "Admin required" }, { status: 403 }) } },
      "@/server/artwork-storage": storage, "@/server/community-reaction-cleanup": { deleteCommunityReactions: async () => {} },
      "@/server/gameplay": gameplay, "@/server/item-reroll": { getRerollCost: () => assert.fail("No real items exist yet") },
      "@/server/mongodb": { getDatabase: async () => db }, "@/server/artwork-create-input": artworkInput,
      "@/server/artwork-effects": artworkEffects, "@/server/rare-special-attributes": rareSpecialAttributes,
      "@/server/item-drop-chance": itemDropChance,
    });
    const context = { params: Promise.resolve({ id: artwork._id }) };
    const approvalRequest = () => new Request("http://localhost/api/admin/artworks", {
      method: "PATCH", body: JSON.stringify({ ...metadata, artist_id: account.artistId,
        rarity: "rare", special_attributes: ["rare-attribute"], title: "Admin edited title", active: true }),
    });
    assert.equal((await adminRoute.PATCH(approvalRequest(), context)).status, 403);
    isAdmin = true;
    const approved = await adminRoute.PATCH(approvalRequest(), context);
    assert.equal(approved.status, 200, JSON.stringify(await approved.clone().json()));
    const saved = await documents(db, "artworks").findOne({ _id: artwork._id });
    assert.equal(saved?.active, true);
    assert.equal(saved?.submission_status, "approved");
    assert.equal(saved?.rarity, "rare");
    assert.equal(saved?.title, "Admin edited title");
    assert.deepEqual(saved?.special_attributes, ["rare-attribute"]);
    assert.equal((await artists.getArtistWorks(db, account.artistId)).length, 1);
    const second = (await (await upload.POST(request())).json()).artwork;
    const denied = await adminRoute.DELETE(new Request("http://localhost"), { params: Promise.resolve({ id: second._id }) });
    assert.equal(denied.status, 200);
    assert.equal(await documents(db, "artworks").findOne({ _id: second._id }), null);
    assert.equal(removedImages, 1);
    assert.ok(await documents(db, "artworks").findOne({ _id: artwork._id }));
    const third = (await (await upload.POST(request())).json()).artwork;
    const thirdContext = { params: Promise.resolve({ id: third._id }) };
    cleanupFails = true;
    assert.equal((await adminRoute.DELETE(new Request("http://localhost"), thirdContext)).status, 503);
    assert.equal((await documents(db, "artworks").findOne({ _id: third._id }))?.submission_status, "denying");
    assert.equal((await adminRoute.PATCH(approvalRequest(), thirdContext)).status, 409);
    cleanupFails = false;
    assert.equal((await adminRoute.DELETE(new Request("http://localhost"), thirdContext)).status, 200);
    assert.equal(await documents(db, "artworks").findOne({ _id: third._id }), null);
    assert.equal(removedImages, 2);
  });

  await t.test("review acceptance randomizes value, balances rarity effects, preserves the artist and leaves catalog assignments editable", async () => {
    const db = client.db("artist-automatic-approval");
    const account = await seedArtist(db, 0);
    await documents(db, "artists").insertOne({ _id: "other-artist", artist_name: "Another artist" });
    await documents(db, "metadata").insertOne({ _id: "loot-data", loot_data: { seasonal_items: {} } });
    for (const rarity of ["legendary", "masterpiece"]) {
      await documents(db, "artwork_effects").insertMany(["popular", "least", "inactive"].map(id => ({
        _id: `${rarity}-${id}`, effect_type: rarity, title: id, active: id !== "inactive",
      })));
      await documents(db, "artworks").insertMany([0, 1, 2].map(index => ({
        _id: `${rarity}-existing-${index}`, rarity, effect_id: `${rarity}-popular`,
      })));
    }
    await documents(db, "attributes").insertMany(["popular", "least", "inactive"].map(id => ({
      _id: `rare-${id}`, title: id, active: id !== "inactive",
    })));
    await documents(db, "artworks").insertOne({
      _id: "existing-rare", rarity: "rare", special_attributes: ["rare-popular"],
    });
    let randomCalls = 0;
    const route = await load<{
      PATCH: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
    }>("../app/api/admin/artworks/[id]/route.ts", {
      "next/server": { NextResponse },
      "@/server/admin-api": { requireAdminApi: async () => ({ ok: true, session: { email: "admin@example.com" } }) },
      "@/server/artwork-storage": {}, "@/server/community-reaction-cleanup": {},
      "@/server/gameplay": gameplay, "@/server/item-reroll": {},
      "@/server/mongodb": { getDatabase: async () => db }, "@/server/artwork-create-input": artworkInput,
      "@/server/artwork-effects": artworkEffects, "@/server/rare-special-attributes": rareSpecialAttributes,
      "@/server/item-drop-chance": itemDropChance,
    }, { Math: Object.assign(Object.create(Math), { random: () => { randomCalls++; return 0.375; } }) });
    const pending = (id: string) => ({
      _id: id, artist_id: account.artistId, artist: "Artist 0", title: id, date: 2026,
      genre: "Abstract", medium: "Oil", rarity: "common", height: 100, width: 80,
      image_width: 800, image_height: 1000, active: false, value_scale: 0.01,
      submission_status: "pending",
    });
    const request = (body: Record<string, unknown>) => new Request("http://localhost/api/admin/artworks", {
      method: "PATCH", body: JSON.stringify(body),
    });
    const approve = (id: string, rarity: string) => route.PATCH(request({
      action: "approve", rarity, title: "Reviewed title", height: 120,
      artist_id: "other-artist", value_scale: 0.99, effect_id: `${rarity}-popular`,
      special_attributes: ["rare-popular"], thumbnail_adjustment: { x: 0.1, y: 0.2, scale: 1.5 },
      feature_card_adjustment: { x: -25, y: 30, scale: 1.8 },
    }), { params: Promise.resolve({ id }) });
    for (const rarity of ["common", "uncommon", "rare", "legendary", "masterpiece"]) {
      const id = `submitted-${rarity}`;
      await documents(db, "artworks").insertOne(pending(id));
      const result = await approve(id, rarity);
      assert.equal(result.status, 200, JSON.stringify(await result.clone().json()));
      const saved = await documents(db, "artworks").findOne({ _id: id });
      assert.equal(saved?.artist_id, account.artistId);
      assert.equal(saved?.artist, "Artist 0");
      assert.equal(saved?.rarity, rarity);
      assert.equal(saved?.value_scale, 0.375);
      assert.equal(saved?.active, true);
      assert.equal(saved?.submission_status, "approved");
      assert.equal(saved?.reviewed_by, "admin@example.com");
      assert.equal(saved?.title, "Reviewed title");
      assert.equal(saved?.width, 96);
      assert.deepEqual(saved?.thumbnail_adjustment, { x: 0.1, y: 0.2, scale: 1.5 });
      assert.deepEqual(saved?.feature_card_adjustment, { x: -25, y: 30, scale: 1.8 });
      assert.equal(saved?.effect_id, rarity === "legendary" || rarity === "masterpiece" ? `${rarity}-least` : undefined);
      assert.deepEqual(saved?.special_attributes, rarity === "rare" ? ["rare-least"] : undefined);
      assert.equal((await approve(id, rarity)).status, 409);
      assert.deepEqual(await documents(db, "artworks").findOne({ _id: id }), saved);
    }
    assert.equal(randomCalls, 5);
    const catalogBody = {
      ...pending("submitted-legendary"), artist_id: account.artistId, rarity: "legendary",
      active: true, value_scale: 0.8, effect_id: "legendary-popular",
    };
    assert.equal((await route.PATCH(request(catalogBody), { params: Promise.resolve({ id: catalogBody._id }) })).status, 200);
    const edited = await documents(db, "artworks").findOne({ _id: catalogBody._id });
    assert.equal(edited?.effect_id, "legendary-popular");
    assert.equal(edited?.value_scale, 0.8);
    assert.deepEqual(edited?.feature_card_adjustment, { x: -25, y: 30, scale: 1.8 });
    const featureCard = { x: 40, y: -10, scale: 2 };
    const context = { params: Promise.resolve({ id: catalogBody._id }) };
    assert.equal((await route.PATCH(request({
      ...catalogBody, feature_card_adjustment: featureCard,
    }), context)).status, 200);
    const cropped = await documents(db, "artworks").findOne({ _id: catalogBody._id });
    assert.deepEqual(cropped?.feature_card_adjustment, featureCard);
    assert.deepEqual(cropped?.thumbnail_adjustment, { x: 0.1, y: 0.2, scale: 1.5 });
    assert.equal((await route.PATCH(request({
      ...catalogBody, feature_card_adjustment: { ...featureCard, scale: 4 },
    }), context)).status, 400);
    assert.deepEqual(await documents(db, "artworks").findOne({ _id: catalogBody._id }), cropped);
    const legacy = { ...pending("legacy-crop"), thumbnail_adjustment: { x: -15, y: 40, scale: 1.75 } };
    await documents(db, "artworks").insertOne(legacy);
    assert.equal((await route.PATCH(request({
      ...legacy, thumbnail_adjustment: { x: 20, y: 0, scale: 1 },
    }), { params: Promise.resolve({ id: legacy._id }) })).status, 200);
    const legacySaved = await documents(db, "artworks").findOne({ _id: legacy._id });
    assert.deepEqual(legacySaved?.feature_card_adjustment, legacy.thumbnail_adjustment);
    assert.deepEqual(legacySaved?.thumbnail_adjustment, { x: 20, y: 0, scale: 1 });
    assert.equal(randomCalls, 5, "Catalog saves must not reroll value");

    await documents(db, "artworks").insertOne(pending("concurrent"));
    const simultaneous = await Promise.all([approve("concurrent", "masterpiece"), approve("concurrent", "masterpiece")]);
    assert.deepEqual(simultaneous.map(response => response.status).sort(), [200, 409]);
    await documents(db, "artworks").insertOne({ ...pending("being-denied"), submission_status: "denying" });
    assert.equal((await approve("being-denied", "common")).status, 409);
    await documents(db, "artwork_effects").deleteMany({ effect_type: "legendary" });
    await documents(db, "artworks").insertOne(pending("missing-effect"));
    assert.equal((await approve("missing-effect", "legendary")).status, 400);
    assert.deepEqual(await documents(db, "artworks").findOne({ _id: "missing-effect" }), pending("missing-effect"));
  });

  await t.test("featured Benefactors and Enthusiasts apply the player's effects and count visitors in the visited gallery", async t => {
    t.mock.method(Math, "random", () => 0);
    for (const ownerId of ["viewer", "artist-player-0", "ordinary"]) {
      const db = client.db(`artist-standard-rewards-${ownerId}`);
      const effects = ["BENEFACTOR_VISITOR_COUNT_BONUS", "ENTHUSIAST_VISITOR_COUNT_BONUS", "MONEY_FOR_XP"];
      const { now, futureTime } = await setupTestDb(db, "viewer", {
        uniqueAttributes: effects.map(code => ({
          _id: code, code, active: true, parameters: { multiplier_per_visitor: 0.1, money_per_xp: 2 },
        })),
      });
      await seedArtist(db, 0, true);
      for (const [index, code] of effects.entries()) {
        await documents(db, "artworks").updateOne({ _id: `art-${index + 1}` }, { $set: { rarity: "legendary", effect_id: code } });
        await documents(db, "items").insertOne({
          _id: `displayed-${index}`, artwork_id: `art-${index + 1}`, owner: "viewer", status: "displayed",
        });
      }
      const [benefactor, enthusiast] = [legendary.BENEFACTOR_ATTRIBUTE_ID, legendary.ART_ENTHUSIAST_ATTRIBUTE_ID]
        .map((attribute_id, index) => ({
          _id: `visitor-${index}`, owner_id: ownerId, owner_name: "Gallery",
          attribute_id, quality: "bronze" as const, npc_name: "Visitor", icon: "fa-user",
          spawned_at: now, expiration: futureTime, players_met: [], proc_chance: 1,
        }));
      await db.collection<npcGameplay.GalleryNpc>("npcs").insertMany([
        benefactor, enthusiast,
        ...Array.from({ length: 10 }, (_, index) => ({ ...benefactor, _id: `elsewhere-${index}`, owner_id: "elsewhere" })),
        { ...benefactor, _id: "expired", expiration: new Date(now.getTime() - 1) },
      ]);
      const player = (await db.collection<Parameters<typeof grantStandardNpcReward>[1]>("players")
        .findOne({ _id: "viewer" }))!;
      const ownBenefits = ownerId !== "ordinary";
      const average = await getAverageDropValueForLevel(db, player.profile.level);
      const donation = await grantStandardNpcReward(db, player, benefactor, now);
      assert.equal(donation.rewardAmount, Math.floor(average * 5 * 0.8 * (ownBenefits ? 1.75 * 1.2 : 1)));
      const xp = await grantStandardNpcReward(db, player, enthusiast, now);
      assert.equal(xp.rewardAmount, Math.floor(getXpChunk(player.profile.level) * (ownBenefits ? 0.2 * 1.75 * 1.2 : 0.2)));
      assert.equal(xp.bonusMoney, ownBenefits ? xp.rewardAmount * 2 : 0);
      const saved = (await documents(db, "players").findOne({ _id: "viewer" }))!;
      assert.equal(saved.profile.bank_balance, player.profile.bank_balance + donation.rewardAmount + xp.bonusMoney);
    }
  });

  await t.test("featured Donors and Dealers match own-gallery drop settings and the player's Legendary and Masterpiece effects", async () => {
    const db = client.db("artist-visitor-effects");
    await setupTestDb(db, null, STARTING_INVENTORY_TEST_OPTIONS);
    const artist = await seedArtist(db, 0, true);
    const viewer = createPlayerAccountRecord({
      email: "viewer@example.com", screenName: "Viewer", passwordSalt: "salt", passwordHash: "hash",
    });
    await documents(db, "players").insertOne({
      ...viewer, profile: { ...viewer.profile, social_battery: socialBattery.SOCIAL_BATTERY_MAX,
        social_battery_reset_at: "2999-01-01T00:00:00.000Z" },
    });
    const effects = [
      { effect_type: "legendary", code: "BONUS_DEALER_DONOR", parameters: { additional_items: 1 } },
      { effect_type: "masterpiece", code: MASTERPIECE_EFFECT_CODES.donorFoil, parameters: {} },
      { effect_type: "masterpiece", code: MASTERPIECE_EFFECT_CODES.dealerUnlocked, parameters: {} },
      { effect_type: "legendary", code: "DONOR_AUCTIONEER_TRADE", parameters: { donor_item_delta: -1 } },
    ];
    const works: Artwork[] = effects.map(({ effect_type }, index) => ({
      _id: `viewer-work-${index}`, artist_id: "catalog-artist", artist: "Catalog artist", title: "Viewer effect",
      date: 2026, genre: "Abstract", medium: "Oil", rarity: effect_type as Artwork["rarity"], value_scale: 0.5,
      width: 80, height: 100, active: true, effect_id: `viewer-effect-${index}`,
    }));
    await documents(db, "artworks").insertMany(works);
    await documents(db, "items").insertMany(works.map(work => ({ ...createArtistArtworkPreview(work), owner: viewer._id })));
    await documents(db, "artwork_effects").insertMany(effects.map((effect, index) => ({
      ...effect, _id: `viewer-effect-${index}`, active: true,
    })));
    const generated: { playerId: string; options: NonNullable<Parameters<typeof gameplay.generateDailyDrop>[3]> }[] = [];
    const meet = await load<{ POST: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> }>(
      "../app/api/play/npcs/[id]/meet/route.ts", {
        "next/server": { NextResponse }, "@/server/economy-metrics": {},
        "@/server/tutorial": tutorial, "@/shared/tutorial": tutorialElements,
        "@/server/item-permissions": { getItemDisposalFilter },
        "@/server/gallery-metadata": { refreshGalleryMetadata: async () => {} },
        "@/server/game-settings": settingsCore, "@/server/collector-gameplay": {}, "@/server/art-expert-gameplay": {},
        "@/server/karma": { ensurePlayerKarma: async () => {} }, "@/server/npc-quest-item": {},
        "@/server/art-historian-gameplay": {}, "@/server/auctioneer-gameplay": {}, "@/server/auction-gameplay": {},
        "@/server/collection-gameplay": {}, "@/server/community-reaction-cleanup": {},
        "@/server/gameplay": {
          ...gameplay,
          generateDailyDrop: async (_database: Db, playerId: string, _level: number, options: NonNullable<Parameters<typeof gameplay.generateDailyDrop>[3]>) => {
            generated.push({ playerId, options });
            return [];
          },
        },
        "@/server/item-artwork": itemArtwork, "@/server/hall-of-fame": {}, "@/server/legendary-attributes": legendary,
        "@/server/item-reroll": {}, "@/server/forgery-gameplay": {}, "@/server/npc-gameplay": npcGameplay,
        "@/server/social-battery": socialBattery, "@/server/mongodb": { getDatabase: async () => db },
        "@/server/artwork-effects": artworkEffects, "@/server/masterpiece-effects": masterpieceEffects,
        "@/server/item-expiration": { getNpcOfferItemExpiration: (now: Date) => new Date(now.getTime() + 60_000).toISOString() },
        "@/server/player-api": { requirePlayerApi: async () => ({ ok: true, session: { playerId: viewer._id } }) },
        "@/server/quest-item-sell": {}, "@/server/preservationist-gameplay": {}, "@/server/item-leveling": {},
        "@/server/standard-npc-reward-service": { isStandardRewardNpc: () => false },
      },
    );
    await documents(db, "npcs").insertOne({
      _id: "companion-auctioneer", owner_id: viewer._id, attribute_id: legendary.AUCTIONEER_ATTRIBUTE_ID,
      expiration: new Date(Date.now() + 60_000),
    });
    const rarityByVisitor = new Map<string, unknown>();
    for (const { id, owner, attributeId, paired, expired } of [
      { id: "own-donor", owner: viewer._id, attributeId: legendary.ART_DONOR_ATTRIBUTE_ID, paired: true },
      { id: "featured-donor", owner: artist.id, attributeId: legendary.ART_DONOR_ATTRIBUTE_ID },
      { id: "ordinary-donor", owner: "ordinary", attributeId: legendary.ART_DONOR_ATTRIBUTE_ID },
      { id: "own-dealer", owner: viewer._id, attributeId: legendary.ART_DEALER_ATTRIBUTE_ID },
      { id: "featured-dealer", owner: artist.id, attributeId: legendary.ART_DEALER_ATTRIBUTE_ID },
      { id: "ordinary-dealer", owner: "ordinary", attributeId: legendary.ART_DEALER_ATTRIBUTE_ID },
      { id: "featured-paired-donor", owner: artist.id, attributeId: legendary.ART_DONOR_ATTRIBUTE_ID, paired: true },
      { id: "featured-expired-pair", owner: artist.id, attributeId: legendary.ART_DONOR_ATTRIBUTE_ID, expired: true },
    ]) {
      if (paired && owner === artist.id || expired) await documents(db, "npcs").updateOne(
        { _id: "companion-auctioneer" },
        { $set: { owner_id: artist.id, expiration: new Date(Date.now() + (expired ? -1 : 60_000)) } },
      );
      await documents(db, "npcs").insertOne({
        _id: id, owner_id: owner, owner_name: "Gallery owner", quality: "platinum",
        attribute_id: attributeId, players_met: [],
        spawned_at: new Date(), expiration: new Date(Date.now() + 60_000), icon: "fa-gift", npc_name: "Art Donor", proc_chance: 1,
      });
      const before = (await documents(db, "players").findOne({ _id: viewer._id }))!.profile.social_battery;
      const response = await meet.POST(new Request("http://localhost"), { params: Promise.resolve({ id }) });
      assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
      const after = (await documents(db, "players").findOne({ _id: viewer._id }))!.profile.social_battery;
      const ownBenefits = owner !== "ordinary";
      const donor = attributeId === legendary.ART_DONOR_ATTRIBUTE_ID;
      const cost = socialBattery.getVisitorSocialBatteryCost("platinum", ownBenefits);
      assert.equal(before - after, cost);
      assert.equal((await response.json()).socialBatteryCost, cost);
      const drop = generated.at(-1)!;
      assert.equal(drop.playerId, viewer._id);
      assert.equal(drop.options.itemCount, (donor ? 1 : 2) + (ownBenefits ? 2 : 0) - (paired ? 1 : 0), id);
      assert.equal(donor ? drop.options.forceLegendaryMasterpieceFoil : drop.options.forceLegendaryMasterpieceUnlocked, ownBenefits);
      assert.equal(drop.options.useRawRarityMap, true);
      if (!rarityByVisitor.has(attributeId)) rarityByVisitor.set(attributeId, drop.options.generationMap?.rarity);
      assert.deepEqual(drop.options.generationMap?.rarity, rarityByVisitor.get(attributeId),
        "Featured visits must preserve the same player-level and visitor-quality rarity boosts as own-gallery visits");
      assert.equal((await meet.POST(new Request("http://localhost"), { params: Promise.resolve({ id }) })).status, 409);
    }
  });

  await t.test("account deletion removes artist-player records and applications but preserves licensed artist records and works", async () => {
    const db = client.db("artist-erasure-retention");
    const account = await seedArtist(db, 0, true);
    await documents(db, "artist_applications").insertOne({
      _id: "application", player_id: account.id, email: "artist-0@example.com", status: "approved",
    });
    await documents(db, "artworks").insertOne({
      _id: "licensed-artwork", artist_id: account.artistId, artist: "Artist 0", active: true,
      submitted_by: account.id, artist_license: { type: "until_removal_request", artist_id: account.artistId },
    });
    await documents(db, "players").insertOne({
      ...createPlayerAccountRecord({ email: "other@example.com", screenName: "Other", passwordHash: "hash", passwordSalt: "salt" }),
      _id: "other-player",
    });
    await documents(db, "items").insertOne({ _id: "other-copy", owner: "other-player", artwork_id: "licensed-artwork" });
    await deletePlayerAccount(db, account.id, async () => {});
    assert.equal(await documents(db, "players").findOne({ _id: account.id }), null);
    assert.equal(await documents(db, "artist_applications").countDocuments(), 0);
    const artist = await documents(db, "artists").findOne({ _id: account.artistId });
    assert.equal(artist?.artist_name, "Artist 0");
    assert.equal(artist?.player_id, undefined);
    const work = await documents(db, "artworks").findOne({ _id: "licensed-artwork" });
    assert.equal(work?.active, true);
    assert.equal(work?.submitted_by, undefined);
    assert.equal(work?.artist_license.type, "until_removal_request");
    assert.ok(await documents(db, "items").findOne({ _id: "other-copy" }));
    assert.equal(await artists.getPublicArtistProfile(db, account.id), null);
    assert.deepEqual(await artists.getFeaturedArtistGalleries(db), []);
  });
});
