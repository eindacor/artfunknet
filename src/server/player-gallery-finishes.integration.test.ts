import assert from "node:assert/strict";
import test from "node:test";

import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import {
  DEFAULT_GALLERY_FINISHES,
  getGalleryFinishes,
  type PlayerGalleryFinishes,
} from "./gallery-finishes.ts";
import {
  getPlayerGalleryFinishes,
  savePlayerGalleryFinishes,
} from "./player-gallery-finishes.ts";

test("per-gallery finishes initialize and save only for the active owner", async (t) => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  t.after(async () => {
    await client.close();
    await server.stop();
  });
  await client.connect();
  const database = client.db("gallery-finishes-test");
  const players = database.collection<{
    _id: string;
    active: boolean;
    gallery_finishes?: PlayerGalleryFinishes | null;
  }>("players");
  await players.insertMany([
    { _id: "owner", active: true },
    { _id: "visitor", active: true, gallery_finishes: null },
    { _id: "inactive-owner", active: false },
  ]);
  await database.collection<{
    _id: string;
    owner_id: string;
    active: boolean;
  }>("galleries").insertMany([
    { _id: "legacy-gallery", owner_id: "owner", active: true },
    { _id: "second-gallery", owner_id: "owner", active: true },
    { _id: "visitor-gallery", owner_id: "visitor", active: true },
    { _id: "inactive-gallery", owner_id: "owner", active: false },
    { _id: "inactive-owner-gallery", owner_id: "inactive-owner", active: true },
  ]);

  await t.test("existing players get defaults keyed by the actual gallery, including null maps", async () => {
    assert.deepEqual(
      await getPlayerGalleryFinishes(database, "owner", "legacy-gallery"),
      DEFAULT_GALLERY_FINISHES,
    );
    assert.deepEqual(
      (await players.findOne({ _id: "owner" }))?.gallery_finishes,
      { "legacy-gallery": DEFAULT_GALLERY_FINISHES },
    );
    await getPlayerGalleryFinishes(database, "visitor", "visitor-gallery");
    assert.deepEqual(
      (await players.findOne({ _id: "visitor" }))?.gallery_finishes,
      { "visitor-gallery": DEFAULT_GALLERY_FINISHES },
    );
  });

  const first = getGalleryFinishes({ wall: [0.1, 0.2, 0.3], floor: [1, 0, 0], trim: [0, 0, 1] });
  const second = getGalleryFinishes({ ceiling: [0.4, 0.5, 0.6], matte: [0, 1, 0] });
  await t.test("concurrent saves preserve independent galleries and reload exact vec3 values", async () => {
    assert.deepEqual(await Promise.all([
      savePlayerGalleryFinishes(database, "owner", "legacy-gallery", first),
      savePlayerGalleryFinishes(database, "owner", "second-gallery", second),
    ]), [true, true]);
    assert.deepEqual(
      await getPlayerGalleryFinishes(database, "owner", "legacy-gallery"),
      first,
    );
    assert.deepEqual(
      (await players.findOne({ _id: "owner" }))?.gallery_finishes,
      { "legacy-gallery": first, "second-gallery": second },
    );
  });

  await t.test("visitors, inactive accounts, unavailable galleries, and unsafe IDs cannot write", async () => {
    for (const [playerId, galleryId] of [
      ["visitor", "legacy-gallery"],
      ["owner", "visitor-gallery"],
      ["owner", "inactive-gallery"],
      ["owner", "missing-gallery"],
      ["inactive-owner", "inactive-owner-gallery"],
      ["owner", "legacy-gallery.wall"],
    ]) {
      assert.equal(
        await savePlayerGalleryFinishes(database, playerId, galleryId, DEFAULT_GALLERY_FINISHES),
        false,
      );
    }
    assert.deepEqual(
      (await players.findOne({ _id: "owner" }))?.gallery_finishes,
      { "legacy-gallery": first, "second-gallery": second },
    );
    assert.equal(
      (await players.findOne({ _id: "inactive-owner" }))?.gallery_finishes,
      undefined,
    );
  });
});
