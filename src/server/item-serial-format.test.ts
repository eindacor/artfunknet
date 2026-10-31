import assert from "node:assert/strict";
import test from "node:test";

import {
  createRandomForgerySerial,
  formatItemSerialNumber,
  getArtworkSerialPrefix,
  parseItemSerialNumber,
} from "./item-serial-format.ts";

const artworkId = "00000002e916001122334455";

test("serials derive a decimal prefix from twelve hex characters and pad, not truncate, counters", () => {
  assert.equal(getArtworkSerialPrefix(artworkId), 190742);
  assert.equal(formatItemSerialNumber(artworkId, 45), "190742-000045");
  assert.equal(formatItemSerialNumber(artworkId, 0), "190742-000000");
  assert.equal(formatItemSerialNumber(artworkId, 1_000_000), "190742-1000000");
  assert.equal(formatItemSerialNumber(artworkId, undefined), "Not assigned");
  assert.equal(getArtworkSerialPrefix("ffffffffffff001122334455"), 281474976710655);
  assert.equal(getArtworkSerialPrefix("hello"), Number.parseInt("d84680aabd0b", 16));
  assert.equal(formatItemSerialNumber(artworkId, 7, 42), "42-000007");
});

test("forgeries can edit both numeric parts but cannot use the Original-only zero suffix", () => {
  assert.deepEqual(parseItemSerialNumber("00042-000007"), { serial_prefix: 42, serial_number: 7 });
  assert.deepEqual(parseItemSerialNumber("0-000001"), { serial_prefix: 0, serial_number: 1 });
  for (const invalid of [
    "", "0-000000", "190742-0", "abc-123", "12--1", "1.5-7", "1e3-4", "1-9007199254740992",
    "9007199254740992-1", "<b>1</b>-1", "1-1-extra", `${"0".repeat(64)}-1`, null,
  ]) {
    assert.equal(parseItemSerialNumber(invalid), null);
  }
});

test("default forged serials use the real artwork prefix with an independent six-digit random suffix", () => {
  assert.deepEqual(createRandomForgerySerial(artworkId, () => 0), {
    serial_prefix: 190742, serial_number: 1,
  });
  assert.deepEqual(createRandomForgerySerial(artworkId, () => 0.999999), {
    serial_prefix: 190742, serial_number: 999999,
  });
});
