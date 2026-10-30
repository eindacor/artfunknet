import assert from "node:assert/strict";
import test from "node:test";

import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import { hasInventorySpaceForItem } from "./inventory-capacity.ts";

test("dealer capacity includes consigned items and treats missing expansion slots as zero", async (t) => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  t.after(async () => {
    await client.close();
    await server.stop();
  });
  await client.connect();
  const database = client.db("inventory-capacity");
  const items = database.collection<{
    _id: string;
    owner: string;
    status: string;
    original?: boolean;
    vintage?: boolean;
  }>("items");
  const player = { _id: "player", profile: { inventory_cap: 2 } };
  await items.insertMany([
    { _id: "claimed", owner: player._id, status: "claimed" },
    { _id: "displayed", owner: player._id, status: "displayed" },
    { _id: "vintage", owner: player._id, status: "displayed", vintage: true },
    { _id: "original", owner: player._id, status: "claimed", original: true },
    { _id: "offer", owner: player._id, status: "for_sale" },
    { _id: "unclaimed", owner: player._id, status: "unclaimed" },
    { _id: "won", owner: player._id, status: "won" },
    { _id: "other-player", owner: "other", status: "claimed" },
  ]);
  const regularItem = { original: false, vintage: false };

  await t.test("full and overfull inventories reject normal purchases without expansion metadata", async () => {
    assert.equal(
      await hasInventorySpaceForItem(database, player, regularItem),
      false,
    );
    assert.equal(
      await hasInventorySpaceForItem(database, {
        ...player,
        profile: { inventory_cap: 1 },
      }, regularItem),
      false,
    );
  });

  await t.test("expansions work and vintage, original, pending and other-player items do not consume slots", async () => {
    assert.equal(
      await hasInventorySpaceForItem(database, {
        ...player,
        profile: { inventory_cap: 2, expansion_slots: 1 },
      }, regularItem),
      true,
    );
    assert.equal(
      await hasInventorySpaceForItem(database, {
        ...player,
        profile: { inventory_cap: 2, expansion_slots: 0 },
      }, regularItem),
      false,
    );
  });

  await t.test("only seller-consigned auctioned items continue to occupy inventory slots", async () => {
    await items.updateOne({ _id: "displayed" }, { $set: { status: "auctioned" } });
    const auctions = database
      .collection<{ seller_id: string; item_id: string }>("auctions");
    await auctions.insertOne({ seller_id: "other", item_id: "displayed" });
    assert.equal(
      await hasInventorySpaceForItem(database, player, regularItem),
      true,
    );
    await auctions.insertOne({ seller_id: player._id, item_id: "displayed" });
    assert.equal(
      await hasInventorySpaceForItem(database, player, regularItem),
      false,
    );
    await items.updateOne({ _id: "displayed" }, { $set: { vintage: true } });
    assert.equal(
      await hasInventorySpaceForItem(database, player, regularItem),
      true,
    );
    await items.updateOne({ _id: "displayed" }, {
      $set: { original: true }, $unset: { vintage: "" },
    });
    assert.equal(
      await hasInventorySpaceForItem(database, player, regularItem),
      true,
    );
    await items.updateOne({ _id: "displayed" }, {
      $set: { original: false, status: "displayed" },
    });
    assert.equal(
      await hasInventorySpaceForItem(database, player, regularItem),
      false,
    );
  });

  await t.test("acquiring an original or vintage item remains allowed when ordinary slots are full", async () => {
    assert.equal(
      await hasInventorySpaceForItem(database, player, { original: true }),
      true,
    );
    assert.equal(
      await hasInventorySpaceForItem(database, player, { vintage: true }),
      true,
    );
    await items.deleteOne({ _id: "displayed" });
    assert.equal(
      await hasInventorySpaceForItem(database, player, regularItem),
      true,
    );
  });
});
