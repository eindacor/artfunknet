import assert from "node:assert/strict";
import test from "node:test";

import {
  getArtworkImageUrl,
  getArtworkImageVersion,
  type ArtworkImageMetadata,
} from "./artwork-image-url.ts";

const thumb = "a".repeat(64);
const card = "b".repeat(64);
const full = "c".repeat(64);
const image: ArtworkImageMetadata = {
  variants: { thumb: { checksum: thumb }, card: { checksum: card }, full: { checksum: full } },
};

test("artwork image URLs share stable content versions across thumbnail, card and texture consumers", () => {
  assert.equal(getArtworkImageUrl("artwork", "thumb", image), `/api/artwork/artwork/image?variant=thumb&v=${thumb}`);
  assert.equal(getArtworkImageUrl("artwork", "card", image), `/api/artwork/artwork/image?variant=card&v=${card}`);
  assert.equal(getArtworkImageUrl("artwork", "card", image, true), `/api/artwork/artwork/image?variant=card&v=${card}&texture=1`);
  assert.equal(getArtworkImageUrl("artwork", "full", image), `/api/artwork/artwork/image?variant=full&v=${full}`);
  const replacement = { variants: { ...image.variants, thumb: { checksum: "d".repeat(64) } } };
  assert.notEqual(getArtworkImageUrl("artwork", "thumb", replacement), getArtworkImageUrl("artwork", "thumb", image));
  assert.equal(getArtworkImageUrl("artwork", "card", replacement), getArtworkImageUrl("artwork", "card", image));
});

test("image version fallback matches the first available delivered variant, not another variant's checksum", () => {
  assert.equal(getArtworkImageVersion({ variants: { full: { checksum: full } } }, "thumb"), full);
  assert.equal(getArtworkImageVersion({ variants: { thumb: {}, card: { checksum: card } } }, "thumb"), undefined);
  assert.equal(getArtworkImageVersion({ variants: { card: { checksum: card.toUpperCase() } } }, "card"), card);
});

test("legacy and malformed versions use revalidating URLs and artwork IDs remain encoded", () => {
  for (const metadata of [undefined, { storage: { key: "legacy" } }, { variants: { thumb: { checksum: "2" } } }]) {
    assert.equal(getArtworkImageUrl("art /&?", "thumb", metadata), "/api/artwork/art%20%2F%26%3F/image?variant=thumb");
  }
});
