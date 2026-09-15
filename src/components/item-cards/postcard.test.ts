import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_POSTCARD_TEMPLATE,
  formatPostcardParagraph,
  resolvePostcardPlayerName,
} from "./postcard.ts";

test("resolvePostcardPlayerName resolves player screen name first", () => {
  assert.equal(
    resolvePostcardPlayerName("Joseph", "player_123"),
    "Joseph",
  );
  assert.equal(
    resolvePostcardPlayerName("  Joseph  ", "player_123"),
    "Joseph",
  );
});

test("resolvePostcardPlayerName falls back to valid item owner when screen name is absent", () => {
  assert.equal(
    resolvePostcardPlayerName(null, "player_123"),
    "player_123",
  );
  assert.equal(
    resolvePostcardPlayerName(undefined, "Alice"),
    "Alice",
  );
});

test("resolvePostcardPlayerName falls back to 'friend' when owner is unknown or missing", () => {
  assert.equal(
    resolvePostcardPlayerName(null, "unknown"),
    "friend",
  );
  assert.equal(
    resolvePostcardPlayerName(undefined, ""),
    "friend",
  );
  assert.equal(
    resolvePostcardPlayerName(undefined, undefined),
    "friend",
  );
});

test("formatPostcardParagraph formats with DEFAULT_POSTCARD_TEMPLATE", () => {
  const paragraph = formatPostcardParagraph(DEFAULT_POSTCARD_TEMPLATE, {
    playerName: "Joseph",
    medium: "Oil on canvas",
    date: 1889,
  });
  assert.equal(
    paragraph,
    "Hey, Joseph, this is Oil on canvas and it was made in 1889.",
  );
});

test("formatPostcardParagraph supports custom templates with bracket or angle placeholders", () => {
  const custom1 = formatPostcardParagraph(
    "Dear <player_name>: Greetings! This piece is <medium>, crafted in <date>.",
    {
      playerName: "Collector",
      medium: "Etching",
      date: "ca. 1650",
    },
  );
  assert.equal(
    custom1,
    "Dear Collector: Greetings! This piece is Etching, crafted in ca. 1650.",
  );

  const custom2 = formatPostcardParagraph(
    "To {player_name}: {medium} ({date})",
    {
      playerName: "ArtLover",
      medium: "Watercolor",
      date: "1910",
    },
  );
  assert.equal(custom2, "To ArtLover: Watercolor (1910)");
});
