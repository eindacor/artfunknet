import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { SOCIAL_BATTERY_MAX } from "../../server/social-battery.ts";

const source = await readFile(new URL("./player-header.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const require = createRequire(import.meta.url);
const menuSource = await readFile(new URL("../responsive-menu.tsx", import.meta.url), "utf8");
const ResponsiveMenu = runInNewContext(`${ts.transpileModule(menuSource, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText}\nexports.default`, { exports: {}, require }) as typeof import("../responsive-menu.tsx").default;
const PlayerHeader = runInNewContext(`${compiled}\nexports.default`, {
  exports: {},
  require: (name: string) => {
    if (name === "../responsive-menu") return { default: ResponsiveMenu };
    if (name === "next/link") {
      return { default: (props: { href: string; children: ReactNode }) => createElement("a", props) };
    }
    if (["../action-button/action-button", "../icon-button/icon-button"].includes(name)) {
      return { default: () => null };
    }
    return require(name);
  },
}) as (props: {
  bankBalance: number;
  auctionEscrow: number;
  karma: number;
  lotteryTickets: number;
  isArtist?: boolean;
  onSignOut: () => void;
}) => ReactElement;

const toolbarSource = await readFile(new URL("../player-dashboard-toolbar.tsx", import.meta.url), "utf8");
const PlayerDashboardToolbar = runInNewContext(`${ts.transpileModule(toolbarSource, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText}\nexports.default`, {
  exports: {}, require: (name: string) => {
    if (name === "./responsive-menu") return { default: ResponsiveMenu };
    if (name === "./progress-bar/progress-bar") return { default: () => null };
    if (name === "@/server/social-battery") return { SOCIAL_BATTERY_MAX };
    return require(name);
  },
}) as typeof import("../player-dashboard-toolbar.tsx").default;

test("the header shows debt in red without changing positive or zero balances", () => {
  for (const bankBalance of [-300_000, 0, 300_000]) {
    const html = renderToStaticMarkup(createElement(PlayerHeader, {
      bankBalance, auctionEscrow: 0, karma: 0, lotteryTickets: 0,
      onSignOut: () => {},
    }));
    const balance = html.match(/<span class="([^"]*)" aria-label="Available bank balance [^"]*"[^>]*>([^<]*)<\/span>/)!;
    assert.ok(balance);
    assert.equal(balance[2], `$${bankBalance.toLocaleString()}`);
    assert.equal(balance[1].includes("bank-balance-negative"), bankBalance < 0);
    assert.equal(balance[1].includes("text-[#222]"), bankBalance >= 0);
  }
});

test("the header exposes a collapsed, labeled account menu without duplicating resource information", () => {
  const html = renderToStaticMarkup(createElement(PlayerHeader, {
    bankBalance: 1200, auctionEscrow: 200, karma: 50, lotteryTickets: 3, onSignOut: () => {},
  }));
  assert.match(html, /aria-expanded="false" aria-label="Account menu"/);
  assert.match(html, /data-label="Balance"/);
  assert.match(html, /data-label="Karma"/);
  assert.match(html, /data-label="Tickets"/);
  assert.equal((html.match(/Available bank balance/g) ?? []).length, 1);
});

test("the responsive dashboard retains all destinations, counts, and accessible progress values", () => {
  for (const isMaxLevel of [false, true]) {
    const html = renderToStaticMarkup(createElement(PlayerDashboardToolbar, {
      archiveCount: 123, level: 50, isMaxLevel, offerCount: 9, questCount: 2,
      section: "loot", socialBattery: 0, xp: 240, xpGoal: 1000, onSelect: () => {},
    }));
    assert.match(html, /aria-expanded="false" aria-label="Offers menu"/);
    for (const label of ["Home", "Visit Galleries", "Offers", "Quests", "Auction House", "Archive", "Daily Events", "Social", "Legacy"]) {
      assert.ok(html.includes(`<span>${label}</span>`), label);
    }
    assert.match(html, /aria-current="page" class="current"/);
    assert.match(html, /> \(9\)<\/button>/);
    assert.match(html, /> \(123\)<\/button>/);
    assert.match(html, /aria-valuemax="1000" aria-valuemin="0" aria-valuenow="240" role="progressbar"/);
    assert.match(html, /aria-valuenow="0" class="social-battery-meter" role="progressbar"/);
    assert.equal(html.includes("Next lottery ticket"), isMaxLevel);
    assert.equal(html.includes("xp-reward-icon fa fa-ticket"), isMaxLevel);
  }
});

test("compact progress figures abbreviate large totals without changing exact values or progress", () => {
  for (const { xp, xpGoal, socialBattery, compactXp, compactBattery } of [
    { xp: 999, xpGoal: 1000, socialBattery: 0, compactXp: "999/1k", compactBattery: "0/6k" },
    { xp: 123456, xpGoal: 987654, socialBattery: 3456, compactXp: "123.5k/987.7k", compactBattery: "3.5k/6k" },
    { xp: 999950, xpGoal: 2000000, socialBattery: 6000, compactXp: "1m/2m", compactBattery: "6k/6k" },
  ]) {
    const html = renderToStaticMarkup(createElement(PlayerDashboardToolbar, {
      archiveCount: 0, level: 25, isMaxLevel: false, offerCount: 0, questCount: 0,
      section: "collection", xp, xpGoal, socialBattery, onSelect: () => {},
    }));
    assert.deepEqual([...html.matchAll(/<span class="dashboard-resource-value-compact">([^<]+)<\/span>/g)]
      .map(match => match[1]), [compactXp, compactBattery]);
    assert.ok(html.includes(`<strong title="${xp.toLocaleString()} / ${xpGoal.toLocaleString()} XP">`));
    assert.ok(html.includes(`<strong title="${socialBattery.toLocaleString()} / ${SOCIAL_BATTERY_MAX.toLocaleString()}">`));
    assert.ok(html.includes(`aria-valuemax="${xpGoal}" aria-valuemin="0" aria-valuenow="${xp}" role="progressbar"`));
    assert.ok(html.includes(`aria-valuenow="${socialBattery}" class="social-battery-meter" role="progressbar"`));
  }
});

test("the authenticated navbar exposes a labeled artist studio link only for artist/player accounts", async () => {
  const wrapperSource = await readFile(new URL("../../app/play/player-header.tsx", import.meta.url), "utf8");
  const wrapperCode = ts.transpileModule(wrapperSource, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const wrapper = runInNewContext(`${wrapperCode}\nexports.default`, {
    exports: {},
    require: (name: string) => {
      if (name === "@/components/player-header/player-header") return { default: PlayerHeader };
      if (name === "next/navigation") return { useRouter: () => ({ replace() {}, refresh() {} }) };
      if (["./notification-center", "@/components/tutorial-dialog/tutorial-dialog", "@/components/supporter-prompt-dialog"].includes(name)) {
        return { default: () => null };
      }
      if (name === "next/link") return { default: (props: { href: string; children: ReactNode }) => createElement("a", props) };
      return require(name);
    },
  }) as typeof import("../../app/play/player-header.tsx").default;
  for (const isArtist of [undefined, false, true]) {
    const html = renderToStaticMarkup(createElement(wrapper, {
      isArtist, impersonating: false, bankBalance: 1000, auctionEscrow: 0, karma: 0, lotteryTickets: 0,
    }));
    const studio = html.match(/<a\b[^>]*href="\/artist"[^>]*>[\s\S]*?<\/a>/)?.[0];
    assert.equal(Boolean(studio), isArtist === true);
    if (studio) {
      assert.match(studio, /Artist studio/);
      assert.match(studio, /aria-hidden="true" class="fa fa-paint-brush"/);
    }
  }
  assert.doesNotMatch(renderToStaticMarkup(createElement(wrapper, { anonymous: true })), /href="\/artist"|Artist studio/);
});
