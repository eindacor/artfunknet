import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import { getItemDisposalPermission } from "./item-permissions.ts";
import {
  MAX_ITEM_TAG_LENGTH,
  MAX_ITEM_TAGS,
  normalizeItemTags,
  parseItemTagInput,
} from "./item-tags.ts";

test("item tags are normalized, deduplicated, and empty tags are removed", () => {
  assert.deepEqual(
    normalizeItemTags([" Primary ", "primary", "", "For   Sale"]),
    {
      ok: true,
      tags: ["primary", "for sale"],
    },
  );
  assert.deepEqual(parseItemTagInput("primary, to auction, foils"), [
    "primary",
    "to auction",
    "foils",
  ]);
});

test("item tag limits reject oversized values", () => {
  assert.equal(
    normalizeItemTags(["x".repeat(MAX_ITEM_TAG_LENGTH + 1)]).ok,
    false,
  );
  assert.equal(
    normalizeItemTags(
      Array.from({ length: MAX_ITEM_TAGS + 1 }, (_, index) => `tag-${index}`),
    ).ok,
    false,
  );
});

const source = ts.createSourceFile(
  "item-tags-dialog.tsx",
  await readFile(new URL("../components/item-tags-dialog.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
);
const dialog = source.statements.find(
  (statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === "ItemTagsDialog",
)!;
const handlers = ts.transpileModule(
  dialog.body!.statements.filter(
    statement => ts.isFunctionDeclaration(statement) &&
      ["addTags", "saveTags"].includes(statement.name?.text ?? ""),
  ).map(statement => statement.getText(source)).join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

test("the tag editor rejects sale tags for protected works before changing tags or sending requests", async () => {
  for (const flags of [
    { status: "displayed", permanent: false },
    { status: "claimed", permanent: true },
    { status: "displayed", permanent: true },
  ] as const) {
    for (const handler of ["addTags", "saveTags"]) {
      const errors: string[] = [];
      const work = { ...flags, original: false, tags: [], artwork: { title: "Work" } };
      const forbidden = () => assert.fail("A protected sale-tag action must stop before making changes.");
      await runInNewContext(`${handlers}\n${handler}()`, {
        getItemDisposalPermission, normalizeItemTags, parseItemTagInput,
        items: [work], addedTags: [], removedTags: [], tagInput: "for SALE",
        setError: (message: string) => errors.push(message),
        setAddedTags: forbidden, setRemovedTags: forbidden,
        setTagInput: forbidden, setSaving: forbidden, fetch: forbidden,
      });
      assert.deepEqual(errors, [getItemDisposalPermission(work, "collector-sale").reason]);
    }
  }
});

test("the tag editor still saves ordinary tags and removes legacy sale tags from protected works", async () => {
  const saved: string[][] = [];
  let message = "";
  await runInNewContext(`${handlers}\nsaveTags()`, {
    getItemDisposalPermission, normalizeItemTags, parseItemTagInput,
    items: [{ _id: "work", status: "displayed", permanent: true, tags: ["for sale", "old"] }],
    addedTags: ["favorite"], removedTags: ["for sale"], tagInput: "",
    setSaving: () => {},
    setError: (error: string) => { if (error) assert.fail(error); },
    onSaved: (notice: string) => { message = notice; },
    fetch: async (_url: string, request: { body: string }) => {
      const { tags } = JSON.parse(request.body) as { tags: string[] };
      saved.push(tags);
      return Response.json({ tags });
    },
  });
  assert.deepEqual(saved, [["old", "favorite"]]);
  assert.equal(message, "Tags updated for 1 item.");
});
