import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { MongoClient, type Db, type Document } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import ts from "typescript";
import type { ArtworkImageRecord, ArtworkStorageReference } from "./artwork-storage.ts";

const require = createRequire(import.meta.url);
const logging = {
  createOperationId: () => "denial-test",
  logOperationalError: () => {},
  logOperationalInfo: () => {},
};
type Context = { params: Promise<{ id: string }> };
type Route = {
  DELETE: (request: Request, context: Context) => Promise<Response>;
  PATCH: (request: Request, context: Context) => Promise<Response>;
  POST: (request: Request, context: Context) => Promise<Response>;
};
type Command = { input: Record<string, unknown>; constructor: { name: string } };
const variants = ["full", "card", "thumb"] as const;
const context = (id: string) => ({ params: Promise.resolve({ id }) });

async function load<T>(relative: string, dependencies: Record<string, unknown>, globals = {}) {
  const source = await fs.readFile(new URL(relative, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  return runInNewContext(`${code}\nexports`, {
    exports: {}, console, URL, Date, Request, Response, FormData, File, Buffer, Uint8Array, process,
    ...globals,
    require: (id: string) => Object.hasOwn(dependencies, id) ? dependencies[id] : require(id),
  }) as T;
}

async function loadStorage(options: {
  send?: (command: Command) => Promise<unknown>;
  unlink?: typeof fs.unlink;
} = {}) {
  return load<typeof import("./artwork-storage.ts")>("./artwork-storage.ts", {
    "server-only": {},
    "node:fs/promises": { ...fs, unlink: options.unlink ?? fs.unlink },
    "@aws-sdk/client-s3": {
      ...require("@aws-sdk/client-s3"),
      S3Client: class {
        send(command: Command) {
          assert.ok(options.send, "Tests must not access real S3");
          return options.send(command);
        }
      },
    },
    "@/server/artwork-image-processing": {},
    "@/server/operational-logging": logging,
  }, {
    process: { ...process, env: { ...process.env, ARTWORK_S3_BUCKET: "denial-test", USE_MOCK_S3: options.send ? "false" : "true" } },
  });
}

function image(prefix: string, version?: string): ArtworkImageRecord {
  return {
    version: 2,
    variants: Object.fromEntries(variants.map(name => [name, {
      name, width: 100, height: 100, checksum: name, content_type: "image/webp", byte_size: 10,
      storage: version
        ? { provider: "s3", bucket: "denial-test", key: `${prefix}/${name}.webp`, version_id: version }
        : { provider: "mock-s3", key: `${prefix}/${name}.webp` },
    }])) as ArtworkImageRecord["variants"],
  };
}

function dependencies(database: Db, storage: unknown, admin = true) {
  return {
    "next/server": require("next/server"),
    "@/server/admin-api": {
      requireAdminApi: async () => admin
        ? { ok: true, session: { email: "admin@example.com" } }
        : { ok: false, response: Response.json({ error: "Admin required" }, { status: 403 }) },
    },
    "@/server/artwork-storage": storage,
    "@/server/mongodb": { getDatabase: async () => database },
    "@/server/operational-logging": logging,
    "@/server/community-reaction-cleanup": { deleteCommunityReactions: async () => {} },
    "@/server/gameplay": {},
    "@/server/item-reroll": {},
    "@/server/artwork-create-input": {},
    "@/server/item-drop-chance": {},
    "@/server/artwork-files": {},
    "@/server/artwork-image-processing": {},
    "@/server/artwork-effects": {},
    "@/server/rare-special-attributes": {},
  };
}

test("S3 cleanup deletes exact stored versions, including superseded versions of the same key", async () => {
  const commands: Command[] = [];
  const storage = await loadStorage({ send: async command => {
    commands.push(command);
    return { VersionId: "intake-version" };
  } });
  const before = image("artworks/denied", "old-version");
  const after = image("artworks/denied", "new-version");
  await storage.deleteArtworkImageRecord(before, storage.getArtworkImageStorageKeys(after));
  assert.deepEqual(commands.map(command => [command.input.Key, command.input.VersionId]), [
    ["artworks/denied/full.webp", "old-version"],
    ["artworks/denied/card.webp", "old-version"],
    ["artworks/denied/thumb.webp", "old-version"],
  ]);
  assert.ok(commands.every(command => command.constructor.name === "DeleteObjectCommand" && command.input.Bucket === "denial-test"));
  const unversioned: ArtworkStorageReference = { provider: "s3", bucket: "denial-test", key: "artworks/denied/full.webp" };
  await storage.deleteArtworkImageRecord({ content_type: "image/webp", storage: unversioned }, storage.getArtworkImageStorageKeys(after));
  assert.equal(commands.length, 3, "Do not delete an unversioned key still used by the replacement");
  await storage.deleteArtworkImageRecord(after);
  assert.deepEqual(commands.slice(3).map(command => command.input.VersionId), ["new-version", "new-version", "new-version"]);
  const upload = await storage.uploadArtworkIntake(new File(["fixture"], "fixture.png", { type: "image/png" }));
  assert.equal(upload.storage.provider, "s3");
  if (upload.storage.provider === "s3") assert.equal(upload.storage.version_id, "intake-version");
});

test("a failed S3 deletion still attempts every variant and waits for all cleanup attempts", async () => {
  const attempted: unknown[] = [];
  const completed: unknown[] = [];
  const storage = await loadStorage({ send: async command => {
    attempted.push(command.input.Key);
    if (String(command.input.Key).endsWith("full.webp")) throw new Error("Storage unavailable");
    await new Promise(resolve => setTimeout(resolve, 10));
    completed.push(command.input.Key);
    return {};
  } });
  await assert.rejects(storage.deleteArtworkImageRecord(image("artworks/failure", "version")), /Storage unavailable/);
  assert.equal(attempted.length, 3);
  assert.equal(completed.length, 2);
});

test("artwork denial removes persisted image references and actual uploaded files with retryable failures", async t => {
  const mongo = await MongoMemoryServer.create();
  const client = await new MongoClient(mongo.getUri()).connect();
  const prefix = `denial-check-${randomUUID()}`;
  const fixtureRoot = path.resolve("storage", "mock-s3", prefix);
  t.after(async () => {
    await client.close();
    await mongo.stop();
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });
  const filePath = (storage: ArtworkStorageReference) => path.resolve("storage", "mock-s3", storage.key);
  const write = async (storage: ArtworkStorageReference) => {
    const destination = filePath(storage);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, "uploaded image");
  };
  const createImage = async (name: string) => {
    const result = image(`${prefix}/${name}`);
    for (const variant of Object.values(result.variants)) await write(variant.storage);
    return result;
  };
  const assertRemoved = async (images: ArtworkImageRecord[]) => {
    for (const record of images) {
      for (const variant of Object.values(record.variants)) {
        await assert.rejects(fs.access(filePath(variant.storage)), { code: "ENOENT" });
      }
    }
  };
  const artworksRoute = "../app/api/admin/artworks/[id]/route.ts";
  const replacementRoute = "../app/api/admin/artworks/[id]/image/route.ts";
  const intakeRoute = "../app/api/admin/artwork-submissions/[id]/route.ts";

  await t.test("artist denial removes full, card, thumbnail and legacy retired images without touching other artwork", async () => {
    const db = client.db("artist-denial");
    const current = await createImage("artist-current");
    const retained = await createImage("unrelated");
    const retired: ArtworkStorageReference = { provider: "mock-s3", key: `${prefix}/artist-retired.png` };
    await write(retired);
    const collection = db.collection<Document & { _id: string }>("artworks");
    await collection.insertMany([
      { _id: "denied", title: "Denied", active: false, submission_status: "pending", image: current,
        retired_images: [{ content_type: "image/png", storage: retired }] },
      { _id: "other", active: true, image: retained },
    ]);
    const storage = await loadStorage();
    const route = await load<Route>(artworksRoute, dependencies(db, storage));
    assert.equal((await route.DELETE(new Request("http://localhost"), context("denied"))).status, 200);
    assert.equal(await collection.findOne({ _id: "denied" }), null);
    await assertRemoved([current]);
    await assert.rejects(fs.access(filePath(retired)), { code: "ENOENT" });
    assert.ok(await collection.findOne({ _id: "other" }));
    for (const variant of Object.values(retained.variants)) await fs.access(filePath(variant.storage));
  });

  await t.test("failed replacement cleanup stays recorded until denial removes both current and retired images", async () => {
    const db = client.db("replacement-retirement");
    const before = await createImage("before-replacement");
    const after = await createImage("after-replacement");
    let fail = true;
    const storage = await loadStorage({ unlink: async destination => {
      if (fail && String(destination) === filePath(before.variants.full.storage)) throw new Error("Storage unavailable");
      await fs.unlink(destination);
    } });
    const collection = db.collection<Document & { _id: string }>("artworks");
    await collection.insertOne({ _id: "denied", title: "Denied", active: false, submission_status: "pending", image: before });
    const replacement = await load<Route>(replacementRoute, dependencies(db, {
      ...storage, publishArtworkUpload: async () => after,
    }));
    const body = new FormData();
    body.set("image", new File(["replacement"], "image.png", { type: "image/png" }));
    const response = await replacement.POST(new Request("http://localhost", { method: "POST", body }), context("denied"));
    assert.equal(response.status, 200);
    assert.equal((await collection.findOne({ _id: "denied" }))?.retired_images.length, 1);
    const route = await load<Route>(artworksRoute, dependencies(db, storage));
    assert.equal((await route.DELETE(new Request("http://localhost"), context("denied"))).status, 503);
    assert.equal((await collection.findOne({ _id: "denied" }))?.submission_status, "denying");
    const retryBody = new FormData();
    retryBody.set("image", new File(["fixture"], "image.png"));
    assert.equal((await replacement.POST(new Request("http://localhost", {
      method: "POST", body: retryBody,
    }), context("denied"))).status, 409);
    fail = false;
    assert.equal((await route.DELETE(new Request("http://localhost"), context("denied"))).status, 200);
    assert.equal(await collection.findOne({ _id: "denied" }), null);
    await assertRemoved([before, after]);
  });

  await t.test("denial during an upload cannot commit replacement metadata or orphan its uploaded files", async () => {
    const db = client.db("denial-upload-race");
    const before = await createImage("race-before");
    const after = await createImage("race-after");
    const collection = db.collection<Document & { _id: string }>("artworks");
    await collection.insertOne({ _id: "denied", title: "Denied", active: false, submission_status: "pending", image: before });
    const storage = await loadStorage();
    let started!: () => void;
    const uploading = new Promise<void>(resolve => { started = resolve; });
    let finish!: (value: ArtworkImageRecord) => void;
    const published = new Promise<ArtworkImageRecord>(resolve => { finish = resolve; });
    const replacement = await load<Route>(replacementRoute, dependencies(db, {
      ...storage, publishArtworkUpload: () => { started(); return published; },
    }));
    const body = new FormData();
    body.set("image", new File(["replacement"], "image.png", { type: "image/png" }));
    const result = replacement.POST(new Request("http://localhost", { method: "POST", body }), context("denied"));
    await uploading;
    const denial = await load<Route>(artworksRoute, dependencies(db, storage));
    assert.equal((await denial.DELETE(new Request("http://localhost"), context("denied"))).status, 200);
    finish(after);
    assert.equal((await result).status, 400);
    assert.equal(await collection.findOne({ _id: "denied" }), null);
    await assertRemoved([before, after]);
  });

  await t.test("legacy rejection removes the intake original, every variant and the submission, but not approved or unauthorized records", async () => {
    const db = client.db("intake-denial");
    const uploaded = await createImage("intake");
    const original: ArtworkStorageReference = { provider: "mock-s3", key: `${prefix}/intake/original.png` };
    await write(original);
    const collection = db.collection<Document & { _id: string }>("artwork_submissions");
    await collection.insertMany([
      { _id: "reject", status: "unverified", image: { storage: original, variants: uploaded } },
      { _id: "approved", status: "approved", image: { variants: await createImage("approved-intake") } },
    ]);
    const storage = await loadStorage();
    const request = () => new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ action: "reject" }) });
    const unauthorized = await load<Route>(intakeRoute, dependencies(db, storage, false));
    assert.equal((await unauthorized.PATCH(request(), context("reject"))).status, 403);
    await fs.access(filePath(original));
    const route = await load<Route>(intakeRoute, dependencies(db, storage));
    assert.equal((await route.PATCH(request(), context("approved"))).status, 404);
    assert.equal((await route.PATCH(request(), context("reject"))).status, 200);
    assert.equal(await collection.findOne({ _id: "reject" }), null);
    await assertRemoved([uploaded]);
    await assert.rejects(fs.access(filePath(original)), { code: "ENOENT" });
    const approved = await collection.findOne({ _id: "approved" });
    for (const variant of Object.values((approved!.image.variants as ArtworkImageRecord).variants)) await fs.access(filePath(variant.storage));
  });

  await t.test("legacy storage failures retain a retryable record and prevent saving or approving the submission", async () => {
    const db = client.db("intake-denial-retry");
    const uploaded = await createImage("intake-retry");
    const original: ArtworkStorageReference = { provider: "mock-s3", key: `${prefix}/intake-retry/original.png` };
    await write(original);
    const collection = db.collection<Document & { _id: string }>("artwork_submissions");
    await collection.insertOne({ _id: "reject", status: "unverified", image: { storage: original, variants: uploaded } });
    let fail = true;
    const storage = await loadStorage({ unlink: async destination => {
      if (fail && String(destination) === filePath(original)) throw new Error("Storage unavailable");
      await fs.unlink(destination);
    } });
    const route = await load<Route>(intakeRoute, dependencies(db, storage));
    const request = (action: string) => new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ action }) });
    assert.equal((await route.PATCH(request("reject"), context("reject"))).status, 503);
    assert.equal((await collection.findOne({ _id: "reject" }))?.status, "denying");
    await assertRemoved([uploaded]);
    assert.equal((await route.PATCH(request("save"), context("reject"))).status, 404);
    const approval = await load<Route>("../app/api/admin/artwork-submissions/[id]/approve/route.ts", dependencies(db, storage));
    assert.equal((await approval.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({
      artist_id: "artist", title: "Title", date: 2026, genre: "Abstract", medium: "Oil", rarity: "common", height: 100,
    }) }), context("reject"))).status, 404);
    fail = false;
    assert.equal((await route.PATCH(request("reject"), context("reject"))).status, 200);
    assert.equal(await collection.findOne({ _id: "reject" }), null);
    await assert.rejects(fs.access(filePath(original)), { code: "ENOENT" });
  });
});
