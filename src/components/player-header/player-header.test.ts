import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const source = await readFile(new URL("./player-header.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const require = createRequire(import.meta.url);
const PlayerHeader = runInNewContext(`${compiled}\nexports.default`, {
  exports: {},
  require: (name: string) => {
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

test("the header shows debt in red without changing positive or zero balances", () => {
  for (const bankBalance of [-300_000, 0, 300_000]) {
    const html = renderToStaticMarkup(createElement(PlayerHeader, {
      bankBalance, auctionEscrow: 0, karma: 0, lotteryTickets: 0,
      onSignOut: () => {},
    }));
    const balance = html.match(/<span class="([^"]*)" aria-label="Available bank balance [^"]*">([^<]*)<\/span>/)!;
    assert.ok(balance);
    assert.equal(balance[2], `$${bankBalance.toLocaleString()}`);
    assert.equal(balance[1].includes("bank-balance-negative"), bankBalance < 0);
    assert.equal(balance[1].includes("text-[#222]"), bankBalance >= 0);
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
