import assert from "node:assert/strict";
import test from "node:test";

import {
  createPlayerAccountRecord,
  normalizePlayerEmail,
  normalizeScreenName,
} from "./player-account.ts";

test("normalizes valid player email addresses and names", () => {
  assert.equal(normalizePlayerEmail(" Player@Example.COM "), "player@example.com");
  assert.equal(normalizeScreenName("Gallery-Owner"), "Gallery-Owner");
  assert.equal(normalizeScreenName("Mårten_42"), "Mårten_42");
});

test("rejects invalid player email addresses and names", () => {
  assert.equal(normalizePlayerEmail("not-an-email"), null);
  assert.equal(normalizePlayerEmail("a@b"), null);
  assert.equal(normalizeScreenName("ab"), null);
  assert.equal(normalizeScreenName("Gallery Owner"), null);
  assert.equal(normalizeScreenName("<script>"), null);
  assert.equal(normalizeScreenName("artfunkel"), null);
  assert.equal(normalizeScreenName("ARTFUNKEL"), null);
});

test("creates a new player with the standard starting profile", () => {
  const now = new Date("2026-09-04T12:00:00.000Z");
  const player = createPlayerAccountRecord({
    email: "player@example.com",
    screenName: "Player-One",
    passwordSalt: "salt",
    passwordHash: "hash",
    now,
    playerId: "0123456789abcdef01234567",
  });

  assert.equal(player._id, "0123456789abcdef01234567");
  assert.equal(player.profile.screen_name, "Player-One");
  assert.equal(player.profile.bank_balance, 100_000);
  assert.equal(player.profile.level, 0);
  assert.equal(player.profile.last_drop, "2026-09-03T12:00:00.000Z");
});
