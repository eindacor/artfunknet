import assert from "node:assert/strict";
import test from "node:test";

import {
  hashPassword,
  validatePassword,
  verifyPassword,
} from "./password.ts";

test("hashes passwords with unique salts and verifies the correct password", async () => {
  const first = await hashPassword("a sufficiently long password");
  const second = await hashPassword("a sufficiently long password");

  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(
    await verifyPassword(
      "a sufficiently long password",
      first.salt,
      first.hash,
    ),
    true,
  );
  assert.equal(
    await verifyPassword("the wrong password", first.salt, first.hash),
    false,
  );
});

test("validates password length limits and malformed stored hashes", async () => {
  assert.match(validatePassword("too short") ?? "", /at least 12/);
  assert.equal(validatePassword("long enough password"), null);
  assert.match(validatePassword("x".repeat(129)) ?? "", /no more than 128/);
  assert.equal(await verifyPassword("password", "", ""), false);
});
