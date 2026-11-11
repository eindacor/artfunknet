import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import * as React from "react";
import ts from "typescript";

import { getDailyEventAttention } from "./daily-event-attention.ts";
import { getDailyEventWeekKey } from "./daily-event-time.ts";

test("daily event reminders follow player actions, New York windows, and actual auction state", async (t) => {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  t.after(async () => { await client.close(); await server.stop(); });
  const monday = new Date("2026-11-09T15:00:00.000Z");
  const cycleId = "2026-11-10T17:00:00.000Z";

  await t.test("entry reminders require no existing forgery and ignore other players, old rounds, and pending entries", async () => {
    const db = client.db("entry-reminders");
    const entries = db.collection("forgery_contest_entries");
    const initial = await getDailyEventAttention(db, "viewer", monday);
    assert.deepEqual(initial.callsToAction.map(action => action.label), ["Enter"]);
    assert.equal(await db.collection("metadata").countDocuments(), 0, "checking reminders does not generate contest prizes");
    await db.collection("metadata").insertOne({
      _id: "forgery-contest-state", cycle_id: cycleId, next_settlement_at: cycleId,
    });
    await entries.insertMany([
      { _id: "other", cycle_id: cycleId, player_id: "other", pending: false },
      { _id: "old", cycle_id: "2026-11-03T17:00:00.000Z", player_id: "viewer", pending: false },
      { _id: "pending", cycle_id: cycleId, player_id: "viewer", pending: true },
    ]);
    assert.equal((await getDailyEventAttention(db, "viewer", monday)).callsToAction[0]?.label, "Enter");
    await entries.updateOne({ _id: "pending" }, { $set: { pending: false } });
    assert.deepEqual((await getDailyEventAttention(db, "viewer", monday)).callsToAction, []);
  });

  await t.test("a submission does not suppress the voting reminder; only this player's current vote does", async () => {
    const db = client.db("vote-reminders");
    const now = new Date("2026-11-10T05:00:00.000Z");
    await db.collection("metadata").insertOne({
      _id: "forgery-contest-state", cycle_id: cycleId, next_settlement_at: cycleId,
    });
    await db.collection("forgery_contest_entries").insertOne({
      _id: "entered", cycle_id: cycleId, player_id: "viewer", pending: false,
    });
    await db.collection("forgery_contest_votes").insertMany([
      { _id: "other-vote", cycle_id: cycleId, player_id: "other" },
      { _id: "old-vote", cycle_id: "2026-11-03T17:00:00.000Z", player_id: "viewer" },
    ]);
    const view = await getDailyEventAttention(db, "viewer", now);
    assert.equal(view.callsToAction[0]?.label, "Vote");
    assert.equal(view.callsToAction[0]?.expiresAt, cycleId);
    assert.equal(view.nextRefreshAt, cycleId);
    await db.collection("forgery_contest_votes").insertOne({
      _id: "voted", cycle_id: cycleId, player_id: "viewer",
    });
    assert.deepEqual((await getDailyEventAttention(db, "viewer", now)).callsToAction, []);
  });

  await t.test("reminders switch at midnight/noon, and stale previous-round entries do not hide Wednesday's entry CTA", async () => {
    const db = client.db("reminder-boundaries");
    await db.collection("metadata").insertOne({
      _id: "forgery-contest-state", cycle_id: cycleId, next_settlement_at: cycleId,
    });
    await db.collection("forgery_contest_entries").insertOne({
      _id: "old-entry", cycle_id: cycleId, player_id: "viewer", pending: false,
    });
    for (const [time, player, label] of [
      ["2026-11-10T04:59:59.999Z", "new-player", "Enter"],
      ["2026-11-10T05:00:00.000Z", "viewer", "Vote"],
      ["2026-11-10T16:59:59.999Z", "viewer", "Vote"],
      ["2026-11-10T17:00:00.000Z", "viewer", undefined],
      ["2026-11-11T04:59:59.999Z", "viewer", undefined],
      ["2026-11-11T05:00:00.000Z", "viewer", "Enter"],
      ["2026-10-06T03:59:59.999Z", "new-player", "Enter"],
      ["2026-10-06T04:00:00.000Z", "new-player", "Vote"],
      ["2026-10-06T16:00:00.000Z", "new-player", undefined],
    ] as const) {
      assert.equal((await getDailyEventAttention(db, player, new Date(time))).callsToAction[0]?.label, label, time);
    }
    await db.collection("metadata").updateOne(
      { _id: "forgery-contest-state" },
      { $set: { settlement_lock: { expires_at: "2026-11-11T05:05:00.000Z" } } },
    );
    assert.deepEqual((await getDailyEventAttention(db, "viewer", new Date("2026-11-11T05:01:00.000Z"))).callsToAction, []);
    assert.equal((await getDailyEventAttention(db, "viewer", new Date("2026-11-11T05:05:00.000Z"))).callsToAction[0]?.label, "Enter");
  });

  await t.test("Friday reminders honor the local day and this player's weekly claim", async () => {
    const db = client.db("crate-reminders");
    const friday = new Date("2026-11-13T05:00:00.000Z");
    const weekKey = getDailyEventWeekKey(friday);
    await db.collection("daily_event_claims").insertMany([
      { _id: `friday-crate:${weekKey}:other`, status: "completed" },
      { _id: "friday-crate:2026-11-01:viewer", status: "completed" },
    ]);
    const crateAction = async (time: Date) =>
      (await getDailyEventAttention(db, "viewer", time)).callsToAction.find(action => action.day === 5);
    assert.equal(await crateAction(new Date(friday.getTime() - 1)), undefined);
    assert.equal((await crateAction(friday))?.label, "Claim");
    assert.equal((await crateAction(friday))?.expiresAt, "2026-11-14T05:00:00.000Z");
    await db.collection("daily_event_claims").insertOne({
      _id: `friday-crate:${weekKey}:viewer`, status: "completed",
    });
    assert.equal(await crateAction(friday), undefined);
    await db.collection("daily_event_claims").deleteOne({ _id: `friday-crate:${weekKey}:viewer` });
    assert.equal((await crateAction(new Date("2026-11-14T04:59:59.999Z")))?.label, "Claim");
    assert.equal(await crateAction(new Date("2026-11-14T05:00:00.000Z")), undefined);
  });

  await t.test("a live auction lights Wednesday even on other days and between lots; stopping it clears the CTA", async () => {
    const db = client.db("auction-reminders");
    const now = new Date("2026-11-10T18:00:00.000Z");
    assert.deepEqual((await getDailyEventAttention(db, "viewer", now)).callsToAction, []);
    await db.collection("metadata").insertOne({
      _id: "live-auction-event", live: true, hidden: true, current_item_id: null,
    });
    const view = await getDailyEventAttention(db, "viewer", now);
    assert.equal(view.currentDay, 2);
    assert.deepEqual(view.callsToAction.map(({ day, label }) => ({ day, label })), [{ day: 3, label: "Live" }]);
    await db.collection("metadata").updateOne({ _id: "live-auction-event" }, { $set: { live: false } });
    assert.deepEqual((await getDailyEventAttention(db, "viewer", now)).callsToAction, []);
  });
});

test("calendar CTA labels select the correct day and disappear when their actions are cleared", async () => {
  const text = await readFile(new URL("../components/daily-events-panel.tsx", import.meta.url), "utf8");
  const source = ts.createSourceFile("daily-events-panel.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "DailyEventsPanel")!;
  const days = source.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(node => node.name.getText(source) === "DAYS"))!;
  let selectedDay = 0;
  let stateIndex = 0;
  const panel = runInNewContext(`${ts.transpileModule(`${days.getText(source)}\n${declaration.getText(source)}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText}\nDailyEventsPanel`, {
    exports: {}, React, useRouter: () => ({}), CopyEvent: () => null,
    useState: (initial: unknown) => [stateIndex++ === 0 ? selectedDay : initial, (value: number) => { selectedDay = value; }],
  }) as (props: Record<string, unknown>) => React.ReactElement;
  function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
    return React.Children.toArray(node).flatMap(child =>
      React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...elements(child.props.children)] : [],
    );
  }
  const actions = [
    { day: 2, label: "Vote", description: "Cast your Duper Tuesday vote" },
    { day: 3, label: "Live", description: "Join the live auction" },
    { day: 5, label: "Claim", description: "Claim your free Ultimate crate" },
  ];
  const render = (callsToAction: typeof actions) => {
    stateIndex = 0;
    return elements(panel({ callsToAction, currentDay: 0, impersonating: false }));
  };
  const tabs = render(actions).filter(child => child.props.role === "tab");
  for (const action of actions) {
    const tab = tabs[action.day];
    assert.ok(String(tab.props["aria-label"]).includes(action.description));
    assert.ok(elements(tab).some(child => child.props.className === "daily-event-cta" && child.props.children === action.label));
    (tab.props.onClick as () => void)();
    assert.equal(selectedDay, action.day);
  }
  selectedDay = 0;
  assert.ok(!render([]).some(child => child.props.className === "daily-event-cta"));
});
