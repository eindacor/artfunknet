import assert from "node:assert/strict";
import test from "node:test";

import { redactPlayerMetadata } from "./player-account-admin.ts";

test("player metadata redacts credentials while retaining account fields", () => {
  const result = redactPlayerMetadata({
    _id: "player-1",
    email: "player@example.com",
    password_hash: "hash",
    password_updated_at: new Date("2026-10-10T12:00:00.000Z"),
    profile: {
      level: 12,
      vintage_operation: {
        token: "secret-token",
        expires_at: "2026-10-11T12:00:00.000Z",
      },
    },
    patreon: {
      tier_name: "Legendary Tier",
      oauth: {
        encrypted_tokens: "encrypted",
        access_token_expires_at: new Date("2026-10-12T12:00:00.000Z"),
      },
    },
  });

  assert.deepEqual(result, {
    _id: "player-1",
    email: "player@example.com",
    password_hash: "[redacted]",
    password_updated_at: "2026-10-10T12:00:00.000Z",
    profile: {
      level: 12,
      vintage_operation: {
        token: "[redacted]",
        expires_at: "2026-10-11T12:00:00.000Z",
      },
    },
    patreon: {
      tier_name: "Legendary Tier",
      oauth: {
        encrypted_tokens: "[redacted]",
        access_token_expires_at: "2026-10-12T12:00:00.000Z",
      },
    },
  });
});
