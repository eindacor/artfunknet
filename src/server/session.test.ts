import assert from "node:assert/strict";
import test from "node:test";

import { getBearerToken } from "./authorization.ts";

test("getBearerToken accepts a case-insensitive Bearer scheme", () => {
  assert.equal(getBearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(getBearerToken("bearer token"), "token");
});

test("getBearerToken rejects malformed authorization values", () => {
  assert.equal(getBearerToken(null), null);
  assert.equal(getBearerToken("Basic credentials"), null);
  assert.equal(getBearerToken("Bearer"), null);
  assert.equal(getBearerToken("Bearer token extra"), null);
});
