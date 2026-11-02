import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { createElement, type ReactElement } from "react";
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
    if (["next/link", "../action-button/action-button", "../icon-button/icon-button"].includes(name)) {
      return { default: () => null };
    }
    return require(name);
  },
}) as (props: {
  bankBalance: number;
  auctionEscrow: number;
  karma: number;
  lotteryTickets: number;
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
