import assert from "node:assert/strict";
import test from "node:test";

import {
  findItemReferences,
  getGalleryChatExpiration,
  getGalleryChatReportUpdate,
  getVisibleGalleryChatFilter,
  isGalleryChatEmote,
  tokenizeChatContent,
  type GalleryChatItemReference,
} from "./gallery-chat-core.ts";

const players = [
  { _id: "short", screen_name: "Art" },
  { _id: "long", screen_name: "Art Fan" },
  { _id: "space", screen_name: "Gallery Guest" },
];

const item: GalleryChatItemReference = {
  _id: "item-1",
  artwork_id: "artwork-1",
  artwork: {
    title: "The Test Work",
    artist: "Test Artist",
    rarity: "rare",
  },
  values: { actual: 425 },
};

test("chat expiration is seven days after creation", () => {
  const createdAt = new Date("2026-04-01T12:30:00.000Z");
  assert.equal(
    getGalleryChatExpiration(createdAt).toISOString(),
    "2026-04-08T12:30:00.000Z",
  );
});

test("chat emotes use the supported fixed vocabulary", () => {
  assert.equal(isGalleryChatEmote("heart"), true);
  assert.equal(isGalleryChatEmote("wow"), true);
  assert.equal(isGalleryChatEmote("custom"), false);
  assert.equal(isGalleryChatEmote(1), false);
});

test("visible chat excludes hidden and expired unreported messages", () => {
  const now = new Date("2026-04-08T12:30:00.000Z");
  assert.deepEqual(getVisibleGalleryChatFilter("gallery-1", now), {
    gallery_owner_id: "gallery-1",
    hidden: { $ne: true },
    $or: [{ reported: true }, { expires_at: { $gt: now } }],
  });
});

test("reporting preserves a message by removing its expiration", () => {
  const reportedAt = new Date("2026-04-02T10:00:00.000Z");
  assert.deepEqual(getGalleryChatReportUpdate("reporter-1", reportedAt), {
    $set: { reported: true, reported_at: reportedAt },
    $addToSet: { reporter_ids: "reporter-1" },
    $unset: { expires_at: "" },
  });
});

test("item references accept relative and absolute URLs", () => {
  assert.deepEqual(
    findItemReferences(
      "See /items/item-1 and https://artfunkel.example/items/item_2?view=full",
    ).map((reference) => reference.itemId),
    ["item-1", "item_2"],
  );
});

test("chat tokens preserve text, longest player names, and item previews", () => {
  const tokens = tokenizeChatContent(
    "Hi @Art Fan and @Gallery Guest: /items/item-1",
    players,
    new Map([[item._id, item]]),
  );

  assert.deepEqual(tokens, [
    { kind: "text", text: "Hi " },
    {
      kind: "player",
      text: "@Art Fan",
      playerId: "long",
      screenName: "Art Fan",
    },
    { kind: "text", text: " and " },
    {
      kind: "player",
      text: "@Gallery Guest",
      playerId: "space",
      screenName: "Gallery Guest",
    },
    { kind: "text", text: ": " },
    {
      kind: "item",
      text: "/items/item-1",
      item: {
        id: "item-1",
        artworkId: "artwork-1",
        title: "The Test Work",
        artist: "Test Artist",
        rarity: "rare",
        value: 425,
      },
    },
  ]);
});

test("mentions require a complete player name boundary", () => {
  const tokens = tokenizeChatContent(
    "@Artist is not a mention, but @Art is.",
    players,
    new Map(),
  );
  assert.deepEqual(
    tokens.filter((token) => token.kind === "player"),
    [
      {
        kind: "player",
        text: "@Art",
        playerId: "short",
        screenName: "Art",
      },
    ],
  );
});
