import assert from "node:assert/strict";
import test from "node:test";

import type { HydratedGameItem } from "./item-artwork.ts";
import { serializeGameClientItem } from "./game-client-item.ts";

test("serializes native-client image paths and artwork dimensions", () => {
  const item = {
    _id: "item-1",
    artwork_id: "artwork-1",
    status: "displayed",
    condition: 0.87,
    foil: true,
    artwork: {
      _id: "artwork-1",
      title: "Example",
      artist: "Artist",
      rarity: "rare",
      width: 120,
      height: 80,
    },
  } as HydratedGameItem;

  assert.deepEqual(serializeGameClientItem(item), {
    id: "item-1",
    artworkId: "artwork-1",
    title: "Example",
    artist: "Artist",
    rarity: "rare",
    status: "displayed",
    condition: 0.87,
    foil: true,
    artworkWidth: 120,
    artworkHeight: 80,
    cardImagePath: "/api/artwork/artwork-1/image?variant=card",
    thumbnailImagePath: "/api/artwork/artwork-1/image?variant=thumb",
  });

});

test("native clients reuse versioned artwork image paths when image metadata is available", () => {
  const checksum = "a".repeat(64);
  const item = {
    _id: "item",
    artwork_id: "art",
    artwork: { image: { variants: { card: { checksum }, thumb: { checksum } } } },
  } as HydratedGameItem;
  const result = serializeGameClientItem(item);
  assert.equal(result.cardImagePath, `/api/artwork/art/image?variant=card&v=${checksum}`);
  assert.equal(result.thumbnailImagePath, `/api/artwork/art/image?variant=thumb&v=${checksum}`);
});
