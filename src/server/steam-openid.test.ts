import assert from "node:assert/strict";
import test from "node:test";

import {
  collectUniqueSteamOpenIdParameters,
  hasRequiredSteamSignedFields,
  isRecentSteamNonce,
} from "./steam-openid.ts";

test("accepts a recent Steam OpenID nonce", () => {
  const now = Date.parse("2026-09-04T03:30:00Z");
  assert.equal(
    isRecentSteamNonce("2026-09-04T03:25:00Zrandom-value", now),
    true,
  );
});

test("rejects stale, future, and malformed Steam OpenID nonces", () => {
  const now = Date.parse("2026-09-04T03:30:00Z");
  assert.equal(
    isRecentSteamNonce("2026-09-04T03:19:59Zstale", now),
    false,
  );
  assert.equal(
    isRecentSteamNonce("2026-09-04T03:31:01Zfuture", now),
    false,
  );
  assert.equal(isRecentSteamNonce("not-a-nonce", now), false);
});

test("rejects duplicate Steam OpenID parameters", () => {
  const parameters = new URLSearchParams();
  parameters.append("openid.claimed_id", "first");
  parameters.append("openid.claimed_id", "second");
  assert.equal(collectUniqueSteamOpenIdParameters(parameters), null);
});

test("requires identity and callback fields to be covered by the Steam signature", () => {
  const required =
    "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle";
  assert.equal(hasRequiredSteamSignedFields(required), true);
  assert.equal(
    hasRequiredSteamSignedFields(
      "signed,op_endpoint,identity,return_to,response_nonce,assoc_handle",
    ),
    false,
  );
});
