import assert from "node:assert/strict";
import test from "node:test";

import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import {
  acknowledgeSupporterPrompt,
  getSupporterPromptState,
  type SupporterPromptPlayer,
} from "./supporter-prompt.ts";

test("monthly supporter acknowledgment persists without scheduled resets", async (t) => {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  t.after(async () => { await client.close(); await server.stop(); });
  const db = client.db("monthly-supporter-prompts");
  const players = db.collection<SupporterPromptPlayer>("players");

  await t.test("only the authenticated active account is updated, preserving other metadata", async () => {
    await db.collection<{ _id: string }>("players").insertMany([
      { _id: "player", active: true, profile: { view_settings: { enableReveals: false } } },
      { _id: "other", active: true },
      { _id: "inactive", active: false },
    ]);
    const now = new Date("2026-11-01T10:00:00.000Z");
    assert.equal(await acknowledgeSupporterPrompt(db, "missing", now), null);
    assert.equal(await acknowledgeSupporterPrompt(db, "inactive", now), null);
    assert.deepEqual(await acknowledgeSupporterPrompt(db, "player", now), now);
    assert.equal(getSupporterPromptState((await players.findOne({ _id: "player" }))!, now).required, false);
    assert.equal(getSupporterPromptState((await players.findOne({ _id: "player" }))!, new Date("2026-12-01T00:00:00.000Z")).required, true);
    assert.equal((await db.collection<{ _id: string; profile: { view_settings: { enableReveals: boolean } } }>("players").findOne({ _id: "player" }))?.profile.view_settings.enableReveals, false);
    assert.equal((await players.findOne({ _id: "other" }))?.profile?.supporter_prompt_acknowledged_at, undefined);
  });

  await t.test("a delayed older acknowledgment cannot overwrite a newer month", async () => {
    const oldMonth = new Date("2026-11-30T23:59:59.999Z");
    const newMonth = new Date("2026-12-01T00:00:00.000Z");
    await Promise.all(Array.from({ length: 12 }, (_, index) =>
      acknowledgeSupporterPrompt(db, "player", index % 2 ? oldMonth : newMonth),
    ));
    assert.deepEqual(await acknowledgeSupporterPrompt(db, "player", oldMonth), newMonth);
    const saved = (await players.findOne({ _id: "player" }))!;
    assert.deepEqual(saved.profile?.supporter_prompt_acknowledged_at, newMonth);
    assert.equal(getSupporterPromptState(saved, newMonth).required, false);
  });
});
