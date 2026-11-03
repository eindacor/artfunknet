import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as jose from "jose";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import * as authorization from "./authorization.ts";
import * as identities from "./oauth-identity.ts";
import * as playerAccount from "./player-account.ts";
import { getOAuthMessage, OAUTH_PROVIDERS, type OAuthProvider } from "./oauth-providers.ts";
import * as steamOpenId from "./steam-openid.ts";
import { setupTestDb, STARTING_INVENTORY_TEST_OPTIONS } from "./test-utils/db-setup.ts";

type Route = {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
};

const require = createRequire(import.meta.url);
const { NextResponse } = require("next/server");

async function load<T>(relative: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const source = await readFile(new URL(relative, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return runInNewContext(`${code}\nexports`, {
    exports: {}, console, URL, URLSearchParams, Request, Response, FormData, TextEncoder, Date,
    ...globals,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }) as T;
}

test("OAuth routes authenticate fresh identities and bind explicit sync to the current session", async (t) => {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  t.after(async () => { await client.close(); await server.stop(); });
  const db = client.db("oauth-flow");
  await setupTestDb(db, null, STARTING_INVENTORY_TEST_OPTIONS);
  const players = db.collection<identities.OAuthPlayer>("players");
  const env: Record<string, string> = {
    SESSION_SECRET: "test-only-oauth-secret-not-a-real-credential",
    SESSION_COOKIE_SECURE: "false",
  };
  for (const { id } of OAUTH_PROVIDERS) {
    env[`${id.toUpperCase()}_OAUTH_CLIENT_ID`] = `${id}-client`;
    env[`${id.toUpperCase()}_OAUTH_CLIENT_SECRET`] = "test-provider-secret";
  }
  const globals = { process: { env } };
  let currentRequest = new Request("http://localhost");
  const cookie = (name: string) => (currentRequest.headers.get("cookie") ?? "")
    .split("; ").find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1);
  const session = await load<typeof import("./session.ts")>("./session.ts", {
    "server-only": {}, jose, "./authorization.ts": authorization,
    "./mongodb.ts": { getDatabase: async () => db },
    "next/headers": {
      cookies: async () => ({ get: (name: string) => cookie(name) ? { value: cookie(name) } : undefined }),
      headers: async () => currentRequest.headers,
    },
    "next/navigation": { redirect: () => assert.fail("Unexpected navigation") },
  }, globals);
  const publicUrl = {
    getPublicBaseUrl: () => "http://localhost/",
    getPublicCallbackUrl: (_request: Request, pathname: string, override?: string) =>
      new URL(override || pathname, "http://localhost").toString(),
  };
  const flow = await load<typeof import("./oauth-flow.ts")>("./oauth-flow.ts", {
    "server-only": {}, "node:crypto": crypto, jose, "next/server": { NextResponse },
    "./authorization.ts": authorization, "./public-url": publicUrl, "./session": session,
  }, globals);
  const logging = {
    createOperationId: () => "test-operation",
    logOperationalError: () => {},
    logOperationalInfo: () => {},
  };
  const oauth = await load<typeof import("./oauth-player.ts")>("./oauth-player.ts", {
    "server-only": {}, "next/server": { NextResponse },
    "@/server/mongodb": { getDatabase: async () => db },
    "@/server/operational-logging": logging,
    "@/server/player-account": playerAccount,
    "@/server/session": session, "@/server/public-url": publicUrl,
    "./patreon.ts": { syncPatreonMembershipAfterSignIn: async () => {} },
    "./oauth-flow": flow, "./oauth-identity.ts": identities,
  }, globals);
  const keys = await jose.generateKeyPair("RS256");
  const email = "provider@example.com";
  let providerFailure = false;
  let instagramAccountType = "BUSINESS";
  let instagramNestedResponse = true;
  let fetchCount = 0;
  const providerFetch = async (input: string, options?: RequestInit) => {
    fetchCount++;
    if (providerFailure) return Response.json({ error: "provider unavailable" }, { status: 503 });
    if (input.includes("microsoftonline.com")) {
      const idToken = await new jose.SignJWT({
        sub: "microsoft-id", name: "Microsoft-Player", email,
        nonce: cookie("artfunkel_microsoft_oauth_nonce"),
      }).setProtectedHeader({ alg: "RS256" }).setAudience("microsoft-client")
        .setIssuer("https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0")
        .setIssuedAt().setExpirationTime("5m").sign(keys.privateKey);
      return Response.json({ id_token: idToken });
    }
    if (input.includes("steamcommunity.com")) return new Response("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n");
    if (input.includes("api.instagram.com/oauth/access_token")) {
      assert.ok(options?.body instanceof FormData);
      assert.equal(options.body.get("grant_type"), "authorization_code");
      const token = { access_token: "test-access-token" };
      return Response.json(instagramNestedResponse ? { data: [token] } : token);
    }
    if (input.includes("graph.instagram.com")) {
      assert.equal((options?.headers as Record<string, string>).authorization, "Bearer test-access-token");
      const user = { id: "instagram-id", username: "instagram.player", account_type: instagramAccountType };
      return Response.json(instagramNestedResponse ? { data: [user] } : user);
    }
    if (input.includes("openidconnect.googleapis.com")) {
      return Response.json({ sub: "google-id", name: "Google-Player", email, email_verified: true });
    }
    if (input.endsWith("/users/@me")) {
      return Response.json({ id: "discord-id", username: "Discord-Player", email, verified: true });
    }
    if (input.includes("/token")) return Response.json({ access_token: "test-access-token" });
    assert.fail(`Unexpected provider request: ${input}`);
  };
  const starts = {} as Record<OAuthProvider, Route>;
  const callbacks = {} as Record<OAuthProvider, Route>;
  for (const { id } of OAUTH_PROVIDERS) {
    const dependencies = {
      "node:crypto": crypto, "next/server": { NextResponse },
      "@/server/oauth-player": oauth, "@/server/oauth-flow": flow,
      "@/server/public-url": publicUrl, "@/server/operational-logging": logging,
      "@/server/mongodb": { getDatabase: async () => db },
      "@/server/steam-openid": steamOpenId,
    };
    starts[id] = await load<Route>(`../app/api/auth/player/${id}/route.ts`, dependencies, globals);
    callbacks[id] = await load<Route>(`../app/api/auth/player/${id}/callback/route.ts`, {
      ...dependencies, "../route": starts[id],
      jose: { ...jose, createRemoteJWKSet: () => async () => keys.publicKey },
    }, { ...globals, fetch: providerFetch });
  }
  const sessionCookie = session.PLAYER_SESSION_COOKIE;
  async function seed(id = "current-player", address = `${id}@example.com`) {
    const record = playerAccount.createPlayerAccountRecord({
      playerId: id, email: address, screenName: id, passwordSalt: "salt", passwordHash: "hash",
    });
    await players.insertOne(record);
    return session.createPlayerSessionToken({ playerId: id, email: address, screenName: id });
  }
  async function start(id: OAuthProvider, token?: string, origin = "http://localhost") {
    currentRequest = new Request(`http://localhost/api/auth/player/${id}`, {
      method: token ? "POST" : "GET",
      headers: { origin, ...(token ? { cookie: `${sessionCookie}=${token}` } : {}) },
    });
    return starts[id][token ? "POST" : "GET"](currentRequest);
  }
  function cookies(response: Response, extra: Record<string, string | undefined> = {}) {
    const jar: Record<string, string | undefined> = {};
    for (const value of response.headers.getSetCookie()) {
      const [pair] = value.split(";");
      const separator = pair.indexOf("=");
      jar[pair.slice(0, separator)] = pair.slice(separator + 1);
    }
    return Object.entries({ ...jar, ...extra }).filter(([, value]) => value !== undefined)
      .map(([name, value]) => `${name}=${value}`).join("; ");
  }
  async function finish(id: OAuthProvider, response: Response, extra: Record<string, string | undefined> = {}, badState = false) {
    const authorization = new URL(response.headers.get("location")!);
    let url: URL;
    if (id === "steam") {
      url = new URL(authorization.searchParams.get("openid.return_to")!);
      const fields = {
        ns: "http://specs.openid.net/auth/2.0", mode: "id_res",
        op_endpoint: "https://steamcommunity.com/openid/login",
        claimed_id: "https://steamcommunity.com/openid/id/76561198000000000",
        identity: "https://steamcommunity.com/openid/id/76561198000000000",
        return_to: url.toString(),
        response_nonce: new Date().toISOString().replace(/\.\d{3}Z$/, "Z") + crypto.randomUUID(),
        assoc_handle: "test", signed: "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
        sig: "test-signature",
      };
      for (const [name, value] of Object.entries(fields)) url.searchParams.set(`openid.${name}`, value);
    } else {
      url = new URL(`http://localhost/api/auth/player/${id}/callback`);
      url.searchParams.set("state", authorization.searchParams.get("state")!);
      url.searchParams.set("code", "test-authorization-code");
    }
    if (badState) url.searchParams.set("state", "wrong-state");
    currentRequest = new Request(url, { headers: { cookie: cookies(response, extra) } });
    return callbacks[id].GET(currentRequest);
  }

  for (const { id } of OAUTH_PROVIDERS) {
    await t.test(`${id} signs up through a fresh provider authorization`, async () => {
      await players.deleteMany({});
      const beginning = await start(id);
      assert.equal(beginning.status, 303);
      const response = await finish(id, beginning);
      assert.equal(new URL(response.headers.get("location")!).pathname, "/play/onboarding");
      assert.ok(response.headers.getSetCookie().some((value) => value.startsWith(`${sessionCookie}=`)));
      const player = await players.findOne({});
      assert.ok(player?.oauth_accounts?.[id]?.verified_at instanceof Date);
      assert.equal(await db.collection("items").countDocuments({ owner: player!._id }), 12);
      if (id === "instagram") assert.equal(player?.oauth_accounts?.instagram?.username, "instagram.player");
      assert.equal(player?.email_verified, id === "google" || id === "discord");
      assert.equal(await players.countDocuments(), 1);
    });
    await t.test(`${id} sync reauthorizes and links only the signed-in player`, async () => {
      await players.deleteMany({});
      const token = await seed();
      const beginning = await start(id, token);
      assert.equal(beginning.status, 303);
      const response = await finish(id, beginning, { [sessionCookie]: token });
      assert.equal(new URL(response.headers.get("location")!).searchParams.get("oauth"), "updated");
      assert.equal(new URL(response.headers.get("location")!).pathname, "/play/account");
      assert.ok((await players.findOne({ _id: "current-player" }))?.oauth_accounts?.[id]);
      assert.equal(await players.countDocuments(), 1);
    });
  }

  await t.test("approved artists sign in to Artist studio through every synced provider", async () => {
    for (const { id } of OAUTH_PROVIDERS) {
      await players.deleteMany({});
      const token = await seed();
      await players.updateOne({ _id: "current-player" }, { $set: { artist_id: "approved-artist", account_type: "artist" } });
      await finish(id, await start(id, token), { [sessionCookie]: token });
      const response = await finish(id, await start(id));
      assert.equal(new URL(response.headers.get("location")!).pathname, "/artist", id);
      assert.equal(await players.countDocuments(), 1);
    }
  });

  await t.test("sync start refuses anonymous or cross-origin POSTs", async () => {
    currentRequest = new Request("http://localhost/api/auth/player/google", { method: "POST", headers: { origin: "http://localhost" } });
    assert.equal((await starts.google.POST(currentRequest)).status, 401);
    await players.deleteMany({});
    const token = await seed();
    assert.equal((await start("google", token, "https://other.invalid")).status, 403);
  });

  await t.test("callbacks reject invalid states before talking to the provider", async () => {
    for (const { id } of OAUTH_PROVIDERS) {
      const beginning = await start(id);
      const before = fetchCount;
      assert.equal((await finish(id, beginning, {}, true)).status, 400);
      assert.equal(fetchCount, before);
    }
  });

  await t.test("missing, tampered, expired, logged-out and switched-session sync intents cannot become signups", async () => {
    for (const mutation of ["missing", "tampered", "expired", "logout", "different-player", "different-token"]) {
      await players.deleteMany({});
      const token = await seed();
      const beginning = await start("discord", token);
      const intentName = "artfunkel_discord_oauth_intent";
      const extra: Record<string, string | undefined> = { [sessionCookie]: token };
      if (mutation === "missing") extra[intentName] = undefined;
      if (mutation === "tampered") extra[intentName] = "invalid.signature";
      if (mutation === "expired") {
        extra[intentName] = await new jose.SignJWT({
          provider: "discord", mode: "sync",
          state: new URL(beginning.headers.get("location")!).searchParams.get("state"),
          playerId: "current-player", sessionBinding: crypto.createHash("sha256").update(token).digest("hex"),
        }).setProtectedHeader({ alg: "HS256" }).setAudience("artfunkel-oauth")
          .setExpirationTime(Math.floor(Date.now() / 1000) - 1).sign(new TextEncoder().encode(env.SESSION_SECRET));
      }
      if (mutation === "logout") extra[sessionCookie] = undefined;
      if (mutation === "different-player") extra[sessionCookie] = await seed("different-player");
      if (mutation === "different-token") {
        extra[sessionCookie] = await new jose.SignJWT({
          email: "current-player@example.com", screenName: "current-player", role: "player",
        }).setProtectedHeader({ alg: "HS256" }).setSubject("current-player")
          .setIssuedAt().setJti("different-session").setExpirationTime("8h")
          .sign(new TextEncoder().encode(env.SESSION_SECRET));
      }
      const response = await finish("discord", beginning, extra);
      assert.equal(response.status, 400, mutation);
      assert.equal(await players.countDocuments({ "oauth_accounts.discord.id": { $exists: true } }), 0, mutation);
      assert.ok(!response.headers.getSetCookie().some((value) => value.startsWith(`${sessionCookie}=`)));
    }
  });

  await t.test("existing-email signup and conflicting sync return actionable messages without switching players", async () => {
    await players.deleteMany({});
    await seed("other-player", email);
    let response = await finish("discord", await start("discord"));
    assert.equal(new URL(response.headers.get("location")!).searchParams.get("oauth"), "existing-account");
    assert.equal(await players.countDocuments(), 1);
    const token = await seed();
    response = await finish("google", await start("google", token), { [sessionCookie]: token });
    assert.equal(new URL(response.headers.get("location")!).searchParams.get("oauth"), "conflict");
    assert.match(getOAuthMessage("conflict", "google")!, /not possible at this time/);
    assert.equal((await players.findOne({ _id: "current-player" }))?.oauth_accounts, undefined);
    assert.ok(!response.headers.getSetCookie().some((value) => value.startsWith(`${sessionCookie}=`)));
  });

  await t.test("provider failures and personal Instagram accounts do not create or link players", async () => {
    await players.deleteMany({});
    providerFailure = true;
    assert.equal((await finish("google", await start("google"))).status, 502);
    providerFailure = false;
    instagramAccountType = "PERSONAL";
    assert.equal((await finish("instagram", await start("instagram"))).status, 400);
    assert.equal(await players.countDocuments(), 0);
    instagramAccountType = "MEDIA_CREATOR";
    instagramNestedResponse = false;
    assert.equal((await finish("instagram", await start("instagram"))).status, 307);
    assert.equal(await players.countDocuments(), 1);
    instagramAccountType = "BUSINESS";
  });

  await t.test("password signup also refuses a legacy provider email alias", async () => {
    await players.deleteMany({});
    await seed("legacy-player");
    await players.updateOne({ _id: "legacy-player" }, {
      $set: { "oauth_accounts.discord.email": "legacy-alias@example.com" },
    });
    const register = await load<{ POST: Route["POST"] }>("../app/api/auth/player/register/route.ts", {
      "next/server": { NextResponse }, "@/server/mongodb": { getDatabase: async () => db },
      "@/server/password": {
        validatePassword: () => null,
        hashPassword: () => assert.fail("Duplicate email should be rejected before hashing"),
      },
      "@/server/oauth-identity": identities, "@/server/player-account": playerAccount,
      "@/server/operational-logging": logging, "@/server/session": session,
    }, globals);
    const response = await register.POST(new Request("http://localhost/api/auth/player/register", {
      method: "POST", body: JSON.stringify({
        email: "LEGACY-ALIAS@example.com", screenName: "New-Player", password: "unused-test-password",
      }),
    }));
    assert.equal(response.status, 409);
    assert.equal(await players.countDocuments(), 1);
  });

  await t.test("account controls expose provider sync and one standalone deletion control for the entire player", async () => {
    const deletionSection = await load<typeof import("../app/play/account/delete-account-section.tsx")>(
      "../app/play/account/delete-account-section.tsx", {
        react: require("react"), "react/jsx-runtime": require("react/jsx-runtime"),
        "next/link": require("next/link"),
      },
    );
    const account = await load<typeof import("../app/play/account/account-form.tsx")>("../app/play/account/account-form.tsx", {
      react: require("react"), "react/jsx-runtime": require("react/jsx-runtime"),
      "next/navigation": { useRouter: () => ({ refresh() {} }) },
      "./delete-account-section": deletionSection,
    });
    const props = {
      email, emailVerified: true, enableReveals: true, hasPassword: true, screenName: "Current-Player",
      oauthMessage: getOAuthMessage("updated", "instagram"),
      providers: OAUTH_PROVIDERS.map(({ id, name }) => ({
        id, name, configured: true, linked: true, email: null, emailVerified: false, verifiedAt: null,
      })),
      patreon: {
        checkedAt: null, configured: true, email: null, emailMatchesPlayer: null, isSupporter: false,
        linked: true, message: null, requiresReauthorization: false, tierAmountCents: null, tierName: null,
      },
    };
    const html = renderToStaticMarkup(createElement(account.default, props));
    assert.doesNotMatch(html, /View preferences|Preferred gallery format|name="galleryView"/);
    assert.match(html, /Enable reveals/);
    assert.match(html, /business and creator accounts only/);
    assert.equal((html.match(/>Delete account<\/button>/g) ?? []).length, 1);
    assert.ok(html.indexOf(">Delete account</button>") > html.indexOf("Save password"));
    assert.match(html, /all synced-account information stored by artfunkel/);
    assert.match(html, /href="\/privacy"/);
    assert.match(html, /href="\/data-deletion"/);
    for (const { id, name } of OAUTH_PROVIDERS) {
      assert.match(html, new RegExp(`action="/api/auth/player/${id}" method="post"`));
      assert.ok(html.includes(`Sync with ${name}`));
    }
    const withoutProviders = renderToStaticMarkup(createElement(account.default, { ...props, providers: [] }));
    assert.equal((withoutProviders.match(/>Delete account<\/button>/g) ?? []).length, 1);
  });
});
