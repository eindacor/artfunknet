import assert from "node:assert/strict";
import test from "node:test";

import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import { withLeastRepresentedRareSpecialAttribute } from "./rare-special-attributes.ts";

test("rare special attributes prefer the least represented active option", async () => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  try {
    await client.connect();
    const database = client.db("rare-special-attributes");
    await database.collection("attributes").insertMany([
      { _id: "a", title: "A", active: true },
      { _id: "b", title: "B", active: true },
      { _id: "c", title: "C", active: true },
      { _id: "inactive", title: "Inactive", active: false },
    ]);
    await database.collection("artworks").insertMany([
      { _id: "rare-a-1", rarity: "rare", special_attributes: ["a"] },
      { _id: "rare-a-2", rarity: "rare", special_attributes: ["a"] },
      { _id: "rare-b", rarity: "rare", special_attributes: ["b"] },
      { _id: "rare-missing", rarity: "rare" },
      {
        _id: "common-inactive",
        rarity: "common",
        special_attributes: ["inactive"],
      },
    ]);

    assert.equal(
      await withLeastRepresentedRareSpecialAttribute(
        database,
        async (attribute) => attribute._id,
        () => 0,
      ),
      "c",
    );

    await database.collection("artworks").insertOne({
      _id: "rare-c",
      rarity: "rare",
      special_attributes: ["c"],
    });
    assert.equal(
      await withLeastRepresentedRareSpecialAttribute(
        database,
        async (attribute) => attribute._id,
        () => 0.999,
      ),
      "c",
    );
  } finally {
    await client.close();
    await server.stop();
  }
});

test("rare special attribute assignment fails without an active option", async () => {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  try {
    await client.connect();
    const database = client.db("rare-special-attributes-empty");
    await database.collection("attributes").insertOne({
      _id: "inactive",
      title: "Inactive",
      active: false,
    });

    await assert.rejects(
      withLeastRepresentedRareSpecialAttribute(
        database,
        async (attribute) => attribute._id,
      ),
      /No active artwork attribute is available/,
    );
  } finally {
    await client.close();
    await server.stop();
  }
});
