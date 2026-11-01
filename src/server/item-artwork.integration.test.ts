import assert from "node:assert/strict";
import test from "node:test";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { PlayerArtworkArchive } from "./archive-gameplay.ts";
import type { Artwork, GameItem } from "./gameplay.ts";
import { hydrateGameItems, hydratePlayerArtworkArchives } from "./item-artwork.ts";

test("archives hide inactive and missing artworks without deleting archive records or hiding owned items", async t => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  t.after(async () => { await client.close(); await server.stop(); });
  await client.connect();
  const db = client.db("active-archives");
  await db.collection<Artwork>("artworks").insertMany([
    { _id: "active", active: true, title: "Visible" } as Artwork,
    { _id: "inactive", active: false, title: "Hidden" } as Artwork,
  ]);
  const archives = ["active", "inactive", "missing"].map(id => ({
    _id: `archive-${id}`, artwork_id: id, owner: "player",
    entries: [{ source_item_id: id, modifiers: ["standard"], art_style: "arcade", value: 10, archived_at: "2026-01-01" }],
    combined_value: 10, archived_count: 1,
  })) as PlayerArtworkArchive[];
  await db.collection<PlayerArtworkArchive>("player_artwork_archives").insertMany(archives);
  const hydrated = await hydratePlayerArtworkArchives(db, archives);
  assert.deepEqual(hydrated.map(entry => entry.artwork_id), ["active"]);
  assert.deepEqual(hydrated[0].artStyles, ["arcade"]);
  assert.deepEqual(hydrated[0].modifiers, ["standard"]);
  assert.equal(await db.collection("player_artwork_archives").countDocuments(), 3);
  assert.equal((await hydrateGameItems(db, [{ _id: "item", artwork_id: "inactive" } as GameItem])).length, 1);
  await db.collection<Artwork>("artworks").updateOne({ _id: "inactive" }, { $set: { active: true } });
  assert.deepEqual((await hydratePlayerArtworkArchives(db, archives)).map(entry => entry.artwork_id), ["active", "inactive"]);
});
